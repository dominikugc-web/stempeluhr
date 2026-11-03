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

if (typeof module !== 'undefined') module.exports = { MIN, HOUR, ymd, parseYmd, addDays, monday, isoWeek, easter, holidays, makeCalc };
