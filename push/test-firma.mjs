// Prüft das Firmen-Abo ohne echte Dienste: node push/test-firma.mjs
// Firestore und Stripe nachgeahmt. Die Stripe-Nachbildung prüft die gesendeten Angaben und führt Kunden, Preise und Abos.
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import worker from './worker.js';

const tok = sub => [{ alg: 'none' }, { sub, email: sub + '@test.de' }].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.';
const subOf = h => JSON.parse(Buffer.from(String(h).replace('Bearer ', '').split('.')[1], 'base64url')).sub;
const store = new Map();
const SUBS = { get: async k => store.get(k) ?? null, getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: null }), put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } };
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'dayliner-worker@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const env = { DEV: '1', SUBS, STRIPE_KEY: 'sk_test_x', RESEND_KEY: 'test', FB_SA: JSON.stringify(SA) };
const tokenCalls = [], writes = [];
const call = async (path, body, uid) => { const r = await worker.fetch(new Request('https://x' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok(uid) }, body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };

// Firestore: „uid:pfad“ -> Dokument, was fehlt, ist für diesen Nutzer gesperrt
const firma = (owner, created = new Date().toISOString()) => ({ fields: { name: { stringValue: 'Test GmbH' }, owner: { stringValue: owner }, created: { timestampValue: created } } });
let aktive = 2;
const liste = () => ({ documents: [...Array(aktive)].map(() => ({ fields: { status: { stringValue: 'active' } } })).concat({ fields: { status: { stringValue: 'pending' } } }) });
const docs = {
  'chef:companies/f1': firma('chef'), 'ma1:companies/f1': firma('chef'), 'chef:companies/f1/members': liste, 'ma1:data/ma1': { fields: { cid: { stringValue: 'f1' } } },
  'chefb:companies/f2': firma('chefb'), 'ma2:companies/f2': firma('chefb'), 'ma2:data/ma2': { fields: { cid: { stringValue: 'f2' } } },
  'chefb:companies/f3': firma('chefb'), 'chefc:companies/f4': firma('chefc', '2030-01-01T00:00:00Z'),
};
// Stripe: nur was der Dienst braucht
const S = { prices: [], customers: {}, subs: [], sessions: [] };
let n = 0;
const id = p => p + '_' + ++n;
function stripe(method, path, q) {
  const seg = path.split('/');
  if (path === 'prices' && method === 'GET') return { data: S.prices.filter(p => p.lookup_key === q.get('lookup_keys[]')) };
  if (path === 'prices') {
    assert.ok(q.get('currency') === 'eur' && q.get('recurring[interval]') === 'month' && +q.get('unit_amount') > 0 && q.get('product_data[name]') && q.get('lookup_key'));
    const p = { id: id('price'), lookup_key: q.get('lookup_key'), unit_amount: +q.get('unit_amount'), recurring: { interval: 'month' } };
    S.prices.push(p); return p;
  }
  if (path === 'customers') { const c = { id: id('cus'), email: q.get('email'), name: q.get('name'), metadata: { cid: q.get('metadata[cid]') } }; S.customers[c.id] = c; return c; }
  if (path === 'subscriptions' && method === 'GET') return { data: S.subs.filter(s => !q.get('customer') || s.customer === q.get('customer')), has_more: false };
  if (path === 'charges') return { data: [] };
  if (path === 'checkout/sessions') {
    assert.equal(q.get('mode'), 'subscription'); assert.ok(S.customers[q.get('customer')]);
    assert.equal(q.get('tax_id_collection[enabled]'), 'true'); assert.equal(q.get('customer_update[name]'), 'auto');
    assert.equal(q.get('billing_address_collection'), 'required'); assert.ok(q.get('custom_text[submit][message]').length <= 1200);
    const te = q.get('subscription_data[trial_end]'); if (te) assert.ok(+te * 1000 > Date.now() + 48 * 36e5, 'Stripe: trial_end mindestens 48 Std.');
    S.sessions.push(q); return { url: 'https://checkout.stripe.com/c/' + id('cs') };
  }
  if (path === 'billing_portal/sessions') return { url: 'https://billing.stripe.com/p/' + id('bps') };
  if (seg[0] === 'subscription_items') {
    if (seg[1]) {
      const s = S.subs.find(x => x.items.data.some(i => i.id === seg[1])), i = s.items.data.find(i => i.id === seg[1]);
      if (method === 'DELETE') { s.items.data = s.items.data.filter(x => x !== i); return { deleted: true }; }
      assert.ok(+q.get('quantity') > 0); i.quantity = +q.get('quantity'); return i;
    }
    const s = S.subs.find(x => x.id === q.get('subscription')), i = { id: id('si'), price: S.prices.find(p => p.id === q.get('price')), quantity: +q.get('quantity') };
    assert.ok(s && i.price && i.quantity > 0); s.items.data.push(i); return i;
  }
  throw new Error('Stripe unerwartet: ' + method + ' ' + path);
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host === 'oauth2.googleapis.com') {   // Google prüft die Signatur des Dienstkontos
    const jwt = new URLSearchParams(init.body).get('assertion'), [h, p, sig] = jwt.split('.');
    const v = createVerify('RSA-SHA256'); v.update(h + '.' + p);
    assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')), 'Signatur gültig');
    const c = JSON.parse(Buffer.from(p, 'base64url'));
    assert.equal(c.iss, SA.client_email); assert.equal(c.scope, 'https://www.googleapis.com/auth/datastore');
    tokenCalls.push(c); return Response.json({ access_token: 'sa-token', expires_in: 3600 });
  }
  if (u.host === 'firestore.googleapis.com' && init.method === 'PATCH') {
    assert.equal(init.headers.Authorization, 'Bearer sa-token'); assert.equal(u.searchParams.get('updateMask.fieldPaths'), 'paidUntil');
    const path = decodeURIComponent(u.pathname.split('/documents/')[1]), f = JSON.parse(init.body).fields;
    assert.deepEqual(Object.keys(f), ['paidUntil']);
    writes.push([path, Date.parse(f.paidUntil.timestampValue)]);
    for (const k of Object.keys(docs)) if (k.endsWith(':' + path)) docs[k].fields.paidUntil = f.paidUntil;
    return Response.json({});
  }
  if (u.host === 'firestore.googleapis.com') {
    const d = docs[subOf(init.headers.Authorization) + ':' + decodeURIComponent(u.pathname.split('/documents/')[1])];
    return d ? Response.json(typeof d === 'function' ? d() : d) : new Response('{}', { status: 403 });
  }
  if (u.pathname.includes('accounts:lookup')) return Response.json({ users: [{ createdAt: String(Date.now()) }] });   // neues Konto, kein altes Pro
  if (u.host === 'api.stripe.com') return Response.json(stripe(init.method, u.pathname.slice(4), init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams));
  throw new Error('unerwartet: ' + url);
};
const tag = 864e5, nah = (a, b) => Math.abs(a - b) < 60e3;

// Testzeit: Mitarbeiter und Chef sehen den Status, nur der Chef die Zahl der Mitarbeiter
let [s, j] = await call('/firma', { cid: 'f1' }, 'ma1');
assert.equal(s, 200, JSON.stringify(j));
assert.equal(j.aktiv, false); assert.equal(j.ok, true); assert.equal(j.chef, false); assert.equal(j.ma, null);
assert.ok(nah(j.test, Date.now() + 14 * tag), 'Testzeit 14 Tage');
[s, j] = await call('/firma', { cid: 'f1' }, 'chef');
assert.equal(j.chef, true); assert.equal(j.ma, 2);
assert.equal((await call('/firma', { cid: 'f1' }, 'chefc'))[0], 403, 'fremde Firma');
assert.equal((await call('/firma', { cid: "x');alert(1)" }, 'chef'))[0], 403, 'kaputte Firmen-ID');
assert.equal((await call('/firma-kaufen', { cid: 'f1' }, 'ma1'))[0], 403, 'Mitarbeiter kauft nicht');
assert.equal((await call('/monat-senden', {}, 'ma1'))[0], 400, 'Mitarbeiter in der Testzeit hat Pro (scheitert erst an den Angaben)');

// Kauf: Bezahlseite mit Grundpreis, 2 Mitarbeitern, Rest der Testzeit, Rechnungsadresse und USt-IdNr; Preise legt der Dienst an
[s, j] = await call('/firma-kaufen', { cid: 'f1' }, 'chef');
assert.equal(s, 200, JSON.stringify(j)); assert.match(j.url, /^https:\/\/checkout\.stripe\.com\//);
const cus = store.get('firmkunde:f1');
assert.deepEqual([S.customers[cus].name, S.customers[cus].metadata.cid], ['Test GmbH', 'f1']);
assert.deepEqual(S.prices.map(p => [p.lookup_key, p.unit_amount]).sort(), [['firma_grund', 999], ['firma_ma', 349]]);
let q = S.sessions.at(-1);
const preisVon = i => S.prices.find(p => p.id === q.get(`line_items[${i}][price]`))?.lookup_key;
assert.deepEqual([preisVon(0), q.get('line_items[0][quantity]'), preisVon(1), q.get('line_items[1][quantity]')], ['firma_grund', '1', 'firma_ma', '2']);
assert.ok(nah(+q.get('subscription_data[trial_end]') * 1000, Date.now() + 14 * tag), 'Rest der Testzeit');
assert.equal(q.get('subscription_data[metadata][cid]'), 'f1');
aktive = 0; await call('/firma-kaufen', { cid: 'f1' }, 'chef');
q = S.sessions.at(-1);
assert.equal(q.get('line_items[1][price]'), null, 'ohne Mitarbeiter nur der Grundpreis');
assert.equal(S.prices.length, 2, 'Preise nur einmal angelegt'); assert.equal(Object.keys(S.customers).length, 1, 'ein Kunde je Firma');

// Bezahlt: Abo aktiv, Mitarbeiter haben Pro
const pr = k => S.prices.find(p => p.lookup_key === k);
const sub = { id: 'sub_1', customer: cus, status: 'active', metadata: { cid: 'f1', uid: 'chef' }, created: 1, items: { data: [{ id: 'si_g', price: pr('firma_grund'), quantity: 1, current_period_start: Date.now() / 1000 - 9, current_period_end: Date.now() / 1000 + 30 * 86400 }] } };
S.subs.push(sub);
[s, j] = await call('/firma', { cid: 'f1' }, 'ma1');
assert.equal(j.aktiv, true); assert.equal(j.ok, true);
assert.equal((await call('/firma-kaufen', { cid: 'f1' }, 'chef'))[0], 400, 'kein zweites Abo');

// Mitarbeiterzahl folgt der Firma: freigeben legt die Position an, mehr erhöht, alle entfernen löscht sie
const menge = () => sub.items.data.find(i => i.price.lookup_key === 'firma_ma')?.quantity ?? 0;
aktive = 2; await call('/firma', { cid: 'f1' }, 'chef'); assert.equal(menge(), 2);
aktive = 3; await call('/firma', { cid: 'f1' }, 'chef'); assert.equal(menge(), 3);
aktive = 1; await call('/firma', { cid: 'f1' }, 'ma1'); assert.equal(menge(), 3, 'nur der Chef gleicht ab');
await call('/firma', { cid: 'f1' }, 'chef'); assert.equal(menge(), 1);
aktive = 0; await call('/firma', { cid: 'f1' }, 'chef'); assert.equal(menge(), 0);
assert.equal(sub.items.data.length, 1, 'Position gelöscht, Grundpreis bleibt');

// Verwalten nur für den Chef
assert.match((await call('/firma-verwalten', { cid: 'f1' }, 'chef'))[1].url, /^https:\/\/billing\.stripe\.com\//);
assert.equal((await call('/firma-verwalten', { cid: 'f1' }, 'ma1'))[0], 403);

// Entwickler-Übersicht: Firmen-Abo mit allen Positionen im laufenden Betrag
aktive = 2; await call('/firma', { cid: 'f1' }, 'chef');
const [, stats] = await call('/admin-stats', {}, 'Pb3LEKsVdveCrDdWyhuqOkoNcc63');
assert.deepEqual(stats.abos.map(a => [a.plan, a.uid]), [['firma', 'chef']]);
assert.equal(stats.mrr, 999 + 2 * 349);

// Testzeit vorbei ohne Abo: kein Pro über die Firma, auch nicht mit einer neuen Firma desselben Gründers
store.set('firmtest:chefb', String(Date.now() - 30 * tag));
[s, j] = await call('/firma', { cid: 'f2' }, 'ma2');
assert.equal(j.ok, false); assert.equal(j.aktiv, false);
[s, j] = await call('/monat-senden', {}, 'ma2');
assert.equal(s, 403); assert.match(j.error, /Pro/);
assert.equal((await call('/firma', { cid: 'f3' }, 'chefb'))[1].ok, false, 'neue Firma, keine neue Testzeit');

// Gründungsdatum in der Zukunft verlängert nichts
[s, j] = await call('/firma', { cid: 'f4' }, 'chefc');
assert.ok(nah(j.test, Date.now() + 14 * tag), 'Zukunftsdatum zählt als jetzt');
// Dienstkonto: paidUntil = Ende der Testzeit bzw. Laufzeit + 10 Tage, nur bei Änderung geschrieben, Token wiederverwendet
const bis = p => writes.filter(w => w[0] === 'companies/' + p).at(-1)?.[1];
assert.ok(nah(bis('f2'), Date.now() - 16 * tag), 'abgelaufene Firma: paidUntil in der Vergangenheit');
assert.ok(nah(bis('f4'), Date.now() + 14 * tag), 'Testzeit');
assert.ok(nah(bis('f1'), sub.items.data[0].current_period_end * 1000 + 10 * tag), 'bezahlt: Laufzeit + 10 Tage');
const n0 = writes.length; await call('/firma', { cid: 'f1' }, 'ma1'); await call('/firma', { cid: 'f1' }, 'chef');
assert.equal(writes.length, n0, 'unverändert: nicht neu geschrieben');
assert.equal(tokenCalls.length, 1, 'Token wird wiederverwendet');
console.log('Firmen-Abo: alles richtig');
