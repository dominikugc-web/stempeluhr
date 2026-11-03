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

console.log('ok');
