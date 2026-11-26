// Push-Dienst der Stempeluhr (Cloudflare Worker, kostenlos).
// Merkt sich pro Nutzer die Push-Abos seiner Geräte (KV „SUBS“) und schickt Web-Push-Nachrichten,
// wenn im Feedback-Chat geschrieben wird. Wer anfragt, wird über sein Firebase-Anmelde-Token geprüft.
//   POST /subscribe  { sub, app: 'user'|'admin' }       Gerät anmelden
//   POST /notify     { to, title, body, url }           Nutzer → Entwickler, Entwickler → beliebiger Nutzer
//   POST /remind     { on, start, end, tz, base, days, last, run }   Erinnerung ans Stempeln (Cron alle 5 Min.)
//   POST /upload?thread=<uid>  Rohdaten, Content-Type, X-Name   Datei für den Feedback-Chat ablegen (R2 „FILES“)
//   POST /file  { key }   Datei abrufen      POST /filedel { key }   Datei löschen
//   POST /admin-stats                                    nur Entwickler: alle Abos und Einnahmen aus Stripe
//   POST /monat-an      { tz, list: [{ k, day, done }] }  Arbeitsplätze mit Monatsnachweis und Versandtag merken, Push am Versandtag
//   POST /monat-senden  { k, an, von, bis, name, firma, pdf }   PDF eines vergangenen Zeitraums per E-Mail schicken
// Geheimnis (wrangler secret put VAPID_PRIVATE): privater VAPID-Schlüssel als base64url (d).
import { remindClean, remindAll, monthAll, localNow, dmyS } from './remind.mjs';
import { LIMITS, baseType, kindOf, threadOk, mayAccess } from './files.mjs';

const PROJECT = 'stempeluhr-6faae';
const WEB_KEY = 'AIzaSyA5AA5FJ5yfkWnR8hPR4V_jnD5NEMoWutE';   // öffentlicher Firebase-Web-Schlüssel (steht auch in firebase-config.js), nur für accounts:lookup
const PRO_OLD = Date.parse('2026-11-19T00:00:00+01:00');   // Konten davor behalten Pro (wie in der App)
const ADMIN_UIDS = ['Pb3LEKsVdveCrDdWyhuqOkoNcc63'];
const VAPID_PUBLIC = 'BNpcEyUe7Er6neuGciiYsHfjoiTWUQwn1XN_kqsU_h2TTKTYjCe07CHvNBBRbWQDlZwtvh7dVrhBWNT2oOpY5yI';
const ORIGINS = ['https://dayliner.de', 'https://www.dayliner.de', 'https://dominikugc-web.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'];

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

// ---------- Firebase-Token prüfen ----------
let jwks = null, jwksAt = 0;
async function verifyToken(tok, env) {
  const [h, p, s] = (tok || '').split('.');
  if (!p) throw new Error('kein Token');
  const head = JSON.parse(new TextDecoder().decode(unb64u(h))), pay = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (env.DEV === '1' && head.alg === 'none') return pay;   // nur lokal (wrangler dev --var DEV:1) mit dem Firebase-Emulator
  if (!s) throw new Error('kein Token');
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    jwks = (await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json()).keys;
    jwksAt = Date.now();
  }
  const jwk = jwks.find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') throw new Error('Schlüssel unbekannt');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(s), enc.encode(h + '.' + p))) throw new Error('Signatur falsch');
  const now = Date.now() / 1000;
  if (pay.aud !== PROJECT || pay.iss !== 'https://securetoken.google.com/' + PROJECT || pay.exp < now || !pay.sub) throw new Error('Token ungültig');
  return pay;
}

// ---------- Firestore lesen als der anfragende Nutzer (dessen Regeln gelten) ----------
// Lokal: FS_URL / AUTH_URL zeigen auf die Emulatoren. Liefert das Dokument oder null (fehlt / kein Zugriff).
async function fsGet(env, raw, path) {
  const r = await fetch(`${env.FS_URL || 'https://firestore.googleapis.com/v1'}/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer ' + raw, ...(env.AC ? { 'X-Firebase-AppCheck': env.AC } : {}) } }).catch(() => null);
  return r?.ok ? r.json() : null;
}
const fsStr = (d, k) => d?.fields?.[k]?.stringValue;
// Dienstkonto (Geheimnis FB_SA = JSON-Schlüssel eines eigenen Dienstkontos mit nur der Rolle „Cloud Datastore-Nutzer“,
// eingerichtet mit push/dienstkonto-einrichten.sh). Schreibt nur companies/{cid}.paidUntil, das kein Nutzer ändern darf.
// Ohne Geheimnis passiert nichts (fehlendes paidUntil heißt in den Regeln: erlaubt).
async function saToken(env) {
  if (!env.FB_SA) return null;
  if (saToken.t && saToken.exp > Date.now() + 60e3) return saToken.t;
  const sa = JSON.parse(env.FB_SA), now = Math.floor(Date.now() / 1000), j = o => b64u(enc.encode(JSON.stringify(o)));
  const msg = j({ alg: 'RS256', typ: 'JWT' }) + '.' + j({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const jwt = msg + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(msg)));
  const r = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
  if (!r.access_token) throw new Error('Dienstkonto: ' + (r.error_description || r.error));
  saToken.t = r.access_token; saToken.exp = Date.now() + (r.expires_in || 3600) * 1000;
  return saToken.t;
}
// Hat der Nutzer Pro? Auf dem Server geprüft: Entwickler, altes Konto, Gratis-Platz, Firmen-Mitglied oder Abo bei Stripe.
async function proServer(env, uid, raw) {
  if (ADMIN_UIDS.includes(uid)) return true;
  const look = await fetch(`${env.AUTH_URL || 'https://identitytoolkit.googleapis.com/v1'}/accounts:lookup?key=${WEB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://dayliner.de/', ...(env.AC ? { 'X-Firebase-AppCheck': env.AC } : {}) }, body: JSON.stringify({ idToken: raw }) }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (+look?.users?.[0]?.createdAt && +look.users[0].createdAt < PRO_OLD) return true;
  if (await fsGet(env, raw, 'betaSlots/' + uid)) return true;
  const cid = fsStr(await fsGet(env, raw, 'data/' + uid), 'cid');
  const c = cid && /^[\w-]{1,40}$/.test(cid) && await fsGet(env, raw, 'companies/' + cid);   // lesbar nur für Gründer und freigegebene Mitglieder
  if (c && (await firmaStatus(env, cid, c)).ok) return true;
  return env.STRIPE_KEY ? !!(await aboStatus(env, uid).catch(() => ({}))).aktiv : false;
}
// Einfache Bremse: höchstens max Vorgänge je Schlüssel und Zeitfenster (KV, läuft von selbst ab)
async function bremse(env, key, max, sek) {
  const n = +(await env.SUBS.get('limit:' + key) || 0);
  if (n >= max) return false;
  await env.SUBS.put('limit:' + key, String(n + 1), { expirationTtl: Math.max(60, sek) });
  return true;
}

// ---------- Web Push (RFC 8291 Verschlüsselung, RFC 8292 VAPID) ----------
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function encrypt(sub, payload) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([as.length]), as, ct);
}
async function vapid(endpoint, env) {
  const pub = unb64u(VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://dominikugc-web.github.io/stempeluhr/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
async function push(sub, data, env) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapid(sub.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body: await encrypt(sub, JSON.stringify(data)),
  });
  return r.status;
}

async function toAdmins(data, env) {
  for (const a of ADMIN_UIDS) for (const s of JSON.parse(await env.SUBS.get(a) || '[]').filter(s => s.app === 'admin')) await push(s, data, env).catch(() => 0);
}

// ---------- Dayliner Pro als Abo (Stripe) ----------
// Geheimnis STRIPE_KEY: wrangler secret put STRIPE_KEY (lokal in .dev.vars). Preise in Stripe mit lookup_key pro_monat / pro_jahr.
// Stripe-Kunde je Nutzer in KV „kunde:<uid>“. Ob ein Abo läuft, fragt /abo jedes Mal direkt bei Stripe nach (kein Webhook nötig).
async function stripe(env, path, params, method = 'POST') {
  const q = params ? new URLSearchParams(params).toString() : '';
  const r = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && q ? '?' + q : ''}`, {
    method, headers: { Authorization: 'Bearer ' + env.STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? q : undefined,
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}
const LIVE = ['active', 'trialing', 'past_due'];   // past_due: Stripe versucht die Zahlung noch, so lange bleibt Pro an
const periodEnd = s => (s.items.data[0].current_period_end ?? s.current_period_end) * 1000;
const liveSubs = async (env, cus) => (await stripe(env, 'subscriptions', { customer: cus, status: 'all', limit: '10' }, 'GET')).data.filter(x => LIVE.includes(x.status));
async function aboStatus(env, uid, key = 'kunde:' + uid) {
  const cus = await env.SUBS.get(key);
  const s = cus && (await liveSubs(env, cus))[0];
  if (!s) return { aktiv: false };
  const start = (s.items.data[0].current_period_start ?? s.current_period_start) * 1000;
  const last = (await stripe(env, 'charges', { customer: cus, limit: '1' }, 'GET')).data?.[0];
  if (last?.refunded && last.created * 1000 >= start - 864e5) {   // voll erstattet: Abo sofort beenden, sonst bucht Stripe wieder ab
    await stripe(env, 'subscriptions/' + s.id, null, 'DELETE').catch(() => {});
    return { aktiv: false, erstattet: true };
  }
  return { aktiv: true, plan: s.items.data[0].price.recurring?.interval === 'year' ? 'jahr' : 'monat', bis: periodEnd(s), endet: !!(s.cancel_at_period_end || s.cancel_at) };
}
// ---------- Firmen-Abo (Dominik, 25.11.2026) ----------
// 9,99 € im Monat inklusive Geschäftsführer, dazu 3,49 € je freigegebenem Mitarbeiter. 14 Tage Testzeit ab der ersten
// Firma des Gründers (KV „firmtest:<uid>“, Firmen von vor dem Start ab FIRMA_START). Stripe-Kunde je Firma in KV
// „firmkunde:<cid>“. Die Preise legt der Dienst bei Bedarf selbst an (lookup_key firma_grund / firma_ma, jährlich mit _jahr:
// 99,99 € plus 34,99 € je Mitarbeiter, Dominik 26.11.2026).
const FIRMA_START = Date.parse('2026-11-25T00:00:00+01:00'), FIRMA_TEST = 14 * 864e5;
const FIRMA_PREISE = {
  firma_grund: [999, 'Dayliner Firma (Grundpreis inklusive Geschäftsführer)', 'month'], firma_ma: [349, 'Dayliner Firma je Mitarbeiter', 'month'],
  firma_grund_jahr: [9999, 'Dayliner Firma jährlich (Grundpreis inklusive Geschäftsführer)', 'year'], firma_ma_jahr: [3499, 'Dayliner Firma jährlich je Mitarbeiter', 'year'],
};
async function preis(env, key) {
  const p = (await stripe(env, 'prices', { 'lookup_keys[]': key, active: 'true' }, 'GET')).data[0];
  if (p) return p;
  const [cent, name, interval] = FIRMA_PREISE[key];
  return stripe(env, 'prices', { currency: 'eur', unit_amount: String(cent), 'recurring[interval]': interval, lookup_key: key, 'product_data[name]': name });
}
// Freigegebene Mitarbeiter zählen. Die Liste lesen dürfen nur Geschäftsführer, sonst null.
async function maZahl(env, raw, cid) {
  let n = 0, page = '';
  do {
    const r = await fsGet(env, raw, `companies/${cid}/members?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    if (!r) return null;
    n += (r.documents || []).filter(d => fsStr(d, 'status') === 'active').length;
    page = r.nextPageToken;
  } while (page);
  return n;
}
// c = Firmendokument. ok = Testzeit läuft oder Abo aktiv. Ein Gründungsdatum in der Zukunft zählt als jetzt.
async function firmaStatus(env, cid, c) {
  const owner = fsStr(c, 'owner') || cid, created = Date.parse(c.fields?.created?.timestampValue) || 0;
  const start = Math.min(Math.max(created, FIRMA_START), Date.now()), first = +(await env.SUBS.get('firmtest:' + owner)) || 0;
  if (!first || start < first) await env.SUBS.put('firmtest:' + owner, String(start));
  const test = Math.min(first || start, start) + FIRMA_TEST;
  const abo = env.STRIPE_KEY ? await aboStatus(env, null, 'firmkunde:' + cid).catch(() => ({ aktiv: false })) : { aktiv: false };
  return { ...abo, test, ok: !!abo.aktiv || test > Date.now() };
}
// Bis wann Geschäftsführer die Daten der Mitarbeiter sehen (Regel bossOf): bezahlt = Laufzeit plus 10 Tage Kulanz,
// sonst Ende der Testzeit. Geschrieben vom Dienstkonto, nur wenn sich etwas ändert.
async function firmaBezahlt(env, cid, c, st) {
  const bis = st.aktiv ? Math.max(st.bis || 0, Date.now()) + 10 * 864e5 : st.test;
  if (Math.abs(bis - (Date.parse(c.fields?.paidUntil?.timestampValue) || 0)) < 36e5) return;
  const t = await saToken(env); if (!t) return;
  const r = await fetch(`${env.FS_URL || 'https://firestore.googleapis.com/v1'}/projects/${PROJECT}/databases/(default)/documents/companies/${cid}?updateMask.fieldPaths=paidUntil&currentDocument.exists=true`,
    { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { paidUntil: { timestampValue: new Date(bis).toISOString() } } }) });
  if (!r.ok) throw new Error('paidUntil: ' + r.status);
}
// Zahl der Mitarbeiter im laufenden Abo nachziehen (Stripe verrechnet anteilig mit der nächsten Abrechnung)
async function firmaSync(env, cid, ma) {
  const cus = await env.SUBS.get('firmkunde:' + cid), s = cus && (await liveSubs(env, cus))[0];
  if (!s) return;
  const it = s.items.data.find(i => i.price.lookup_key?.startsWith('firma_ma'));
  if (it ? it.quantity === ma : !ma) return;
  const jahr = s.items.data[0].price.recurring?.interval === 'year', pro = jahr ? { proration_behavior: 'always_invoice' } : {};
  if (it && !ma) await stripe(env, 'subscription_items/' + it.id + (jahr ? '?proration_behavior=always_invoice' : ''), null, 'DELETE');
  else if (it) await stripe(env, 'subscription_items/' + it.id, { quantity: String(ma), ...pro });
  else await stripe(env, 'subscription_items', { subscription: s.id, price: (await preis(env, jahr ? 'firma_ma_jahr' : 'firma_ma')).id, quantity: String(ma), ...pro });
}
// E-Mail über Resend (Geheimnis RESEND_KEY, Domain dayliner.de dort bestätigt). Kopie an service@dayliner.de.
// Entwickler-Übersicht: laufende Abos (mit uid aus den Metadaten) und Einnahmen netto nach Erstattungen.
// mrr = laufender Betrag pro Monat in Cent (Jahresabo / 12), ohne Abos, die zum Laufzeitende gekündigt sind.
async function adminStats(env) {
  const [subs, charges] = await Promise.all([
    stripe(env, 'subscriptions', { status: 'all', limit: '100', 'expand[]': 'data.customer' }, 'GET'),
    stripe(env, 'charges', { limit: '100' }, 'GET'),
  ]);
  const live = subs.data.filter(s => LIVE.includes(s.status)), price = s => s.items.data[0].price;
  const betrag = s => s.items.data.reduce((n, i) => n + (i.price.unit_amount || 0) * (i.quantity ?? 1), 0);
  const endet = s => !!(s.cancel_at_period_end || s.cancel_at), jahr = s => price(s).recurring?.interval === 'year';
  const paid = charges.data.filter(c => c.paid && c.status === 'succeeded');
  const brutto = paid.reduce((n, c) => n + (c.amount_captured ?? c.amount), 0), erstattet = paid.reduce((n, c) => n + (c.amount_refunded || 0), 0);
  return {
    abos: live.map(s => ({ uid: s.metadata?.uid || s.customer?.metadata?.uid || '', email: s.customer?.email || '', plan: s.metadata?.cid ? 'firma' : jahr(s) ? 'jahr' : 'monat', seit: s.created * 1000, bis: periodEnd(s), endet: endet(s) })),
    gekuendigt: subs.data.filter(s => s.status === 'canceled').length,
    zahlungen: paid.length, brutto, erstattet, netto: brutto - erstattet,
    mrr: Math.round(live.filter(s => !endet(s)).reduce((n, s) => n + betrag(s) / (jahr(s) ? 12 : 1), 0)),
    mehr: !!(subs.has_more || charges.has_more),   // mehr als 100 Abos oder Zahlungen: dann fehlt ein Teil
  };
}
// opt überschreibt die Vorgaben (z. B. bcc: undefined, damit Monatsnachweise nicht bei Dayliner landen).
async function sendMail(env, to, subject, text, opt = {}) {
  if (!env.RESEND_KEY) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Dayliner <service@dayliner.de>', to: [to], bcc: ['service@dayliner.de'], reply_to: 'service@dayliner.de', subject, text, ...opt }),
  }).catch(() => null);
  return !!r?.ok;
}
const mailOk = v => { const m = String(v || '').trim().toLowerCase(); return m.length <= 120 && /^[^@\s,;<>]+@[^@\s,;<>]+\.[a-z]{2,}$/.test(m) ? m : ''; };

// Monatsnachweis (Pro, die App prüft Pro): PDF kommt fertig aus der App, je Arbeitsplatz k an genau eine Adresse,
// Kopie an den Nutzer, Antworten gehen an ihn. KV monat:<uid> = { tz, e: { k: [Versandtag, done, ping] } }.
// Nur eingerichtete Arbeitsplätze (höchstens 6), nur vergangene Zeiträume, je Arbeitsplatz höchstens einmal pro Woche.
async function monatSenden(b, uid, tok, env) {
  const key = 'monat:' + uid, cur = (await env.SUBS.getWithMetadata(key)).metadata || {}, k = String(b.k || ''), ent = cur.e?.[k];
  if (!ent) return [{ error: 'Der Monatsnachweis ist für diesen Arbeitsplatz nicht eingerichtet.' }, 400];
  const dat = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '', an = mailOk(b.an), von = dat(b.von), bis = dat(b.bis);
  const tage = (x, z) => (Date.parse(z) - Date.parse(x)) / 864e5, heute = localNow('Europe/Berlin', Date.now()).d;
  if (!an || !von || !bis || von > bis || bis >= heute || tage(von, bis) > 62) return [{ error: 'Adresse oder Zeitraum fehlt.' }, 400];
  if (typeof b.pdf !== 'string' || !b.pdf.startsWith('JVBER') || b.pdf.length > 4e6) return [{ error: 'Der PDF fehlt oder ist zu groß.' }, 400];
  const done = ent[1] || '';
  if (done >= bis || (done && tage(done, bis) < 7)) return [{ ok: true, schon: true }, 200];
  const clean = v => String(v || '').replace(/[^\p{L}\p{N} .&'-]/gu, '').trim().slice(0, 60);
  const name = clean(b.name), firma = clean(b.firma), wer = (name || 'einer Person') + (firma ? ` (${firma})` : '');
  const ganz = von.endsWith('-01') && new Date(Date.parse(bis) + 864e5).toISOString().endsWith('-01T00:00:00.000Z');
  const label = ganz ? new Date(von + 'T12:00:00Z').toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : `${dmyS(von)} bis ${dmyS(bis)}`;
  const self = mailOk(tok.email);
  const text = ['Guten Tag,', '', `anbei der Arbeitszeitnachweis von ${wer} für ${ganz ? '' : 'den Zeitraum '}${label} als PDF.`, '',
    `Er wurde mit Dayliner erstellt und automatisch verschickt.${self ? ` Antworten auf diese E-Mail gehen direkt an ${name || self}.` : ''}`, '',
    '--', 'Dayliner, Arbeitszeiterfassung', 'dayliner.de'].join('\n');
  const datei = `Arbeitszeitnachweis_${ganz ? von.slice(0, 7) : von + '_bis_' + bis}${name ? '_' + name.replace(/[^\p{L}\p{N}]+/gu, '_') : ''}.pdf`;
  const ok = await sendMail(env, an, `Arbeitszeitnachweis ${label}${name ? ': ' + name : ''}`, text, {
    bcc: undefined, cc: self && self !== an ? [self] : undefined, reply_to: self || 'service@dayliner.de',
    attachments: [{ filename: datei, content: b.pdf }],
  });
  if (!ok) return [{ error: 'Die E-Mail konnte gerade nicht verschickt werden.' }, 502];
  const neu = (await env.SUBS.getWithMetadata(key)).metadata || cur, e = { ...neu.e };
  if (e[k]) e[k] = [e[k][0], bis, e[k][2] || ''];
  await env.SUBS.put(key, '', { metadata: { ...neu, e } });
  return [{ ok: true }, 200];
}
// Kündigung ohne Anmeldung (Pflicht nach § 312k BGB): Abos zur E-Mail finden und zum Ende der Laufzeit beenden.
// Jeder Eingang wird in KV festgehalten, der Entwickler bekommt eine Push-Nachricht und schickt die Bestätigung per E-Mail.
async function kuendigen(b, env, ip = '') {
  const mail = String(b.email || '').trim().toLowerCase().slice(0, 120), name = String(b.name || '').replace(/[^\p{L} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);   // ohne Punkte: keine Web-Adressen in der Mail
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return [{ error: 'Bitte Name und E-Mail-Adresse angeben.' }, 400];
  const stunde = new Date().toISOString().slice(0, 13);
  if (!await bremse(env, `kuend:ip:${ip}:${stunde}`, 5, 3600) || !await bremse(env, `kuend:mail:${mail}:${stunde.slice(0, 10)}`, 2, 86400))
    return [{ error: 'Zu viele Kündigungen in kurzer Zeit. Bitte später noch einmal oder per E-Mail an service@dayliner.de.' }, 429];
  const at = new Date().toISOString(), ende = [];
  for (const c of (await stripe(env, 'customers', { email: mail, limit: '10' }, 'GET')).data)
    for (const s of await liveSubs(env, c.id)) ende.push(periodEnd(await stripe(env, 'subscriptions/' + s.id, { cancel_at_period_end: 'true' })));
  const art = b.art === 'ausserordentlich' ? 'außerordentlich' : 'ordentlich';
  const e = { at, name, mail, art, grund: String(b.grund || '').slice(0, 1000), vertrag: String(b.vertrag || 'Dayliner Pro').slice(0, 200), ende };
  // Bestätigung sofort in Textform (§ 312k Abs. 4 BGB): Inhalt, Eingang mit Datum und Uhrzeit, Vertragsende
  const tz = { timeZone: 'Europe/Berlin' }, tag = t => new Date(t).toLocaleDateString('de-DE', tz);
  const zeit = new Date(at).toLocaleString('de-DE', { ...tz, dateStyle: 'long', timeStyle: 'short' });
  const text = [`Hallo ${name},`, '', 'wir bestätigen den Eingang deiner Kündigung.', '',
    `Vertrag: ${e.vertrag}`, `Art der Kündigung: ${art}`, ...(e.grund ? ['Grund: wie angegeben (liegt uns vor)'] : []), `Eingegangen am: ${zeit} Uhr`,
    ende.length ? `Beendet zum: ${ende.map(tag).join(' und ')} (Ende der laufenden Abrechnungszeit)` : 'Zu dieser E-Mail-Adresse haben wir kein laufendes Abo gefunden. Wir prüfen deine Kündigung von Hand und melden uns bei dir.',
    '', ...(ende.length ? ['Bis dahin kannst du Dayliner Pro weiter nutzen, danach wird nichts mehr abgebucht.', ''] : []),
    'Deine Zeiten und die kostenlose Basis von Dayliner bleiben dir erhalten.', '', 'Viele Grüße', 'Dein Dayliner-Team', '',
    '--', 'DK Visuals, Inhaber Dominik Kononenko, Hauptstraße 37, 56307 Dernbach', 'service@dayliner.de · dayliner.de'].join('\n');
  e.bestaetigt = await sendMail(env, mail, 'Bestätigung deiner Kündigung von Dayliner Pro', text);
  await env.SUBS.put('kuendigung:' + at + ':' + mail, JSON.stringify(e));
  await toAdmins({ title: '📮 Kündigung eingegangen', body: `${name} (${mail}), ${art}${ende.length ? '' : ', kein laufendes Abo gefunden'}. ${e.bestaetigt ? 'Bestätigung ging automatisch raus.' : 'Bestätigung per E-Mail schicken!'}`, url: '', tag: 'kuendigung' }, env);
  return [{ ok: true, at, ende, mail: e.bestaetigt }, 200];
}

// ---------- Erinnerung ans Stempeln ----------
// Gespeichert als KV-Metadaten unter remind:<uid>, damit der Cron alles mit einem list() liest.
// Erinnerung an alle Geräte eines Nutzers: Zahl der erreichten Geräte, -1 wenn keins erreicht wurde, aber nur vorübergehend
async function sendUser(env, uid, data) {
  const list = JSON.parse(await env.SUBS.get(uid) || '[]'), keep = [];
  let ok = 0, fail = 0;
  for (const s of list) {
    if (s.app !== 'user') { keep.push(s); continue; }
    const st = await push(s, data, env).catch(() => 0);
    if (st >= 200 && st < 300) ok++; else if (st !== 404 && st !== 410) fail++;
    if (st !== 404 && st !== 410) keep.push(s);   // abgelaufenes Abo vergessen
  }
  if (keep.length !== list.length) await env.SUBS.put(uid, JSON.stringify(keep));
  return ok || !fail ? ok : -1;
}

// ---------- Anfragen ----------
export default {
  async scheduled(ev, env, ctx) {
    const send = (uid, msg) => sendUser(env, uid, msg);
    ctx.waitUntil(remindAll(env.SUBS, send).then(() => monthAll(env.SUBS, send)));
  },
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Name, X-Firebase-AppCheck', 'Access-Control-Allow-Methods': 'POST' };
    const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ ok: true, vapid: VAPID_PUBLIC });
    const path = new URL(req.url).pathname;
    env = { ...env, AC: req.headers.get('X-Firebase-AppCheck') || '' };   // App-Check-Nachweis der App, geht mit an Firestore und die Anmeldung
    if (path === '/kuendigen') {   // ohne Anmeldung, von dayliner.de/web/kuendigen.html
      try { return out(...await kuendigen(await req.json().catch(() => ({})), env, req.headers.get('CF-Connecting-IP') || '')); }
      catch (e) { return out({ error: 'Das hat nicht geklappt. Bitte schreib an service@dayliner.de.' }, 500); }
    }
    let uid, tok;
    const raw = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    try { tok = await verifyToken(raw, env); uid = tok.sub; } catch (e) { return out({ error: e.message }, 401); }
    const admin = ADMIN_UIDS.includes(uid);

    if (path === '/upload') {   // vor req.json(): der Inhalt ist die Datei selbst
      if (!env.FILES) return out({ error: 'Der Dateispeicher ist noch nicht eingerichtet.' }, 503);
      const thread = new URL(req.url).searchParams.get('thread'), type = baseType(req.headers.get('Content-Type')), kind = kindOf(type);
      if (!threadOk(thread) || (thread !== uid && !admin)) return out({ error: 'Kein Zugriff' }, 403);
      if (!kind) return out({ error: 'Dieser Dateityp geht leider nicht.' }, 415);
      const max = LIMITS[kind], tooBig = () => out({ error: `Die Datei ist zu groß (höchstens ${max / 1e6} MB).` }, 413);
      const len = +req.headers.get('Content-Length') || 0;
      if (!len || !req.body) return out({ error: 'Die Datei ist leer.' }, 411);
      if (len > max) return tooBig();
      const key = `chat/${thread}/${crypto.randomUUID()}`;
      let name = ''; try { name = decodeURIComponent(req.headers.get('X-Name') || '').slice(0, 120); } catch {}
      const { readable, writable } = new FixedLengthStream(len);   // durchreichen statt in den Speicher laden (Videos)
      req.body.pipeTo(writable).catch(() => {});
      await env.FILES.put(key, readable, { httpMetadata: { contentType: type }, customMetadata: { name, by: uid } });
      return out({ key, size: len });
    }

    const b = await req.json().catch(() => ({}));

    if (path === '/file' || path === '/filedel') {
      if (!env.FILES) return out({ error: 'Der Dateispeicher ist noch nicht eingerichtet.' }, 503);
      if (!mayAccess(uid, admin, b.key)) return out({ error: 'Kein Zugriff' }, 403);
      if (path === '/filedel') { await env.FILES.delete(b.key); return out({ ok: true }); }
      const o = await env.FILES.get(b.key);
      if (!o) return out({ error: 'Die Datei gibt es nicht mehr.' }, 404);
      return new Response(o.body, { headers: { ...cors, 'Content-Type': o.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }
    const back = (ORIGINS.includes(origin) ? origin : ORIGINS[0]) + '/web/abo.html';   // Rückkehrseite nach Stripe

    try {
      if (path === '/abo') return out(await aboStatus(env, uid));
      if (path === '/admin-stats') return ADMIN_UIDS.includes(uid) ? out(await adminStats(env)) : out({ error: 'Nur für den Entwickler.' }, 403);
      if (path === '/abo-kaufen') {
        if ((await aboStatus(env, uid)).aktiv) return out({ error: 'Du hast schon ein Abo.' }, 400);
        let cus = await env.SUBS.get('kunde:' + uid);
        if (!cus) { cus = (await stripe(env, 'customers', { email: tok.email || '', 'metadata[uid]': uid })).id; await env.SUBS.put('kunde:' + uid, cus); }
        const price = (await stripe(env, 'prices', { 'lookup_keys[]': b.plan === 'jahr' ? 'pro_jahr' : 'pro_monat', active: 'true' }, 'GET')).data[0];
        if (!price) return out({ error: 'Preis fehlt in Stripe.' }, 500);
        const s = await stripe(env, 'checkout/sessions', {
          mode: 'subscription', customer: cus, client_reference_id: uid, locale: 'de',
          'line_items[0][price]': price.id, 'line_items[0][quantity]': '1', 'subscription_data[metadata][uid]': uid,
          'custom_text[submit][message]': 'Mit „Abonnieren“ bestellst du Dayliner Pro zahlungspflichtig. Es gelten die AGB (dayliner.de/web/agb.html). Das Abo verlängert sich automatisch und ist jederzeit zum Ende der Laufzeit kündbar. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
          success_url: back + '?s=ok', cancel_url: back + '?s=abbruch',
        });
        return out({ url: s.url });
      }
      if (path === '/firma' || path === '/firma-kaufen' || path === '/firma-verwalten') {
        const cid = String(b.cid || ''), c = /^[\w-]{1,40}$/.test(cid) && await fsGet(env, raw, 'companies/' + cid);
        if (!c) return out({ error: 'Kein Zugriff auf diese Firma.' }, 403);
        const [ma, st] = await Promise.all([maZahl(env, raw, cid), firmaStatus(env, cid, c)]);   // ma null = kein Geschäftsführer
        if (path === '/firma') {
          if (ma != null && st.aktiv) await firmaSync(env, cid, ma).catch(() => {});
          await firmaBezahlt(env, cid, c, st).catch(e => console.log(e.message));
          return out({ aktiv: !!st.aktiv, ok: st.ok, test: st.test, bis: st.bis || 0, endet: !!st.endet, plan: st.plan || '', ma, chef: ma != null });
        }
        if (ma == null) return out({ error: 'Nur für Geschäftsführer.' }, 403);
        let cus = await env.SUBS.get('firmkunde:' + cid);
        if (path === '/firma-verwalten') {
          if (!cus) return out({ error: 'Kein Abo gefunden.' }, 404);
          return out({ url: (await stripe(env, 'billing_portal/sessions', { customer: cus, return_url: back + '?s=portal', locale: 'de' })).url });
        }
        if (st.aktiv) return out({ error: 'Die Firma hat schon ein Abo.' }, 400);
        if (!cus) { cus = (await stripe(env, 'customers', { email: tok.email || '', name: (fsStr(c, 'name') || '').slice(0, 200), 'metadata[cid]': cid, 'metadata[uid]': uid })).id; await env.SUBS.put('firmkunde:' + cid, cus); }
        const jahr = b.plan === 'jahr', [grund, je] = await Promise.all([preis(env, jahr ? 'firma_grund_jahr' : 'firma_grund'), preis(env, jahr ? 'firma_ma_jahr' : 'firma_ma')]);
        const s = await stripe(env, 'checkout/sessions', {
          mode: 'subscription', customer: cus, client_reference_id: uid, locale: 'de',
          'line_items[0][price]': grund.id, 'line_items[0][quantity]': '1',
          ...(ma ? { 'line_items[1][price]': je.id, 'line_items[1][quantity]': String(ma) } : {}),
          'subscription_data[metadata][cid]': cid, 'subscription_data[metadata][uid]': uid,
          ...(st.test - Date.now() > 2 * 864e5 ? { 'subscription_data[trial_end]': String(Math.floor(st.test / 1000)) } : {}),   // Rest der Testzeit (Stripe: mindestens 48 Std.)
          billing_address_collection: 'required', 'tax_id_collection[enabled]': 'true', 'customer_update[name]': 'auto', 'customer_update[address]': 'auto',
          'custom_text[submit][message]': jahr
            ? 'Mit „Abonnieren“ bestellst du das Dayliner Firmen-Abo jährlich zahlungspflichtig: 99,99 € im Jahr inklusive Geschäftsführer, dazu 34,99 € je freigegebenem Mitarbeiter. Neue Mitarbeiter werden anteilig für den Rest des Jahres sofort abgerechnet, entfernte als Guthaben verrechnet. Es gelten die AGB (dayliner.de/web/agb.html). Das Abo verlängert sich um ein Jahr und ist zum Ende der Laufzeit kündbar. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
            : 'Mit „Abonnieren“ bestellst du das Dayliner Firmen-Abo zahlungspflichtig: 9,99 € im Monat inklusive Geschäftsführer, dazu 3,49 € je freigegebenem Mitarbeiter. Gibst du Mitarbeiter frei oder entfernst sie, passt sich der Betrag anteilig an. Es gelten die AGB (dayliner.de/web/agb.html). Das Abo verlängert sich monatlich und ist jederzeit zum Monatsende kündbar. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
          success_url: back + '?s=ok', cancel_url: back + '?s=abbruch',
        });
        return out({ url: s.url });
      }
      if (path === '/abo-verwalten') {
        const cus = await env.SUBS.get('kunde:' + uid);
        if (!cus) return out({ error: 'Kein Abo gefunden.' }, 404);
        return out({ url: (await stripe(env, 'billing_portal/sessions', { customer: cus, return_url: back + '?s=portal', locale: 'de' })).url });
      }
    } catch (e) { return out({ error: e.message }, 502); }

    if (path === '/subscribe') {
      const s = b.sub;
      if (!s?.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) return out({ error: 'Abo fehlt' }, 400);
      const app = b.app === 'admin' && ADMIN_UIDS.includes(uid) ? 'admin' : 'user';
      const list = (JSON.parse(await env.SUBS.get(uid) || '[]')).filter(x => x.endpoint !== s.endpoint);
      list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, app });
      await env.SUBS.put(uid, JSON.stringify(list.slice(-6)));
      return out({ ok: true });
    }

    if (path === '/remind') {
      const key = 'remind:' + uid;
      if (!b.on) { await env.SUBS.delete(key); return out({ ok: true }); }
      const old = (await env.SUBS.getWithMetadata(key)).metadata;
      await env.SUBS.put(key, '', { metadata: remindClean(b, old?.sent) });
      return out({ ok: true });
    }

    if ((path === '/monat-an' && (b.list || []).length) || path === '/monat-senden') {
      if (!await proServer(env, uid, raw)) return out({ error: 'Der Monatsnachweis per E-Mail gehört zu Dayliner Pro.' }, 403);
    }
    if (path === '/monat-an') {   // komplette Liste der Arbeitsplätze mit Adresse: [{ k, day, done }]
      const key = 'monat:' + uid, old = (await env.SUBS.getWithMetadata(key)).metadata || {}, e = {};
      for (const x of (Array.isArray(b.list) ? b.list : []).slice(0, 6)) {
        const k = String(x?.k || ''), day = Math.round(+x?.day), o = old.e?.[k];
        if (!/^[\w-]{1,40}$/.test(k) || !(day >= 1 && day <= 28)) continue;
        const done = [o?.[1] || '', /^\d{4}-\d{2}-\d{2}$/.test(x.done || '') ? x.done : ''].sort().at(-1);
        e[k] = [day, done, o?.[2] || ''];
      }
      if (!Object.keys(e).length) { await env.SUBS.delete(key); return out({ ok: true }); }
      let tz = String(b.tz || '').slice(0, 40);
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = ''; }
      await env.SUBS.put(key, '', { metadata: { tz: tz || 'Europe/Berlin', e } });
      return out({ ok: true });
    }
    if (path === '/monat-senden') {
      try { return out(...await monatSenden(b, uid, tok, env)); }
      catch (e) { return out({ error: 'Die E-Mail konnte gerade nicht verschickt werden.' }, 500); }
    }

    if (path === '/forget') {   // Konto gelöscht: alle Geräte vergessen, alle Chat-Dateien löschen
      await env.SUBS.delete(uid);
      await env.SUBS.delete('remind:' + uid);
      await env.SUBS.delete('monat:' + uid);
      for (let c, more = !!env.FILES; more;) {
        const l = await env.FILES.list({ prefix: `chat/${uid}/`, cursor: c });
        if (l.objects.length) await env.FILES.delete(l.objects.map(o => o.key));
        more = l.truncated; c = l.cursor;
      }
      return out({ ok: true });
    }

    // Neue Lohnabrechnung: jeder Angemeldete darf, aber nur mit festem Text (kein Spam mit eigenem Inhalt möglich)
    // Beitrittsanfrage: an Gründer/Geschäftsführer laut Einladungscode, fester Text
    if (path === '/notify' && b.kind === 'join') {
      const code = /^[A-Z0-9]{6}$/.test(b.code || '') ? b.code : '', inv = code && await fsGet(env, raw, 'invites/' + code), firmId = fsStr(inv, 'cid');
      if (!firmId || fsStr(await fsGet(env, raw, `companies/${firmId}/members/${uid}`), 'status') !== 'pending') return out({ error: 'Keine offene Anfrage' }, 403);
      if (!await bremse(env, `join:${uid}:${new Date().toISOString().slice(0, 10)}`, 5, 86400)) return out({ error: 'Zu viele Anfragen' }, 429);
      const to = (inv.fields?.notify?.arrayValue?.values || []).map(v => v.stringValue).filter(u => /^\w{10,40}$/.test(u || '')).slice(0, 5);
      const clean = v => String(v || '').replace(/[^\p{L}\p{N} .,&'-]/gu, '').trim().slice(0, 40);
      const name = clean(b.body) || 'Jemand', firm = clean(b.firm);
      const data = { title: '👋 Neue Beitrittsanfrage', body: `${name} möchte ${firm || 'deiner Firma'} beitreten. Tippe zum Freigeben.`, url: './?team=1', tag: 'join' };
      let sent = 0;
      for (const t of to) for (const s of JSON.parse(await env.SUBS.get(t) || '[]').filter(s => s.app === 'user')) if (await push(s, data, env).catch(() => 0) < 300) sent++;
      return out({ ok: true, sent });
    }

    if (path === '/notify' && b.kind === 'payslip') {
      if (typeof b.to !== 'string' || !/^\w{10,40}$/.test(b.to)) return out({ error: 'Empfänger fehlt' }, 400);
      if (b.to !== uid && !admin && !await fsGet(env, raw, 'data/' + b.to)) return out({ error: 'Kein Zugriff' }, 403);
      const period = /^[A-Za-zÄÖÜäöü]+ \d{4}$/.test(b.body || '') ? b.body : '';
      const data = { title: '📄 Neue Lohnabrechnung', body: period ? `Deine Abrechnung für ${period} ist da.` : 'Deine Lohnabrechnung ist da.', url: './?slips=1', tag: 'slip' };
      const list = JSON.parse(await env.SUBS.get(b.to) || '[]');
      let sent = 0;
      for (const s of list.filter(s => s.app === 'user')) if (await push(s, data, env).catch(() => 0) < 300) sent++;
      return out({ ok: true, sent });
    }

    if (path === '/notify') {
      // Nutzer dürfen nur den Entwickler benachrichtigen, der Entwickler jeden Nutzer.
      const fromAdmin = ADMIN_UIDS.includes(uid) && b.to && b.to !== 'admin';
      const targets = fromAdmin ? [[b.to, 'user']] : ADMIN_UIDS.map(a => [a, 'admin']);
      const data = { title: String(b.title || 'Stempeluhr').slice(0, 80), body: String(b.body || '').slice(0, 200), url: String(b.url || '').slice(0, 200), tag: 'fb-' + (fromAdmin ? 'reply' : uid) };
      let sent = 0;
      for (const [t, app] of targets) {
        const list = JSON.parse(await env.SUBS.get(t) || '[]'), keep = [];
        for (const s of list) {
          if (s.app !== app) { keep.push(s); continue; }
          const st = await push(s, data, env).catch(() => 0);
          if (st === 404 || st === 410) continue;      // Abo abgelaufen → vergessen
          keep.push(s); if (st >= 200 && st < 300) sent++;
        }
        if (keep.length !== list.length) await env.SUBS.put(t, JSON.stringify(keep));
      }
      return out({ ok: true, sent });
    }
    return out({ error: 'unbekannt' }, 404);
  },
};
