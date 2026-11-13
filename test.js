// Run with: node test.js
const assert = require('assert');
const L = require('./logic.js');
const H = L.HOUR;

assert.equal(L.easter(2025), '2025-04-20');
assert.equal(L.easter(2026), '2026-04-05');
assert.equal(L.holidays(2026, 'NW')['2026-06-04'], 'Fronleichnam');
assert.equal(L.holidays(2026, 'BE')['2026-06-04'], undefined);
assert.equal(L.holidays(2026, 'SN')['2026-11-18'], 'Buß- und Bettag');
assert.equal(L.holidays(2026, '')['2026-10-03'], 'Tag der Deutschen Einheit');
assert.equal(L.isoWeek('2026-11-03'), 45);
assert.equal(L.isoWeek('2027-01-01'), 53);
assert.equal(L.monday('2026-11-08'), '2026-11-02');

const data = {
  sessions: [{ s: +new Date(2026, 10, 2, 6, 0), e: +new Date(2026, 10, 2, 15, 0) }],
  absences: [
    { type: 'urlaub', from: '2026-11-04', to: '2026-11-04' },
    { type: 'reduzierung', from: '2026-11-05', to: '2026-11-05', hours: 3 },
  ],
  settings: { soll: [0, 8, 8, 8, 8, 8, 0], pause: 30, state: 'NW', startBalance: -60, since: '2026-11-02' },
};
const c = L.makeCalc(data, +new Date(2026, 10, 5, 12, 0));
const mo = c.day('2026-11-02');
assert.equal(mo.net, 8.5 * H); // 9 h minus 30 min flat break
assert.equal(mo.diff, 0.5 * H);
assert.equal(c.day('2026-11-04').soll, 0);
assert.equal(c.day('2026-11-05').soll, 5 * H);
assert.equal(c.day('2026-11-01').soll, 0); // before start date
// -1 h start + 0.5 h (Mon) - 8 h (Tue) + 0 (vacation Wed) - 5 h (Thu reduced)
assert.equal(c.balance('2026-11-05'), -13.5 * H);
assert.equal(c.balance('2026-11-01'), -1 * H);
// Pause erst nach 6 Std.: 30 Min. → keine Pause, 6:20 → nur 20 Min., 6:00 bleibt unten
const pz = (h) => L.makeCalc({ sessions: [{ s: +new Date(2026, 10, 2, 6, 0), e: +new Date(2026, 10, 2, 6, 0) + h * H }], absences: [], settings: data.settings }, +new Date(2026, 10, 3)).day('2026-11-02');
assert.equal(pz(0.5).net, 0.5 * H);
assert.equal(pz(6 + 1 / 3).net, 6 * H);
assert.equal(pz(7).net, 6.5 * H);


// ---------- Runden, Arbeitspläne, Korrekturen ----------
const at = (h, m) => +new Date(2026, 10, 2, h, m);
assert.equal(L.roundTime(at(7, 52), 15, 'nearest'), at(7, 45));
assert.equal(L.roundTime(at(7, 53), 15, 'nearest'), at(8, 0));
assert.equal(L.roundTime(at(7, 46), 15, 'up'), at(8, 0));
assert.equal(L.roundTime(at(16, 14), 15, 'down'), at(16, 0));
const rd = { ...data, settings: { ...data.settings, round: { step: 15, mode: 'employer' } },
  sessions: [{ s: at(6, 5), e: at(15, 10) }] };   // employer: start up to 6:15, end down to 15:00
assert.equal(L.makeCalc(rd, at(20, 0)).day('2026-11-02').gross, 8.75 * H);
const rdE = { ...rd, settings: { ...rd.settings, round: { step: 15, mode: 'employee' } } }; // 6:00 - 15:15
assert.equal(L.makeCalc(rdE, at(20, 0)).day('2026-11-02').gross, 9.25 * H);
const plan = { ...data, settings: { ...data.settings, plans: [{ from: '2026-11-03', soll: [0, 4, 4, 4, 4, 4, 0] }] } };
const cp = L.makeCalc(plan, +new Date(2026, 10, 5, 12, 0));
assert.equal(cp.day('2026-11-02').soll, 8 * H);   // before plan
assert.equal(cp.day('2026-11-03').soll, 4 * H);   // plan active
const adj = { ...data, adjustments: [{ d: '2026-11-03', min: 120 }, { d: '2026-10-01', min: 600 }] };
const ca = L.makeCalc(adj, +new Date(2026, 10, 5, 12, 0));
assert.equal(ca.balance('2026-11-05'), -11.5 * H);  // +2 h correction, the one before the start date is ignored
assert.equal(ca.balance('2026-11-02'), -0.5 * H);

// ---------- Urlaubsplaner ----------
const yr = { sessions: [], absences: [], settings: { soll: [0, 8, 8, 8, 8, 8, 0], pause: 30, state: 'NW', startBalance: 0, since: '2026-01-01' } };
const ideas = L.bridgeIdeas(L.makeCalc(yr, +new Date(2026, 0, 1)), '2026-05-01', '2026-06-30', 30);
const asc = ideas.find(x => x.holiday === 'Christi Himmelfahrt');  // Do 14.05.2026
assert.deepEqual(asc && [asc.from, asc.to, asc.need.join()], ['2026-05-14', '2026-05-17', '2026-05-15']);
const fron = ideas.find(x => x.holiday === 'Fronleichnam');        // Do 04.06.2026 in NW
assert.deepEqual(fron && fron.need, ['2026-06-05']);
assert.ok(ideas.every(x => x.len / x.need.length >= 2.5));
const y27 = L.bridgeIdeas(L.makeCalc(yr, +new Date(2026, 0, 1)), '2027-04-01', '2027-05-05', 30);
assert.ok(!y27.some(x => x.holiday === 'Tag der Arbeit'));  // 01.05.2027 ist ein Samstag


// ---------- Lohnsteuer: amtliche Prüftabelle PAP 2026 (Jahreslohnsteuer, KVZ 2,90, PVZ = 1 außer Klasse II) ----------
const TABLE = {
  5000: [0, 0, 0, 0, 372, 558],
  17500: [51, 0, 0, 51, 1778, 1956],
  22500: [782, 32, 0, 782, 3073, 3604],
  30000: [2248, 1230, 0, 2248, 5588, 6120],
  35000: [3300, 2233, 294, 3300, 7216, 7682],
  50000: [6788, 5580, 2810, 6788, 12010, 12542],
  70000: [12220, 10835, 6952, 12220, 18729, 19260],
  75000: [13922, 12476, 8206, 13922, 20633, 21165],
  100000: [23248, 21634, 15012, 23248, 30157, 30689],
  110000: [27393, 25779, 18252, 27393, 34302, 34834],
};
for (const [brutto, row] of Object.entries(TABLE)) row.forEach((want, i) => {
  const stkl = i + 1;
  const got = L.lohnsteuer({ re4: +brutto, lzz: 1, stkl, zkf: 0, kvz: 2.9, pvz: stkl === 2 ? 0 : 1, pva: 0, pvs: false }).lst;
  assert.equal(got, want, `Prüftabelle ${brutto} € Klasse ${stkl}: ${got} statt ${want}`);
});

// ---------- Abgleich mit echten Abrechnungen 2026 (Steuerklasse III, 2 Kinderfreibeträge, AOK 2,47 %) ----------
const pay = (brutto, kids) => {
  const s = L.sv(brutto, 'haupt', { kvz: 2.47, pv: kids, pvs: false }, 2185);
  const t = L.lohnsteuer({ re4: brutto, lzz: 2, stkl: 3, zkf: 2, kvz: 2.47, pvz: 0, pva: kids - 1, pvs: false });
  return [s.kv, s.rv, s.av, s.pv, t.lst];
};
assert.deepEqual(pay(2185, 2), [186.49, 203.21, 28.41, 33.87, 0]); // September
assert.deepEqual(pay(2114.52, 2), [180.47, 196.65, 27.49, 32.77, 0]); // August, 1 Tag Kind krank
assert.deepEqual(pay(1832.58, 3), [156.41, 170.43, 23.82, 23.83, 0]); // Oktober, 5 Tage unbezahlt

const job = { settings: { soll: [0, 8, 8, 8, 8, 8, 0], pause: 30, state: 'RP', startBalance: 0, since: '2026-01-01',
  stkl: 3, zkf: 2, kirche: false, kvz: 2.47, pv: 3, hourly: 16,
  jobs: [
    { name: 'Heldenwerker', type: 'haupt', brutto: 2185, cut: true, sach: 50 },
    { name: 'Gymstar', type: 'mini', brutto: 603, cut: false, rvFrei: true },
  ] },
  sessions: [],
  absences: [
    { type: 'unbezahlt', from: '2026-10-05', to: '2026-10-07' },
    { type: 'unbezahlt', from: '2026-10-19', to: '2026-10-20' },
    { type: 'urlaub', from: '2026-10-21', to: '2026-10-21' },
  ] };
const okt = L.payMonth(job, 2026, 9);
assert.equal(okt.unpaid, 5);
assert.equal(okt.jobs[0].cut, 352.42);
assert.equal(okt.jobs[0].brutto, 1832.58);
assert.equal(okt.jobs[0].netto, 1458.09); // Auszahlungsbetrag laut Abrechnung
assert.equal(okt.jobs[1].netto, 603);
assert.equal(okt.netto, 2061.09);
const nov = L.payMonth(job, 2026, 10);
assert.equal(nov.brutto, 2788);
assert.equal(L.hourlyRate(job.settings), 16);
assert.equal(L.hourlyRate({ ...job.settings, hourly: 0 }).toFixed(3), '16.085');

// Minijob mit Rentenversicherung, Midijob im Übergangsbereich, Steuerklasse VI im Nebenjob
assert.equal(L.sv(603, 'mini', { rvFrei: false }).rv, 21.71);
const midi = L.sv(1000, 'haupt', { kvz: 2.9, pv: 'z', pvs: false });
assert.ok(midi.midi && midi.rv === round(568.36 * 0.093));
function round(x) { return Math.round(x * 100) / 100; }

// ---------- Überstunden: bis 40 Std. ansammeln, darüber am Monatsende auszahlen ----------
const ot = { settings: { ...job.settings, since: '2026-11-02', startBalance: 39 * 60, otCap: 40 }, absences: [],
  sessions: [2, 3].map(d => ({ s: +new Date(2026, 10, d, 7, 0), e: +new Date(2026, 10, d, 17, 30) })) };
// 2 Tage je 10,5 h brutto, 10 h netto: +4 h -> Konto 43 h, davon 3 h über der Grenze
const oc = L.makeCalc(ot, +new Date(2026, 10, 3, 18, 0));
assert.equal(oc.payouts()['2026-11'], 3 * H);
assert.equal(oc.balance('2026-11-03'), 40 * H);
const op = L.payMonth(ot, 2026, 10, 3);
assert.equal(op.jobs[0].otPay, 48); // 3 h x 16 €
assert.equal(op.jobs[0].brutto, 2233);
assert.equal(op.jobs[1].brutto, 603); // Minijob bleibt gleich
assert.deepEqual(L.makeCalc({ ...ot, settings: { ...ot.settings, otCap: 0 } }, +new Date(2026, 10, 3, 18, 0)).payouts(), {});

console.log('ok');
