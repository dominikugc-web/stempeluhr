// Legt Produkt, Preise und die Seite „Abo verwalten“ für Dayliner Pro in Stripe an (mehrfach ausführbar).
// Test: node stripe-einrichten.mjs   (liest STRIPE_KEY aus .dev.vars)
// Live: STRIPE_KEY=sk_live_… node stripe-einrichten.mjs   (Schlüssel nur im eigenen Terminal eingeben)
import fs from 'node:fs';
const key = process.env.STRIPE_KEY || (fs.readFileSync(new URL('.dev.vars', import.meta.url), 'utf8').match(/^STRIPE_KEY=(\S+)/m) || [])[1];
const api = async (path, params, method = 'POST') => {
  const q = new URLSearchParams(params || {}).toString();
  const r = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && q ? '?' + q : ''}`, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? q : undefined });
  const j = await r.json(); if (j.error) throw new Error(path + ': ' + j.error.message); return j;
};
console.log('Modus:', key.startsWith('sk_live_') ? 'LIVE' : 'Test');
const have = (await api('prices', { 'lookup_keys[0]': 'pro_monat', 'lookup_keys[1]': 'pro_jahr', 'expand[0]': 'data.product' }, 'GET')).data;
let product = have[0]?.product?.id;
if (!product) product = (await api('products', { name: 'Dayliner Pro', description: 'Alle Pro-Funktionen der Arbeitszeit-App Dayliner', 'metadata[app]': 'dayliner', tax_code: 'txcd_10103001' })).id;
for (const [lk, amount, interval, nick] of [['pro_monat', 299, 'month', 'Monatlich'], ['pro_jahr', 2499, 'year', 'Jährlich']]) {
  const p = have.find(x => x.lookup_key === lk);
  if (p) { console.log('Preis vorhanden:', nick, (p.unit_amount / 100).toFixed(2), '€'); continue; }
  await api('prices', { product, currency: 'eur', unit_amount: amount, 'recurring[interval]': interval, lookup_key: lk, nickname: nick, 'metadata[app]': 'dayliner' });
  console.log('Preis angelegt:', nick, (amount / 100).toFixed(2), '€');
}
const confs = (await api('billing_portal/configurations', { active: 'true', limit: '20' }, 'GET')).data;
const conf = {
  'business_profile[headline]': 'Dayliner Pro: Abo verwalten',
  'business_profile[privacy_policy_url]': 'https://dayliner.de/web/datenschutz.html',
  'business_profile[terms_of_service_url]': 'https://dayliner.de/web/agb.html',
  'features[invoice_history][enabled]': 'true',
  'features[payment_method_update][enabled]': 'true',
  'features[customer_update][enabled]': 'true', 'features[customer_update][allowed_updates][0]': 'email', 'features[customer_update][allowed_updates][1]': 'name',
  'features[subscription_cancel][enabled]': 'true', 'features[subscription_cancel][mode]': 'at_period_end',
  'default_return_url': 'https://dayliner.de/web/abo.html?s=portal',
  'metadata[app]': 'dayliner',
};
const mine = confs.find(c => c.metadata?.app === 'dayliner');
const c = mine ? await api('billing_portal/configurations/' + mine.id, Object.fromEntries(Object.entries(conf).filter(([k]) => k !== 'metadata[app]'))) : await api('billing_portal/configurations', conf);
console.log('Seite „Abo verwalten“:', mine ? 'aktualisiert' : 'angelegt', '| Standard im Konto:', c.is_default ? 'ja' : 'nein');
