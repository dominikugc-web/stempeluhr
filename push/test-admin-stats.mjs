// Prüft /admin-stats ohne echtes Stripe: node push/test-admin-stats.mjs
// Stripe wird nachgeahmt: ein Monatsabo, ein gekündigtes Jahresabo (läuft noch), ein beendetes Abo,
// zwei Zahlungen, davon eine voll erstattet (wie der Testkauf vom 20.11.).
import assert from 'node:assert/strict';
import worker from './worker.js';

const ADMIN = 'Pb3LEKsVdveCrDdWyhuqOkoNcc63';
const tok = sub => [{ alg: 'none' }, { sub }].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.';
const sub = (uid, status, interval, amount, cancel = false) => ({
  status, created: 1763600000, cancel_at_period_end: cancel, metadata: { uid }, customer: { email: uid + '@x.de', metadata: {} },
  items: { data: [{ current_period_end: 1766200000, price: { unit_amount: amount, recurring: { interval } } }] },
});
globalThis.fetch = async url => {
  const u = String(url);
  if (u.includes('/v1/subscriptions')) return Response.json({ has_more: false, data: [sub('a', 'active', 'month', 299), sub('b', 'active', 'year', 2499, true), sub('c', 'canceled', 'month', 299)] });
  if (u.includes('/v1/charges')) return Response.json({ has_more: false, data: [
    { paid: true, status: 'succeeded', amount: 299, amount_captured: 299, amount_refunded: 299 },
    { paid: true, status: 'succeeded', amount: 2499, amount_captured: 2499, amount_refunded: 0 },
    { paid: false, status: 'failed', amount: 299, amount_captured: 0, amount_refunded: 0 },
  ] });
  throw new Error('unerwartet: ' + u);
};
const call = uid => worker.fetch(new Request('https://x/admin-stats', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(uid) }, body: '{}' }), { DEV: '1', STRIPE_KEY: 'test' });

const r = await call(ADMIN), j = await r.json();
assert.equal(r.status, 200);
assert.deepEqual(j.abos.map(a => [a.uid, a.plan, a.endet]), [['a', 'monat', false], ['b', 'jahr', true]]);
assert.equal(j.gekuendigt, 1);
assert.equal(j.zahlungen, 2);
assert.equal(j.brutto, 2798);
assert.equal(j.erstattet, 299);
assert.equal(j.netto, 2499);
assert.equal(j.mrr, 299);   // das gekündigte Jahresabo zählt nicht mehr mit
assert.equal((await call('fremd')).status, 403);
console.log('admin-stats: alles richtig');
