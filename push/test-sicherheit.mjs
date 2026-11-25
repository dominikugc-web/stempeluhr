// Prüft die Absicherungen des Push-Dienstes ohne echte Dienste: node push/test-sicherheit.mjs
// Pro-Prüfung auf dem Server, Beitritts- und Lohnabrechnungs-Push, Bremse beim Kündigen, Erstattung beim Abo.
import assert from 'node:assert/strict';
import worker from './worker.js';

const tok = (sub, email = sub + '@t.de') => [{ alg: 'none' }, { sub, email }].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.';
const subOf = t => JSON.parse(Buffer.from(String(t).replace('Bearer ', '').split('.')[1], 'base64url')).sub;
const store = new Map();
const SUBS = {
  get: async k => store.get(k)?.value ?? null,
  getWithMetadata: async k => ({ value: store.get(k)?.value ?? null, metadata: store.get(k)?.metadata ?? null }),
  put: async (k, value, o = {}) => { store.set(k, { value, metadata: o.metadata }); },
  delete: async k => { store.delete(k); },
  list: async ({ prefix }) => ({ keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }),
};
// Firestore nachgeahmt: was hier steht, darf der jeweilige Nutzer lesen
const docs = {
  'neuling0001:data/neuling0001': { fields: {} },
  'bewerber001:invites/ABC234': { fields: { cid: { stringValue: 'firma1' }, notify: { arrayValue: { values: [{ stringValue: 'chef0000001' }] } } } },
  'bewerber001:companies/firma1/members/bewerber001': { fields: { status: { stringValue: 'pending' } } },
  'fremder0001:invites/ABC234': { fields: { cid: { stringValue: 'firma1' } } },
  'chef0000001:data/mitarb00001': { fields: { cid: { stringValue: 'firma1' } } },
};
const mails = [], seen = [];
let charge = null;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return new Response('{}'); }
  if (u.includes('accounts:lookup')) return Response.json({ users: [{ createdAt: String(Date.parse('2026-11-24')) }] });   // neues Konto, kein Pro
  if (u.includes('firestore.googleapis.com')) {
    const path = u.split('/documents/')[1], key = subOf(init.headers.Authorization) + ':' + path; seen.push(key);
    return docs[key] ? Response.json(docs[key]) : new Response('{}', { status: 404 });
  }
  if (u.includes('api.stripe.com/v1/customers')) return Response.json({ data: [] });
  if (u.includes('api.stripe.com/v1/subscriptions')) return Response.json({ data: [{ status: 'active', items: { data: [{ current_period_start: 1764000000, current_period_end: 1766600000, price: { recurring: { interval: 'month' } } }] } }] });
  if (u.includes('api.stripe.com/v1/charges')) return Response.json({ data: charge ? [charge] : [] });
  throw new Error('unerwartet: ' + u);
};
const env = { DEV: '1', SUBS, RESEND_KEY: 'test', STRIPE_KEY: 'test' };
const call = (path, body, uid, ip = '1.2.3.4') => worker.fetch(new Request('https://x' + path, { method: 'POST',
  headers: { ...(uid ? { Authorization: 'Bearer ' + tok(uid) } : {}), 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env);

// Monatsnachweis nur mit Pro: neues Konto ohne Platz, Firma und Abo bekommt 403, Ausschalten geht immer
assert.equal((await call('/monat-an', { list: [{ k: 'main', day: 1 }] }, 'neuling0001')).status, 403, 'ohne Pro kein Monatsnachweis');
assert.equal((await call('/monat-senden', { k: 'main' }, 'neuling0001')).status, 403);
assert.equal((await call('/monat-an', { list: [] }, 'neuling0001')).status, 200, 'Ausschalten geht immer');

// Beitritts-Push: nur mit eigener offener Anfrage, Empfänger kommen aus der Einladung (nicht vom Absender)
assert.equal((await call('/notify', { kind: 'join', code: 'ABC234', to: ['opfer000001'], body: 'X' }, 'fremder0001')).status, 403, 'ohne Anfrage kein Push');
let r = await call('/notify', { kind: 'join', code: 'ABC234', to: ['opfer000001'], body: 'Max' }, 'bewerber001');
assert.equal(r.status, 200);
assert.ok(seen.includes('bewerber001:invites/ABC234') && seen.includes('bewerber001:companies/firma1/members/bewerber001'));
for (let i = 0; i < 4; i++) await call('/notify', { kind: 'join', code: 'ABC234', body: 'Max' }, 'bewerber001');
assert.equal((await call('/notify', { kind: 'join', code: 'ABC234', body: 'Max' }, 'bewerber001')).status, 429, 'höchstens 5 am Tag');

// Lohnabrechnungs-Push: nur wer die Daten des Empfängers lesen darf
assert.equal((await call('/notify', { kind: 'payslip', to: 'mitarb00001', body: 'November 2026' }, 'fremder0001')).status, 403);
assert.equal((await call('/notify', { kind: 'payslip', to: 'mitarb00001', body: 'November 2026' }, 'chef0000001')).status, 200);

// Kündigen ohne Anmeldung: Name bereinigt, Grund nicht in der Mail, höchstens 2 je Adresse am Tag und 5 je IP in der Stunde
r = await call('/kuendigen', { name: 'Max <b>Böse</b> https://evil.example', email: 'opfer@t.de', grund: 'Klick hier: https://evil.example' });
assert.equal(r.status, 200);
const m = mails.at(-1);
assert.ok(!m.text.includes('evil.example') && !m.text.includes('<'), 'kein Freitext und keine Links in der Mail');
assert.match(m.text, /^Hallo Max bBöseb httpsevilexample,/);
await call('/kuendigen', { name: 'A', email: 'opfer@t.de' });
assert.equal((await call('/kuendigen', { name: 'A', email: 'opfer@t.de' })).status, 429, 'je Adresse höchstens 2 am Tag');
for (const i of [1, 2]) await call('/kuendigen', { name: 'A', email: `x${i}@t.de` });
assert.equal((await call('/kuendigen', { name: 'A', email: 'y@t.de' })).status, 429, 'je IP höchstens 5 in der Stunde');
assert.equal((await call('/kuendigen', { name: 'A', email: 'z@t.de' }, null, '5.6.7.8')).status, 200, 'andere IP geht');

// Abo: voll erstattete Zahlung der laufenden Zeit nimmt Pro weg
store.set('kunde:zahler00001', { value: 'cus_1' });
charge = { refunded: false, created: 1764000100 };
assert.equal((await (await call('/abo', {}, 'zahler00001')).json()).aktiv, true);
charge = { refunded: true, created: 1764000100 };
assert.deepEqual(await (await call('/abo', {}, 'zahler00001')).json(), { aktiv: false, erstattet: true });
console.log('Sicherheit Push-Dienst: alles richtig');
