// Erinnerung ans Stempeln: welche Nachricht ist für einen Nutzer jetzt fällig? Reine Funktionen, Test: node push/remind.test.mjs
// r = { start, end: Minuten des Tages oder null, tz, base: 'YYYY-MM-DD', days: '1'/'0' je Tag ab base (Arbeitstag ja/nein),
//       last: Tag des letzten Einstempelns, run: gerade eingestempelt oder in Pause, sent: { s, e } schon erinnert am Tag }
const WINDOW = 180;   // so lange nach der eingestellten Uhrzeit wird noch erinnert (Min.), danach ist es zu spät

export function localNow(tz, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return { d: `${p.year}-${p.month}-${p.day}`, m: +p.hour * 60 + +p.minute };
}

export function remindDue(r, now) {
  const { d, m } = localNow(r.tz, now), sent = r.sent || {};
  const work = r.base && r.days?.[Math.round((Date.parse(d) - Date.parse(r.base)) / 864e5)] === '1';
  if (r.start != null && work && m >= r.start && m < r.start + WINDOW && r.last !== d && !r.run && sent.s !== d)
    return { key: 's', d, msg: { title: '⏰ Noch nicht eingestempelt', body: 'Du hast heute noch nicht eingestempelt. Tippe zum Starten.', url: './', tag: 'remind' } };
  if (r.end != null && m >= r.end && m < r.end + WINDOW && r.run && sent.e !== d)
    return { key: 'e', d, msg: { title: '🏁 Feierabend vergessen?', body: 'Du bist noch eingestempelt. Tippe zum Ausstempeln.', url: './', tag: 'remind' } };
  return null;
}

// Eingaben der App prüfen und in die gespeicherte Form bringen (passt in die 1024 Byte KV-Metadaten)
export function remindClean(b, sent) {
  const t = v => { const x = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v || ''); return x ? +x[1] * 60 + +x[2] : null; };
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
  let tz = String(b.tz || '').slice(0, 40);
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = ''; }
  return { start: t(b.start), end: t(b.end), tz: tz || 'Europe/Berlin', base: date(b.base), days: String(b.days || '').replace(/[^01]/g, '').slice(0, 62), last: date(b.last), run: !!b.run, sent: sent || {} };
}

// Monatsnachweis per E-Mail. Versandtag day (1 bis 28): fällig ist der Zeitraum vom day. des Vormonats bis zum Tag
// vor day (day 1 = Kalendermonat). Die App rechnet genauso (mmPeriod in extras.js).
export function mmPeriod(day, t) {   // t = 'YYYY-MM-DD' (heute) → { von, bis } des zuletzt fälligen Zeitraums
  const [y, m, d] = t.split('-').map(Number), D = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  const bm = d >= day ? m - 1 : m - 2;   // Monat (0-basiert) des letzten Versandtags
  return { von: D(y, bm - 1, day), bis: D(y, bm, day - 1) };
}
export const dmyS = s => s.split('-').reverse().join('.');
// Am Versandtag ab 9 Uhr einmal per Push erinnern, die App zu öffnen (dann schickt sie den PDF).
// r = { tz, e: { [Arbeitsplatz]: [day, done, ping] } }, done/ping = Enddatum des verschickten bzw. angekündigten Zeitraums
export function monthDue(r, now) {
  const { d, m } = localNow(r.tz || 'Europe/Berlin', now), due = [];
  if (m < 540) return null;
  for (const [k, [day, done, ping]] of Object.entries(r.e || {})) {
    if (+d.slice(8) !== day) continue;
    const p = mmPeriod(day, d);
    if ((done || '') < p.bis && ping !== p.bis) due.push([k, p.bis]);
  }
  if (!due.length) return null;
  const body = due.length > 1 ? 'Tippe kurz, dann gehen deine Nachweise raus.' : `Tippe kurz, dann geht dein Nachweis bis ${dmyS(due[0][1])} raus.`;
  return { due, msg: { title: '📄 Dein Monatsnachweis ist bereit', body, url: './', tag: 'monat' } };
}
// Nur 9 bis 12 Uhr (Berlin) und nur jeder dritte Cron-Lauf sieht nach, das spart KV-Abfragen.
export async function monthAll(kv, send, now = Date.now()) {
  const { m } = localNow('Europe/Berlin', now);
  if (m < 540 || m >= 720 || m % 15 >= 5) return 0;
  let cursor, n = 0;
  do {
    const l = await kv.list({ prefix: 'monat:', cursor });
    for (const k of l.keys) {
      const due = k.metadata && monthDue(k.metadata, now);
      if (!due) continue;
      if (++n > MAX_RUN) return MAX_RUN;
      if (await send(k.name.slice(6), due.msg).catch(() => -1) < 0) continue;
      const cur = (await kv.getWithMetadata(k.name)).metadata || k.metadata, e = { ...cur.e };
      for (const [w, bis] of due.due) if (e[w]) e[w] = [e[w][0], e[w][1], bis];
      await kv.put(k.name, '', { metadata: { ...cur, e } });
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return n;
}

// Ein Cron-Durchlauf. send(uid, msg) liefert die Zahl erreichter Geräte, -1 = vorübergehender Fehler (dann nicht als erledigt merken).
// shortcut: höchstens MAX_RUN Nutzer je Durchlauf (Gratis-Plan: 50 Unteranfragen), der Rest kommt 5 Min. später dran; ab einigen hundert Nutzern mit gleicher Uhrzeit Workers Paid oder Queues.
export const MAX_RUN = 20;
export async function remindAll(kv, send, now = Date.now()) {
  let cursor, n = 0;
  do {
    const l = await kv.list({ prefix: 'remind:', cursor });
    for (const k of l.keys) {
      const due = k.metadata && remindDue(k.metadata, now);
      if (!due) continue;
      if (++n > MAX_RUN) return MAX_RUN;
      if (await send(k.name.slice(7), due.msg).catch(() => -1) < 0) continue;
      const cur = (await kv.getWithMetadata(k.name)).metadata || k.metadata;   // frisch lesen, falls die App gerade gemeldet hat
      await kv.put(k.name, '', { metadata: { ...cur, sent: { ...cur.sent, [due.key]: due.d } } });
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return n;
}
