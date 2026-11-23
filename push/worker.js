// Push-Dienst der Stempeluhr (Cloudflare Worker, kostenlos).
// Merkt sich pro Nutzer die Push-Abos seiner Geräte (KV „SUBS“) und schickt Web-Push-Nachrichten,
// wenn im Feedback-Chat geschrieben wird. Wer anfragt, wird über sein Firebase-Anmelde-Token geprüft.
//   POST /subscribe  { sub, app: 'user'|'admin' }       Gerät anmelden
//   POST /notify     { to, title, body, url }           Nutzer → Entwickler, Entwickler → beliebiger Nutzer
//   POST /remind     { on, start, end, tz, base, days, last, run }   Erinnerung ans Stempeln (Cron alle 5 Min.)
// Geheimnis (wrangler secret put VAPID_PRIVATE): privater VAPID-Schlüssel als base64url (d).
import { remindDue, remindClean } from './remind.mjs';

const PROJECT = 'stempeluhr-6faae';
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
async function aboStatus(env, uid) {
  const cus = await env.SUBS.get('kunde:' + uid);
  const s = cus && (await liveSubs(env, cus))[0];
  if (!s) return { aktiv: false };
  return { aktiv: true, plan: s.items.data[0].price.recurring?.interval === 'year' ? 'jahr' : 'monat', bis: periodEnd(s), endet: !!(s.cancel_at_period_end || s.cancel_at) };
}
// E-Mail über Resend (Geheimnis RESEND_KEY, Domain dayliner.de dort bestätigt). Kopie an service@dayliner.de.
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_KEY) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Dayliner <service@dayliner.de>', to: [to], bcc: ['service@dayliner.de'], reply_to: 'service@dayliner.de', subject, text }),
  }).catch(() => null);
  return !!r?.ok;
}
// Kündigung ohne Anmeldung (Pflicht nach § 312k BGB): Abos zur E-Mail finden und zum Ende der Laufzeit beenden.
// Jeder Eingang wird in KV festgehalten, der Entwickler bekommt eine Push-Nachricht und schickt die Bestätigung per E-Mail.
async function kuendigen(b, env) {
  const mail = String(b.email || '').trim().toLowerCase().slice(0, 120), name = String(b.name || '').trim().slice(0, 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return [{ error: 'Bitte Name und E-Mail-Adresse angeben.' }, 400];
  const at = new Date().toISOString(), ende = [];
  for (const c of (await stripe(env, 'customers', { email: mail, limit: '10' }, 'GET')).data)
    for (const s of await liveSubs(env, c.id)) ende.push(periodEnd(await stripe(env, 'subscriptions/' + s.id, { cancel_at_period_end: 'true' })));
  const art = b.art === 'ausserordentlich' ? 'außerordentlich' : 'ordentlich';
  const e = { at, name, mail, art, grund: String(b.grund || '').slice(0, 1000), vertrag: String(b.vertrag || 'Dayliner Pro').slice(0, 200), ende };
  // Bestätigung sofort in Textform (§ 312k Abs. 4 BGB): Inhalt, Eingang mit Datum und Uhrzeit, Vertragsende
  const tz = { timeZone: 'Europe/Berlin' }, tag = t => new Date(t).toLocaleDateString('de-DE', tz);
  const zeit = new Date(at).toLocaleString('de-DE', { ...tz, dateStyle: 'long', timeStyle: 'short' });
  const text = [`Hallo ${name},`, '', 'wir bestätigen den Eingang deiner Kündigung.', '',
    `Vertrag: ${e.vertrag}`, `Art der Kündigung: ${art}`, ...(e.grund ? [`Grund: ${e.grund}`] : []), `Eingegangen am: ${zeit} Uhr`,
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
// shortcut: alle Nutzer in einem Durchlauf, reicht für einige Tausend; bei mehr auf Queues oder Durable Objects umstellen.
async function sendUser(env, uid, data) {
  const list = JSON.parse(await env.SUBS.get(uid) || '[]'), keep = [];
  for (const s of list) {
    if (s.app !== 'user') { keep.push(s); continue; }
    const st = await push(s, data, env).catch(() => 0);
    if (st !== 404 && st !== 410) keep.push(s);   // abgelaufenes Abo vergessen
  }
  if (keep.length !== list.length) await env.SUBS.put(uid, JSON.stringify(keep));
}
async function remindAll(env, now = Date.now()) {
  let cursor;
  do {
    const l = await env.SUBS.list({ prefix: 'remind:', cursor });
    for (const k of l.keys) {
      const due = k.metadata && remindDue(k.metadata, now);
      if (!due) continue;
      await sendUser(env, k.name.slice(7), due.msg).catch(() => {});
      const cur = (await env.SUBS.getWithMetadata(k.name)).metadata || k.metadata;   // frisch lesen, falls die App gerade gemeldet hat
      await env.SUBS.put(k.name, '', { metadata: { ...cur, sent: { ...cur.sent, [due.key]: due.d } } });
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
}

// ---------- Anfragen ----------
export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(remindAll(env)); },
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST' };
    const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ ok: true, vapid: VAPID_PUBLIC });
    const path = new URL(req.url).pathname;
    if (path === '/kuendigen') {   // ohne Anmeldung, von dayliner.de/web/kuendigen.html
      try { return out(...await kuendigen(await req.json().catch(() => ({})), env)); }
      catch (e) { return out({ error: 'Das hat nicht geklappt. Bitte schreib an service@dayliner.de.' }, 500); }
    }
    let uid, tok;
    try { tok = await verifyToken((req.headers.get('Authorization') || '').replace('Bearer ', ''), env); uid = tok.sub; } catch (e) { return out({ error: e.message }, 401); }
    const b = await req.json().catch(() => ({}));
    const back = (ORIGINS.includes(origin) ? origin : ORIGINS[0]) + '/web/abo.html';   // Rückkehrseite nach Stripe

    try {
      if (path === '/abo') return out(await aboStatus(env, uid));
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

    if (path === '/forget') {   // Konto gelöscht: alle Geräte vergessen
      await env.SUBS.delete(uid);
      await env.SUBS.delete('remind:' + uid);
      return out({ ok: true });
    }

    // Neue Lohnabrechnung: jeder Angemeldete darf, aber nur mit festem Text (kein Spam mit eigenem Inhalt möglich)
    // Beitrittsanfrage: an Gründer/Geschäftsführer laut Einladungscode, fester Text
    if (path === '/notify' && b.kind === 'join') {
      const to = (Array.isArray(b.to) ? b.to : []).filter(u => typeof u === 'string' && /^\w{10,40}$/.test(u)).slice(0, 5);
      const clean = v => String(v || '').replace(/[^\p{L}\p{N} .,&'-]/gu, '').trim().slice(0, 40);
      const name = clean(b.body) || 'Jemand', firm = clean(b.firm);
      const data = { title: '👋 Neue Beitrittsanfrage', body: `${name} möchte ${firm || 'deiner Firma'} beitreten. Tippe zum Freigeben.`, url: './?team=1', tag: 'join' };
      let sent = 0;
      for (const t of to) for (const s of JSON.parse(await env.SUBS.get(t) || '[]').filter(s => s.app === 'user')) if (await push(s, data, env).catch(() => 0) < 300) sent++;
      return out({ ok: true, sent });
    }

    if (path === '/notify' && b.kind === 'payslip') {
      if (typeof b.to !== 'string' || !/^\w{10,40}$/.test(b.to)) return out({ error: 'Empfänger fehlt' }, 400);
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
