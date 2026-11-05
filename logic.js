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

function makeCalc(data, now) {
  const st = data.settings, byDay = {}, hol = {};
  // shortcut: a session counts fully for the day it started on; split it if night shifts are ever needed
  for (const x of data.sessions) (byDay[ymd(new Date(x.s))] ||= []).push(x);

  function day(d) {
    const sess = (byDay[d] || []).slice().sort((a, b) => a.s - b.s);
    const gross = sess.reduce((t, x) => t + Math.max(0, (x.e ?? now) - x.s), 0);
    const pause = Math.min(gross, st.pause * MIN);
    const year = d.slice(0, 4), holiday = (hol[year] ||= holidays(+year, st.state))[d];
    const absence = data.absences.find(a => a.from <= d && d <= a.to);
    const weekday = +st.soll[parseYmd(d).getDay()] || 0;
    let soll = d < st.since ? 0 : weekday * HOUR;
    if (holiday || (absence && absence.type !== 'reduzierung')) soll = 0;
    else if (absence) soll = Math.max(0, soll - absence.hours * HOUR);
    return { d, sess, gross, pause, net: gross - pause, soll, diff: gross - pause - soll, holiday, absence, workday: weekday > 0 && !holiday };
  }
  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(day(d)); return out; };
  const balance = until => st.startBalance * MIN + range(st.since, until).reduce((t, x) => t + x.diff, 0);
  return { day, range, balance };
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

// Verdienst laut Vertrag für einen Monat (m = 0..11).
function payMonth(data, y, m) {
  const st = data.settings, first = ymd(new Date(y, m, 1)), last = ymd(new Date(y, m + 1, 0)), ndays = +last.slice(8);
  let unpaid = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) if (data.absences.some(a => UNPAID.includes(a.type) && a.from <= d && d <= a.to)) unpaid++;
  const { pvz, pva } = pvParams(st.pv), pvs = st.state === 'SN';
  const kistRate = st.state === 'BY' || st.state === 'BW' ? 0.08 : 0.09;
  const jobs = (st.jobs || []).filter(j => !j.since || j.since <= last).map(j => {
    const base = +j.brutto || 0, days = j.cut ? unpaid : 0, cut = round2(base * days / ndays), brutto = Math.max(0, round2(base - cut));
    const s = sv(brutto, j.type, { rvFrei: j.rvFrei, kvz: st.kvz, pv: st.pv, pvs }, base);
    let lst = 0, soli = 0, kist = 0;
    if (j.type !== 'mini' && brutto > 0) {
      const neben = j.type === 'neben';
      const r = lohnsteuer({ re4: brutto, lzz: 2, stkl: neben ? 6 : st.stkl, zkf: neben ? 0 : st.zkf, kvz: st.kvz, pvz, pva, pvs });
      lst = r.lst; soli = r.soli; kist = st.kirche ? fl(r.bk * kistRate * 100) / 100 : 0;
    }
    const abz = round2(s.kv + s.rv + s.av + s.pv + lst + soli + kist);
    return { job: j, base, days, cut, brutto, ...s, lst, soli, kist, abz, netto: round2(brutto - abz), sach: +j.sach || 0 };
  });
  const tot = k => round2(jobs.reduce((t, x) => t + x[k], 0));
  return { jobs, unpaid, brutto: tot('brutto'), abz: tot('abz'), netto: tot('netto'), sach: tot('sach'), cut: tot('cut') };
}

// Stundenlohn: eingetragen oder aus dem Festgehalt und den Sollstunden (Woche x 13 / 3) berechnet.
function hourlyRate(st) {
  if (+st.hourly > 0) return +st.hourly;
  const week = st.soll.reduce((a, b) => a + (+b || 0), 0), monthly = (st.jobs || []).reduce((a, j) => a + (+j.brutto || 0), 0);
  return week ? monthly / (week * 13 / 3) : 0;
}

if (typeof module !== 'undefined') module.exports = { MIN, HOUR, ymd, parseYmd, addDays, monday, isoWeek, easter, holidays, makeCalc, lohnsteuer, sv, payMonth, hourlyRate };
