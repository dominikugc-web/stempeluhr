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
