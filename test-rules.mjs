// Prüft die Regeln für die 30 Pro-Plätze im Emulator.
// Start: firebase emulators:exec --only auth,firestore --project stempeluhr-6faae "node test-rules.mjs"
import assert from 'node:assert';

const P = 'stempeluhr-6faae', DB = `projects/${P}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DB}`;
const user = async i => (await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `t${i}@test.de`, password: 'geheim123', returnSecureToken: true }),
})).json());
const commit = (tok, writes) => fetch(`${FS}:commit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ writes }),
}).then(r => r.ok);
const counter = n => ({ update: { name: `${DB}/beta/info`, fields: { count: { integerValue: n } } } });
const slot = (uid, n) => ({ update: { name: `${DB}/betaSlots/${uid}`, fields: { n: { integerValue: n } } },
  updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } });
const get = (path, tok) => fetch(`${FS}/${path}`, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });

const us = [];
for (let i = 1; i <= 32; i++) us.push(await user(i));
const [a, b] = us;

assert.equal(await commit(a.idToken, [slot(a.localId, 1)]), false, 'Platz ohne Zähler');
assert.equal(await commit(a.idToken, [counter(1)]), false, 'Zähler ohne Platz');
assert.equal(await commit(a.idToken, [counter(2), slot(a.localId, 2)]), false, 'Zähler springt');
assert.equal(await commit(a.idToken, [counter(1), slot(b.localId, 1)]), false, 'Platz für jemand anderen');
for (let i = 0; i < 30; i++) assert.equal(await commit(us[i].idToken, [counter(i + 1), slot(us[i].localId, i + 1)]), true, `Platz ${i + 1}`);
assert.equal(await commit(a.idToken, [counter(31), slot(a.localId, 31)]), false, 'zweiter Platz');
assert.equal(await commit(us[30].idToken, [counter(31), slot(us[30].localId, 31)]), false, 'Platz 31');

assert.equal((await get('beta/info')).ok, true, 'Zähler ohne Anmeldung lesbar');
assert.equal((await get(`betaSlots/${a.localId}`, a.idToken)).ok, true, 'eigener Platz lesbar');
assert.equal((await get(`betaSlots/${a.localId}`, b.idToken)).ok, false, 'fremder Platz gesperrt');
assert.equal((await fetch(`${FS}/betaSlots/${a.localId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + b.idToken } })).ok, false, 'fremden Platz löschen');
assert.equal((await fetch(`${FS}/betaSlots/${a.localId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + a.idToken } })).ok, true, 'eigenen Platz löschen');
console.log('Regeln für die Pro-Plätze: alle Prüfungen bestanden');
