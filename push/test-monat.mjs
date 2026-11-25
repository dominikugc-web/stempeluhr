// Prüft Monatsnachweis per E-Mail ohne echtes Resend: node push/test-monat.mjs
import assert from 'node:assert/strict';
import worker from './worker.js';
import { mmPeriod, monthDue, monthAll } from './remind.mjs';

const tok = (sub, email) => [{ alg: 'none' }, { sub, email }].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.';
const store = new Map();   // KV nachgeahmt: key -> { value, metadata }
const SUBS = {
  get: async k => store.get(k)?.value ?? null,
  getWithMetadata: async k => ({ value: store.get(k)?.value ?? null, metadata: store.get(k)?.metadata ?? null }),
  put: async (k, value, o = {}) => { store.set(k, { value, metadata: o.metadata }); },
  delete: async k => { store.delete(k); },
  list: async ({ prefix }) => ({ keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }),
};
const mails = [];
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  throw new Error('unerwartet: ' + url);
};
const env = { DEV: '1', SUBS, RESEND_KEY: 'test' };
const call = (path, body, uid = 'nutzer1234', email = 'max@muster.de') =>
  worker.fetch(new Request('https://x' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok(uid, email) }, body: JSON.stringify(body) }), env);
const pdf = Buffer.from('%PDF-1.3 Test').toString('base64');
const send = async b => { const r = await call('/monat-senden', { an: 'chef@firma.de', name: 'Max Muster', pdf, ...b }); return [r.status, await r.json()]; };

// Zeitraum zum Versandtag: Tag 1 = Kalendermonat, sonst vom Tag des Vormonats bis zum Tag davor
assert.deepEqual(mmPeriod(1, '2026-11-25'), { von: '2026-10-01', bis: '2026-10-31' });
assert.deepEqual(mmPeriod(25, '2026-11-25'), { von: '2026-10-25', bis: '2026-11-24' });
assert.deepEqual(mmPeriod(25, '2026-11-24'), { von: '2026-09-25', bis: '2026-10-24' });
assert.deepEqual(mmPeriod(1, '2026-01-03'), { von: '2025-12-01', bis: '2025-12-31' });
assert.deepEqual(mmPeriod(15, '2026-03-15'), { von: '2026-02-15', bis: '2026-03-14' });

// Zwei Arbeitsplätze anmelden: Hauptjob am 1., Minijob am 25.
assert.equal((await call('/monat-an', { tz: 'Europe/Berlin', list: [{ k: 'main', day: 1, done: '2026-08-31' }, { k: 'p_mini', day: 25, done: '2026-09-24' }, { k: 'kaputt!', day: 3 }, { k: 'x', day: 31 }] })).status, 200);
assert.deepEqual(store.get('monat:nutzer1234').metadata, { tz: 'Europe/Berlin', e: { main: [1, '2026-08-31', ''], p_mini: [25, '2026-09-24', ''] } });

// Hauptjob: August schon erledigt, September geht raus (Kalendermonat)
assert.equal((await send({ k: 'main', von: '2026-08-01', bis: '2026-08-31' }))[1].schon, true);
assert.equal(mails.length, 0);
let [st, j] = await send({ k: 'main', von: '2026-09-01', bis: '2026-09-30', name: 'Max <Muster>' });
assert.equal(st, 200, JSON.stringify(j));
let m = mails.at(-1);
assert.deepEqual(m.to, ['chef@firma.de']);
assert.deepEqual(m.cc, ['max@muster.de']);
assert.equal(m.reply_to, 'max@muster.de');
assert.equal(m.bcc, undefined, 'keine Kopie an Dayliner');
assert.equal(m.subject, 'Arbeitszeitnachweis September 2026: Max Muster');
assert.equal(m.attachments[0].filename, 'Arbeitszeitnachweis_2026-09_Max_Muster.pdf');
assert.equal(m.attachments[0].content, pdf);
assert.match(m.text, /von Max Muster für September 2026 als PDF/);
assert.deepEqual(store.get('monat:nutzer1234').metadata.e.main, [1, '2026-09-30', '']);
assert.equal((await send({ k: 'main', von: '2026-09-01', bis: '2026-09-30' }))[1].schon, true, 'kein zweites Mal');
assert.equal((await send({ k: 'main', von: '2026-10-01', bis: '2026-10-05' }))[1].schon, true, 'höchstens einmal pro Woche');
assert.equal(mails.length, 1);

// Minijob mit Versandtag 25: Zeitraum 25.09. bis 24.10., Firma im Text
[st, j] = await send({ k: 'p_mini', an: 'lohn@cafe.de', von: '2026-09-25', bis: '2026-10-24', firma: 'Café Sonne' });
assert.equal(st, 200, JSON.stringify(j));
m = mails.at(-1);
assert.deepEqual(m.to, ['lohn@cafe.de']);
assert.equal(m.subject, 'Arbeitszeitnachweis 25.09.2026 bis 24.10.2026: Max Muster');
assert.match(m.text, /von Max Muster \(Café Sonne\) für den Zeitraum 25\.09\.2026 bis 24\.10\.2026/);
assert.equal(m.attachments[0].filename, 'Arbeitszeitnachweis_2026-09-25_bis_2026-10-24_Max_Muster.pdf');

// Abgelehnt: nicht eingerichteter Arbeitsplatz, laufender Zeitraum, verdreht, zu lang, falsche Adresse, kein PDF, ohne Anmeldung
const heute = new Date().toISOString().slice(0, 10);
assert.equal((await send({ k: 'p_andere', von: '2025-01-01', bis: '2025-01-31' }))[0], 400);
assert.equal((await send({ k: 'main', von: '2026-10-01', bis: heute }))[0], 400);
assert.equal((await send({ k: 'main', von: '2025-02-01', bis: '2025-01-31' }))[0], 400);
assert.equal((await send({ k: 'main', von: '2025-01-01', bis: '2025-04-30' }))[0], 400);
assert.equal((await send({ k: 'main', an: 'chef@firma', von: '2025-01-01', bis: '2025-01-31' }))[0], 400);
assert.equal((await send({ k: 'main', von: '2025-01-01', bis: '2025-01-31', pdf: 'abc' }))[0], 400);
assert.equal((await worker.fetch(new Request('https://x/monat-senden', { method: 'POST', body: '{}' }), env)).status, 401);

// Erinnerung am Versandtag ab 9 Uhr (Berlin, Winter UTC+1), je Arbeitsplatz einmal
const at = (mon, day, hh, mm) => Date.UTC(2026, mon - 1, day, hh - 1, mm);
const r0 = { tz: 'Europe/Berlin', e: { main: [1, '2026-10-31', ''], p_mini: [25, '2026-10-24', ''] } };
assert.equal(monthDue(r0, at(11, 25, 8, 55)), null, 'vor 9 Uhr nichts');
assert.deepEqual(monthDue(r0, at(11, 25, 9, 5)).due, [['p_mini', '2026-11-24']]);
assert.match(monthDue(r0, at(11, 25, 9, 5)).msg.body, /bis 24\.11\.2026/);
assert.deepEqual(monthDue(r0, at(12, 1, 9, 5)).due, [['main', '2026-11-30']]);
assert.equal(monthDue(r0, at(11, 26, 9, 5)), null, 'nur am Versandtag');
assert.equal(monthDue({ ...r0, e: { p_mini: [25, '2026-11-24', ''] } }, at(11, 25, 9, 5)), null, 'schon verschickt');
assert.equal(monthDue({ ...r0, e: { p_mini: [25, '2026-10-24', '2026-11-24'] } }, at(11, 25, 9, 5)), null, 'schon erinnert');
assert.match(monthDue({ ...r0, e: { a: [1, '', ''], b: [1, '', ''] } }, at(12, 1, 9, 5)).msg.body, /deine Nachweise/);

store.clear();
store.set('monat:a', { value: '', metadata: structuredClone(r0) });
store.set('monat:b', { value: '', metadata: { tz: 'Europe/Berlin', e: { main: [25, '2026-11-24', ''] } } });
const sent = [];
assert.equal(await monthAll(SUBS, async uid => { sent.push(uid); return 1; }, at(11, 25, 9, 5)), 0, 'nur jeder dritte Lauf');
assert.equal(await monthAll(SUBS, async uid => { sent.push(uid); return 1; }, at(11, 25, 9, 15)), 1);
assert.deepEqual(sent, ['a'], 'b hat den Zeitraum schon bekommen');
assert.deepEqual(store.get('monat:a').metadata.e.p_mini, [25, '2026-10-24', '2026-11-24']);
assert.equal(await monthAll(SUBS, async () => 1, at(11, 25, 9, 30)), 0, 'kein zweites Mal');
assert.equal(await monthAll(SUBS, async () => 1, at(11, 25, 13, 0)), 0, 'nach 12 Uhr nicht mehr');

// Ausschalten und Konto löschen räumen auf
await call('/monat-an', { tz: 'Europe/Berlin', list: [{ k: 'main', day: 1 }] });
assert.equal(store.has('monat:nutzer1234'), true);
await call('/monat-an', { list: [] });
assert.equal(store.has('monat:nutzer1234'), false);
await call('/monat-an', { list: [{ k: 'main', day: 1 }] });
await call('/forget', {});
assert.equal(store.has('monat:nutzer1234'), false);
console.log('Monatsnachweis: alles richtig');
