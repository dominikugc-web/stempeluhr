// Pure date and time-account calculations, shared by app.js (browser) and test.js (node).
const MIN = 60000, HOUR = 3600000;

const pad2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const monday = s => addDays(s, -((parseYmd(s).getDay() + 6) % 7));

function isoWeek(s) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function easter(y) { // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return ymd(new Date(y, Math.floor(n / 31) - 1, n % 31 + 1));
}

function bussUndBettag(y) { // Wednesday before 23 November
  const d = new Date(y, 10, 22);
  while (d.getDay() !== 3) d.setDate(d.getDate() - 1);
  return ymd(d);
}

const STATES = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

function holidays(y, state) { // -> { 'YYYY-MM-DD': name }
  const e = easter(y), f = (m, d) => y + '-' + pad2(m) + '-' + pad2(d);
  const list = [
    [f(1, 1), 'Neujahr'],
    [f(1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']],
    [f(3, 8), 'Frauentag', ['BE', 'MV']],
    [addDays(e, -2), 'Karfreitag'],
    [addDays(e, 1), 'Ostermontag'],
    [f(5, 1), 'Tag der Arbeit'],
    [addDays(e, 39), 'Christi Himmelfahrt'],
    [addDays(e, 50), 'Pfingstmontag'],
    [addDays(e, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
    // shortcut: in Bayern only a holiday in catholic municipalities, enter it manually there
    [f(8, 15), 'Mariä Himmelfahrt', ['SL']],
    [f(9, 20), 'Weltkindertag', ['TH']],
    [f(10, 3), 'Tag der Deutschen Einheit'],
    [f(10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
    [f(11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']],
    [bussUndBettag(y), 'Buß- und Bettag', ['SN']],
    [f(12, 25), '1. Weihnachtstag'],
    [f(12, 26), '2. Weihnachtstag'],
  ];
  const out = {};
  for (const [d, name, only] of list) if (!only || only.includes(state)) out[d] = name;
  return out;
}

// Soll pro Wochentag am Tag d: der passende Arbeitsplan (spätestes "ab"), sonst die Standard-Sollzeiten.
function sollWeek(st, d) {
  let best = null;
  for (const p of st.plans || []) if (p.from <= d && (!p.to || d <= p.to) && (!best || p.from > best.from)) best = p;
  return best ? best.soll : st.soll;
}

// Rundet einen Zeitpunkt auf step Minuten. mode: nearest | up | down
function roundTime(ms, step, mode) {
  if (!step) return ms;
  const s = step * MIN, off = new Date(ms).getTimezoneOffset() * MIN, t = ms - off;
  const f = mode === 'up' ? Math.ceil : mode === 'down' ? Math.floor : Math.round;
  return f(t / s) * s + off;
}
// Rundungsregel: "nearest" kaufmännisch; "employee" Start ab-, Ende aufrunden; "employer" umgekehrt.
function roundSession(x, r, now) {
  const e = x.e ?? now;
  if (!r || !+r.step) return { s: x.s, e };
  const [ms, me] = r.mode === 'employee' ? ['down', 'up'] : r.mode === 'employer' ? ['up', 'down'] : ['nearest', 'nearest'];
  const s = roundTime(x.s, +r.step, ms);
  return { s, e: x.e == null ? e : Math.max(s, roundTime(x.e, +r.step, me)) };
}

function makeCalc(data, now) {
  const st = data.settings, byDay = {}, hol = {}, adjByDay = {};
  // shortcut: a session counts fully for the day it started on; split it if night shifts are ever needed
  for (const x of data.sessions) (byDay[ymd(new Date(x.s))] ||= []).push(x);
  for (const a of data.adjustments || []) adjByDay[a.d] = (adjByDay[a.d] || 0) + a.min * MIN;

  function day(d) {
    const sess = (byDay[d] || []).slice().sort((a, b) => a.s - b.s);
    const gross = sess.reduce((t, x) => { const r = roundSession(x, st.round, now); return t + Math.max(0, r.e - r.s); }, 0);
    // Pausen nach § 4 ArbZG: Ausgestempelte Lücken sind schon keine Arbeitszeit. Lücken ab 15 Min. zählen als Pause;
    // fehlt bis zur Mindestpause (Einstellung ab 6 Std., mind. 45 Min. ab 9 Std.) noch etwas, wird nur das abgezogen.
    // Abgezogen wird erst ab 6 Std., die Zeit fällt dadurch nie unter 6:00.
    let brkAll = 0, brk = 0;
    for (let i = 1; i < sess.length; i++) if (sess[i - 1].e) { const g = Math.max(0, sess[i].s - sess[i - 1].e); brkAll += g; if (g >= 15 * MIN) brk += g; }
    const req = (gross > 9 * HOUR ? Math.max(st.pause, 45) : st.pause) * MIN;
    const pause = Math.min(Math.max(0, gross - 6 * HOUR), Math.max(0, req - brk));
    const year = d.slice(0, 4), holiday = (hol[year] ||= holidays(+year, st.state))[d];
    const absence = data.absences.find(a => a.from <= d && d <= a.to);
    const weekday = +sollWeek(st, d)[parseYmd(d).getDay()] || 0;
    let soll = d < st.since ? 0 : weekday * HOUR;
    if (holiday || (absence && absence.type !== 'reduzierung')) soll = 0;
    else if (absence) soll = Math.max(0, soll - absence.hours * HOUR);
    const adj = d < st.since ? 0 : adjByDay[d] || 0;
    return { d, sess, gross, pause, brk, brkAll, breakTotal: brkAll + pause, net: gross - pause, soll, diff: gross - pause - soll, adj, holiday, absence, workday: weekday > 0 && !holiday, planned: weekday > 0 };
  }
  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(day(d)); return out; };
  // Laufende Summe ab Startdatum, einmal berechnet und dann gemerkt.
  const start = st.startBalance * MIN, cum = {};
  let cumTo = null, cumVal = start;
  function rawBalance(until) {
    if (until < st.since) return start;
    if (cumTo === null || until > cumTo) {
      for (let d = cumTo === null ? st.since : addDays(cumTo, 1); d <= until; d = addDays(d, 1)) { const x = day(d); cumVal += x.diff + x.adj; cum[d] = cumVal; }
      cumTo = until;
    }
    return cum[until];
  }
  // Überstunden über der Grenze st.otCap (Std.) werden am Monatsende ausgezahlt, im laufenden Monat bis heute gerechnet.
  const cap = +st.otCap > 0 ? st.otCap * HOUR : 0;
  let po = null;
  function payouts() { // { 'YYYY-MM': ausgezahlte ms }
    if (po) return po;
    po = {};
    if (!cap) return po;
    const t = ymd(new Date(now));
    let paid = 0;
    for (let d = st.since; d <= t; d = addDays(d, 1)) {
      if (d === t || addDays(d, 1).endsWith('-01')) {
        const over = rawBalance(d) - paid - cap;
        if (over > 0) { po[d.slice(0, 7)] = over; paid += over; }
      }
    }
    return po;
  }
  function balance(until) {
    if (!cap) return rawBalance(until);
    const m = until.slice(0, 7);
    const paidBefore = Object.entries(payouts()).reduce((t, [k, v]) => k < m ? t + v : t, 0);
    return Math.min(rawBalance(until) - paidBefore, cap);
  }
  return { day, range, balance, payouts };
}


// Urlaubsplaner: Blöcke freier Tage zwischen from und to, die mit wenigen Urlaubstagen rund um Feiertage entstehen.
// Ein Block beginnt nach und endet vor einem normalen Arbeitstag; need = Arbeitstage, die man dafür Urlaub nimmt.
function bridgeIdeas(calc, from, to, maxDays) {
  const days = calc.range(addDays(from, -1), addDays(to, 1));
  const off = x => !x.workday || (x.absence && x.absence.type !== 'reduzierung');
  const ideas = [];
  for (let i = 1; i < days.length - 1; i++) {
    if (off(days[i - 1])) continue;
    const need = [];
    let hol = null;
    for (let j = i; j < days.length - 1 && j - i < 16; j++) {
      const x = days[j];
      if (!off(x)) need.push(x.d);
      if (x.holiday && x.planned && !hol) hol = x.holiday;  // nur Feiertage, die einen Arbeitstag ersetzen
      if (need.length > Math.min(4, maxDays)) break;
      const len = j - i + 1;
      if (!off(days[j + 1]) && need.length && hol && len >= 3 && len / need.length >= 2.5)
        ideas.push({ from: days[i].d, to: x.d, need: need.slice(), len, holiday: hol });
    }
  }
  ideas.sort((a, b) => b.len / b.need.length - a.len / a.need.length || b.len - a.len || a.from.localeCompare(b.from));
  const out = [];
  for (const x of ideas) if (!out.some(o => x.from <= o.to && o.from <= x.to)) out.push(x);
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

// ---------- Lohn 2026: Sozialversicherung und Lohnsteuer ----------
// Lohnsteuer nach dem Programmablaufplan 2026 des BMF (Stand 12.11.2025), ohne Versorgungsbezüge,
// Altersentlastung, Freibeträge, sonstige Bezüge und private Krankenversicherung.
const UNPAID = ['unbezahlt', 'kindkrank'];
const MINIJOB_MAX = 603, MIDI_TOP = 2000; // Euro im Monat
const W1STKL5 = 14071, W2STKL5 = 34939, W3STKL5 = 222260;
const fl = x => Math.floor(x + 1e-9);
const round2 = x => Math.round(x * 100 + 1e-7) / 100;

function tarif(x, kztab) { // UPTAB26, x in vollen Euro
  let st;
  if (x < 12349) st = 0;
  else if (x < 17800) { const y = (x - 12348) / 10000; st = fl((y * 914.51 + 1400) * y); }
  else if (x < 69879) { const y = (x - 17799) / 10000; st = fl((y * 173.1 + 2397) * y + 1034.87); }
  else if (x < 277826) st = fl(x * 0.42 - 11135.63);
  else st = fl(x * 0.45 - 19470.38);
  return st * kztab;
}
function up56(zx) {
  const diff = (tarif(fl(zx * 1.25), 1) - tarif(fl(zx * 0.75), 1)) * 2, mist = fl(zx * 0.14);
  return Math.max(mist, diff);
}
function mst56(x) { // Steuerklasse V und VI
  if (x > W2STKL5) {
    let st = up56(W2STKL5);
    if (x > W3STKL5) { st = fl(st + (W3STKL5 - W2STKL5) * 0.42); return fl(st + (x - W3STKL5) * 0.45); }
    return fl(st + (x - W2STKL5) * 0.42);
  }
  const st = up56(x);
  return x > W1STKL5 ? Math.min(st, fl(up56(W1STKL5) + (x - W1STKL5) * 0.42)) : st;
}

// o: { re4 (Euro je Zeitraum), lzz (1 = Jahr, 2 = Monat), stkl, zkf, kvz, pvz, pva, pvs }
// -> { lst, soli, bk } in Euro für den Zeitraum; bk = Bemessungsgrundlage Kirchensteuer
function lohnsteuer(o) {
  const n = o.lzz === 1 ? 1 : 12, zre4 = o.re4 * n, stkl = o.stkl, kztab = stkl === 3 ? 2 : 1;
  const kvsatz = o.kvz / 200 + 0.07;
  const pvsatz = (o.pvs ? 0.023 : 0.018) + (o.pvz ? 0.006 : -o.pva * 0.0025);
  const rvBase = Math.min(zre4, 101400), vspr = rvBase * 0.093, vspkvpv = Math.min(zre4, 69750) * (kvsatz + pvsatz);
  let vsp = Math.ceil(vspkvpv + vspr - 1e-9);
  if (stkl !== 6) vsp = Math.max(vsp, Math.ceil(vspr + Math.min(1900, rvBase * 0.013 + vspkvpv) - 1e-9));
  const anp = stkl < 6 ? Math.min(1230, Math.ceil(zre4 - 1e-9)) : 0;
  const ztabfb = (stkl === 2 ? 4260 : 0) + anp + (stkl < 6 ? 36 : 0);
  const kfb = stkl <= 3 ? o.zkf * 9756 : stkl === 4 ? o.zkf * 4878 : 0;
  const tax = zve => { const x = zve < 1 ? 0 : fl(zve / kztab); return stkl < 5 ? tarif(x, kztab) : mst56(x); };
  const zve = zre4 - ztabfb - vsp, lstjahr = tax(zve), jbmg = kfb > 0 ? tax(zve - kfb) : lstjahr;
  let solzj = 0;
  if (jbmg > 20350 * kztab) solzj = Math.min(fl(jbmg * 5.5) / 100, fl((jbmg - 20350 * kztab) * 11.9) / 100);
  const part = euro => n === 1 ? euro : fl(Math.round(euro * 100) / 12) / 100;
  return { lst: part(lstjahr), soli: part(solzj), bk: part(jbmg) };
}

// Pflegeversicherung aus der Einstellung: 'z' = kinderlos (Zuschlag), 'u23' = kinderlos unter 23, 1..5 = Kinder unter 25
const pvParams = pv => pv === 'z' ? { pvz: 1, pva: 0 } : pv === 'u23' ? { pvz: 0, pva: 0 } : { pvz: 0, pva: Math.max(0, Math.min(5, +pv || 1) - 1) };

// Arbeitnehmeranteile im Monat, gerundet wie in der Lohnabrechnung. rate in 1/100000.
// Ob ein Midijob vorliegt, entscheidet das regelmäßige Entgelt (regular), nicht ein gekürzter Monat.
function sv(brutto, type, s, regular = brutto) {
  const share = (base, rate) => Math.round(Math.round(base * 100) * rate / 100000) / 100;
  if (type === 'mini') return { kv: 0, rv: s.rvFrei ? 0 : share(brutto, 3600), av: 0, pv: 0, midi: false };
  const midi = regular > MINIJOB_MAX && regular <= MIDI_TOP;
  const be = midi ? Math.max(0, round2(MIDI_TOP / (MIDI_TOP - MINIJOB_MAX) * (brutto - MINIJOB_MAX))) : brutto;
  const kvpv = Math.min(be, 5812.5), rvav = Math.min(be, 8450), { pvz, pva } = pvParams(s.pv);
  const pvBase = s.pvs ? 2300 : 1800;
  return {
    kv: share(kvpv, 7300 + Math.round(s.kvz * 500)),
    rv: share(rvav, 9300),
    av: share(rvav, 1300),
    pv: pvz ? share(kvpv, pvBase + 600) : round2(share(kvpv, pvBase) - share(kvpv, 250 * pva)),
    midi,
  };
}

// Verdienst laut Vertrag für einen Monat (m = 0..11). otHours = ausgezahlte Überstunden, laufen über den Hauptjob.
function payMonth(data, y, m, otHours = 0) {
  const st = data.settings, first = ymd(new Date(y, m, 1)), last = ymd(new Date(y, m + 1, 0)), ndays = +last.slice(8);
  let unpaid = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) if (data.absences.some(a => UNPAID.includes(a.type) && a.from <= d && d <= a.to)) unpaid++;
  const { pvz, pva } = pvParams(st.pv), pvs = st.state === 'SN';
  const kistRate = st.state === 'BY' || st.state === 'BW' ? 0.08 : 0.09;
  const active = (st.jobs || []).filter(j => !j.since || j.since <= last);
  const otJob = active.find(j => j.type === 'haupt') || active.find(j => j.type !== 'mini');
  const jobs = active.map(j => {
    const base = +j.brutto || 0, days = j.cut ? unpaid : 0, cut = round2(base * days / ndays);
    const ot = j === otJob ? otHours : 0, otPay = round2(ot * hourlyRate(st));
    const brutto = Math.max(0, round2(base - cut + otPay));
    const s = sv(brutto, j.type, { rvFrei: j.rvFrei, kvz: st.kvz, pv: st.pv, pvs }, base);
    let lst = 0, soli = 0, kist = 0;
    if (j.type !== 'mini' && brutto > 0) {
      const neben = j.type === 'neben';
      const r = lohnsteuer({ re4: brutto, lzz: 2, stkl: neben ? 6 : st.stkl, zkf: neben ? 0 : st.zkf, kvz: st.kvz, pvz, pva, pvs });
      lst = r.lst; soli = r.soli; kist = st.kirche ? fl(r.bk * kistRate * 100) / 100 : 0;
    }
    const abz = round2(s.kv + s.rv + s.av + s.pv + lst + soli + kist);
    return { job: j, base, days, cut, ot, otPay, brutto, ...s, lst, soli, kist, abz, netto: round2(brutto - abz), sach: +j.sach || 0 };
  });
  const tot = k => round2(jobs.reduce((t, x) => t + x[k], 0));
  return { jobs, unpaid, brutto: tot('brutto'), abz: tot('abz'), netto: tot('netto'), sach: tot('sach'), cut: tot('cut'), otPay: tot('otPay'), ot: otJob ? otHours : 0 };
}

// Stundenlohn: eingetragen oder aus dem Festgehalt und den Sollstunden (Woche x 13 / 3) berechnet.
function hourlyRate(st) {
  if (+st.hourly > 0) return +st.hourly;
  const week = st.soll.reduce((a, b) => a + (+b || 0), 0), monthly = (st.jobs || []).reduce((a, j) => a + (+j.brutto || 0), 0);
  return week ? monthly / (week * 13 / 3) : 0;
}

// ---------- Lohnabrechnung (PDF) auslesen ----------
// items: Textstücke aus pdf.js [{ s, x, y, w, p }] (p = Seite). Ausgelegt auf Lexware-Abrechnungen, mit Rückfall
// auf allgemeine Suchmuster. Gibt nur gefundene Felder zurück; die App zeigt sie vor dem Übernehmen an.
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function parsePayslip(items) {
  const money = t => { const m = String(t).match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/); return m ? +m[0].replace(/\./g, '').replace(',', '.') : null; };
  const rowsOf = p => {
    const r = {};
    for (const it of items.filter(i => i.p === p && i.s.trim())) (r[Math.round(it.y)] ||= []).push(it);
    return Object.keys(r).map(Number).sort((a, b) => b - a).map(y => ({ y, items: r[y].sort((a, b) => a.x - b.x), text: r[y].sort((a, b) => a.x - b.x).map(i => i.s).join(' ') }));
  };
  const pages = [...new Set(items.map(i => i.p))].sort();
  const rows = pages.flatMap(rowsOf);
  const all = rows.map(r => r.text).join('\n');
  // Wert unter einer Überschrift (Lexware: Kopfzeile, darunter die Werte in derselben Spalte)
  const below = label => {
    for (const [ri, r] of rows.entries()) for (const it of r.items) {
      const k = it.s.indexOf(label); if (k < 0) continue;
      const x = it.x + (it.w || 0) * k / it.s.length;
      for (const r2 of rows.slice(ri + 1, ri + 6)) {
        if (r.y - r2.y > 40 || r2.y > r.y) break;
        const v = r2.items.filter(i => Math.abs(i.x - x) < 25).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
        if (v) return v.s.trim();
      }
    }
    return null;
  };
  const lineAmount = re => { const r = rows.find(r => re.test(r.text)); if (!r) return null; const m = r.text.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g); return m ? money(m[m.length - 1]) : null; };
  const out = {};
  const period = all.match(/Abrechnung für (\S+) (\d{4})(?: - (.+))?/);
  if (period) { out.period = period[1] + ' ' + period[2]; const mi = MONTHS_DE.indexOf(period[1]); if (mi >= 0) out.ym = `${period[2]}-${String(mi + 1).padStart(2, '0')}`; if (period[3]) out.employee = period[3].trim(); }
  const pnr = below('Personal-Nr'); if (pnr && /^\w{1,12}$/.test(pnr)) out.pnr = pnr;
  const firm = rows.find(r => /GmbH|UG|AG\b|KG\b|e\.K\.|GbR|OHG|Ltd/.test(r.text) && !/Abrechnung/.test(r.text)); if (firm) out.firm = firm.items[0].s.trim();
  const stkl = below('Steuerklasse') ?? all.match(/Steuerklasse\s*:?\s*([1-6])\b/)?.[1];
  if (/^[1-6]$/.test(stkl || '')) out.stkl = +stkl;
  const kfb = below('KFB') ?? below('Kinderfreibetr'); if (kfb && /^\d+(,\d)?$/.test(kfb)) out.zkf = +kfb.replace(',', '.');
  const konf = below('Konfession'); if (konf) out.kirche = !/^(ohne|-+|vd|keine)$/i.test(konf);
  const pv = below('Anteil PV'); if (pv) { const k = pv.match(/(\d)\s*Kind/); out.pv = k ? String(Math.min(5, +k[1])) : /kinderlos|zuschlag/i.test(pv) ? 'z' : undefined; if (!out.pv) delete out.pv; }
  const entry = below('Eintritt'); if (/^\d{2}\.\d{2}\.\d{4}$/.test(entry || '')) out.since = entry.split('.').reverse().join('-');
  if (/^ja$/i.test(below('Mehrfachb') || '') && out.stkl === 6) out.type = 'neben';
  out.midi = /^ja$/i.test(below('Midijob') || '');
  const kk = below('Krankenkasse'); if (kk && /[A-Za-z]/.test(kk)) out.kasse = kk;
  out.brutto = lineAmount(/^(Gehalt|Grundgehalt|Monatsgehalt|Lohn)\b/) ?? undefined;
  const sach = lineAmount(/^Sachbezug/); if (sach) out.sach = Math.abs(sach);
  out.gesamtbrutto = lineAmount(/^Gesamtbrutto/) ?? undefined;
  out.netto = lineAmount(/^Netto\b/) ?? undefined;
  out.auszahlung = lineAmount(/^Auszahlungsbetrag/) ?? undefined;
  // KV-Zusatzbeitrag aus Beitrag / Beitragsbrutto (laufend): Arbeitnehmer zahlt 7,3 % + halben Zusatzbeitrag
  const kvHead = rows.findIndex(r => /^KV\b/.test(r.text.trim()) && /RV/.test(r.text));
  if (kvHead >= 0 && !out.midi) {
    const lauf = rows.slice(kvHead + 1, kvHead + 5).filter(r => /^laufend/.test(r.text)).map(r => (r.text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(money));
    if (lauf.length >= 2 && lauf[0][0] > 0) { const z = Math.round((lauf[1][0] / lauf[0][0] - 0.073) * 200 * 100) / 100; if (z > 0 && z < 6) out.kvz = z; }
  }
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === null) delete out[k];
  return out;
}

if (typeof module !== 'undefined') module.exports = { parsePayslip, MIN, HOUR, ymd, parseYmd, addDays, monday, isoWeek, easter, holidays, makeCalc, roundTime, sollWeek, bridgeIdeas, lohnsteuer, sv, payMonth, hourlyRate };
