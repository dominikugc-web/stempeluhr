// Push-Dienst der Stempeluhr (Cloudflare Worker, kostenlos).
// Merkt sich pro Nutzer die Push-Abos seiner Geräte (KV „SUBS“) und schickt Web-Push-Nachrichten,
// wenn im Feedback-Chat geschrieben wird. Wer anfragt, wird über sein Firebase-Anmelde-Token geprüft.
//   POST /subscribe  { sub, app: 'user'|'admin' }       Gerät anmelden
//   POST /notify     { to, title, body, url }           Nutzer → Entwickler, Entwickler → beliebiger Nutzer
// Geheimnis (wrangler secret put VAPID_PRIVATE): privater VAPID-Schlüssel als base64url (d).

const PROJECT = 'stempeluhr-6faae';
const ADMIN_UIDS = ['Pb3LEKsVdveCrDdWyhuqOkoNcc63'];
const VAPID_PUBLIC = 'BNpcEyUe7Er6neuGciiYsHfjoiTWUQwn1XN_kqsU_h2TTKTYjCe07CHvNBBRbWQDlZwtvh7dVrhBWNT2oOpY5yI';
const ORIGINS = ['https://dominikugc-web.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'];

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

// ---------- Firebase-Token prüfen ----------
let jwks = null, jwksAt = 0;
async function verifyToken(tok) {
  const [h, p, s] = (tok || '').split('.');
  if (!s) throw new Error('kein Token');
  const head = JSON.parse(new TextDecoder().decode(unb64u(h))), pay = JSON.parse(new TextDecoder().decode(unb64u(p)));
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
  return pay.sub;
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

// ---------- Anfragen ----------
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST' };
    const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ ok: true, vapid: VAPID_PUBLIC });
    let uid;
    try { uid = await verifyToken((req.headers.get('Authorization') || '').replace('Bearer ', '')); } catch (e) { return out({ error: e.message }, 401); }
    const b = await req.json().catch(() => ({}));
    const path = new URL(req.url).pathname;

    if (path === '/subscribe') {
      const s = b.sub;
      if (!s?.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) return out({ error: 'Abo fehlt' }, 400);
      const app = b.app === 'admin' && ADMIN_UIDS.includes(uid) ? 'admin' : 'user';
      const list = (JSON.parse(await env.SUBS.get(uid) || '[]')).filter(x => x.endpoint !== s.endpoint);
      list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, app });
      await env.SUBS.put(uid, JSON.stringify(list.slice(-6)));
      return out({ ok: true });
    }

    if (path === '/forget') {   // Konto gelöscht: alle Geräte vergessen
      await env.SUBS.delete(uid);
      return out({ ok: true });
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
