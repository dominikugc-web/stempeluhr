// Run with: node push/remind.test.mjs
import assert from 'assert';
import { remindDue, remindClean, localNow } from './remind.mjs';

// Montag 23.11.2026 in Berlin (UTC+1); days: Mo–Fr Arbeit, Sa/So frei
const at = (hh, mm, day = 23) => Date.UTC(2026, 10, day, hh - 1, mm);
const base = remindClean({ start: '08:00', end: '17:00', tz: 'Europe/Berlin', base: '2026-11-23', days: '11111001111100', last: '2026-11-20', run: false });

assert.deepEqual(localNow('Europe/Berlin', at(7, 5)), { d: '2026-11-23', m: 425 });
assert.equal(remindDue(base, at(7, 55)), null, 'vor der Uhrzeit nichts');
assert.equal(remindDue(base, at(8, 0)).key, 's', 'morgens noch nicht gestempelt');
assert.equal(remindDue({ ...base, sent: { s: '2026-11-23' } }, at(8, 5)), null, 'nur einmal am Tag');
assert.equal(remindDue({ ...base, last: '2026-11-23' }, at(8, 5)), null, 'schon gestempelt');
assert.equal(remindDue({ ...base, run: true }, at(8, 5)), null, 'läuft noch von gestern');
assert.equal(remindDue(base, at(11, 0)), null, 'nach 3 Std. zu spät');
assert.equal(remindDue(base, at(8, 30, 28)), null, 'Samstag frei');
assert.equal(remindDue({ ...base, days: '0' }, at(8, 30)), null, 'Urlaub/Feiertag');

const work = { ...base, last: '2026-11-23', run: true };
assert.equal(remindDue(work, at(16, 55)), null);
assert.equal(remindDue(work, at(17, 0)).key, 'e', 'abends noch eingestempelt');
assert.equal(remindDue({ ...work, sent: { e: '2026-11-23' } }, at(17, 30)), null);
assert.equal(remindDue({ ...work, run: false }, at(17, 30)), null, 'schon ausgestempelt');
assert.equal(remindDue({ ...work, end: null }, at(17, 30)), null, 'Feierabend-Erinnerung aus');

const c = remindClean({ start: '25:00', end: 'x', tz: 'Mars/Base', days: '1a0', base: 'nope' });
assert.deepEqual([c.start, c.end, c.tz, c.days, c.base], [null, null, 'Europe/Berlin', '10', null]);
assert.ok(JSON.stringify(remindClean({ ...base, start: '08:00', end: '17:00', days: '1'.repeat(99), base: '2026-11-23', last: '2026-11-23', tz: 'America/Argentina/ComodRivadavia' }, { s: '2026-11-23', e: '2026-11-23' })).length < 1024);
console.log('remind ok');
