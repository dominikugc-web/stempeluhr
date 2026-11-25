// Prüft die Regeln für Projekte der Firma im Emulator.
// Start: firebase emulators:exec --only auth,firestore --project stempeluhr-6faae "node test-rules-projekte.mjs"
import assert from 'node:assert';

const P = 'stempeluhr-6faae', DB = `projects/${P}/databases/(default)/documents`, FS = `http://127.0.0.1:8080/v1/${DB}`;
const user = async n => (await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${n}@prj.de`, password: 'geheim123', returnSecureToken: true }),
})).json());
const req = (method, path, tok, body) => fetch(`${FS}/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body && JSON.stringify(body) });
const s = v => ({ stringValue: v });

const [chef, mit, offen, fremd] = [await user('chef'), await user('mit'), await user('offen'), await user('fremd')];
// Firma mit aktivem Mitarbeiter und offener Anfrage (am Regelwerk vorbei angelegt)
await req('PATCH', 'companies/c1', 'owner', { fields: { name: s('Test GmbH'), owner: s(chef.localId) } });
await req('PATCH', `companies/c1/members/${mit.localId}`, 'owner', { fields: { status: s('active') } });
await req('PATCH', `companies/c1/members/${offen.localId}`, 'owner', { fields: { status: s('pending') } });

const neu = (u, id, name = 'Müller Bad') => req('PATCH', `companies/c1/projects/${encodeURIComponent(id)}`, u.idToken, { fields: { name: s(name), kunde: s('Fam. Müller'), by: s(u.localId) } });
assert.equal((await neu(mit, 'p1')).ok, true, 'Mitarbeiter legt Projekt an');
assert.equal((await neu(chef, 'p2', 'Schulz Küche')).ok, true, 'Chef legt Projekt an');
assert.equal((await neu(offen, 'p3')).ok, false, 'offene Anfrage darf nicht anlegen');
assert.equal((await neu(fremd, 'p4')).ok, false, 'Fremde dürfen nicht anlegen');
assert.equal((await req('PATCH', 'companies/c1/projects/p5', mit.idToken, { fields: { name: s('X'), by: s(chef.localId) } })).ok, false, 'nicht im Namen anderer anlegen');
assert.equal((await req('PATCH', 'companies/c1/projects/p6', mit.idToken, { fields: { name: s(''), by: s(mit.localId) } })).ok, false, 'leerer Name');
assert.equal((await req('GET', 'companies/c1/projects/p2', mit.idToken)).ok, true, 'Mitarbeiter liest Projekte');
assert.equal((await req('GET', 'companies/c1/projects/p2', fremd.idToken)).ok, false, 'Fremde lesen nicht');
assert.equal((await req('PATCH', 'companies/c1/projects/p2?updateMask.fieldPaths=nr', mit.idToken, { fields: { nr: s('K-123') } })).ok, true, 'Mitarbeiter ändert Projekt');
assert.equal((await req('DELETE', 'companies/c1/projects/p1', mit.idToken)).ok, false, 'Mitarbeiter löscht nicht');
assert.equal((await req('DELETE', 'companies/c1/projects/p1', chef.idToken)).ok, true, 'Chef löscht');
assert.equal((await neu(mit, "p7');alert(1)")).ok, false, 'Projekt-ID mit Sonderzeichen');
assert.equal((await neu(mit, 'p_gut-7')).ok, true, 'Projekt-ID normal');
const set = (u, id, fields) => req('PATCH', `companies/c1/projects/${id}?${Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&')}`, u.idToken, { fields });
assert.equal((await set(mit, 'p2', { done: { booleanValue: true } })).ok, false, 'Mitarbeiter schließt nicht ab');
assert.equal((await set(mit, 'p2', { to: s('p1') })).ok, false, 'Mitarbeiter legt nicht zusammen');
assert.equal((await set(chef, 'p2', { done: { booleanValue: true } })).ok, true, 'Chef schließt ab');
assert.equal((await set(mit, 'p2', { name: s('x'.repeat(81)) })).ok, false, 'Name zu lang');
assert.equal((await req('PATCH', `companies/c1/projects/p8`, mit.idToken, { fields: { name: s('Y'), by: s(mit.localId), done: { booleanValue: true } } })).ok, false, 'nicht gleich abgeschlossen anlegen');
// Firmen-ID und Einladungscode nur aus sicheren Zeichen
assert.equal((await req('PATCH', `companies/${encodeURIComponent("x');alert(1)//")}`, fremd.idToken, { fields: { name: s('Böse'), owner: s(fremd.localId) } })).ok, false, 'Firmen-ID mit Sonderzeichen');
assert.equal((await req('PATCH', 'companies/gute_Firma-1', fremd.idToken, { fields: { name: s('Gut'), owner: s(fremd.localId) } })).ok, false, 'Firma nur mit bestätigter E-Mail');
// E-Mail bestätigen (Emulator) und neu anmelden, damit das Token email_verified trägt
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
await fetch(`${AUTH}/projects/${P}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: fremd.localId, emailVerified: true }) });
const fremd2 = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fremd@prj.de', password: 'geheim123', returnSecureToken: true }) })).json();
assert.equal((await req('PATCH', 'companies/gute_Firma-1', fremd2.idToken, { fields: { name: s('Gut'), owner: s(fremd.localId) } })).ok, true, 'normale Firmen-ID mit bestätigter E-Mail');
// Firma nicht bezahlt: Geschäftsführer sehen die Daten der Mitarbeiter nicht mehr. paidUntil setzt nur der Push-Dienst.
const ts = tage => ({ timestampValue: new Date(Date.now() + tage * 864e5).toISOString() });
const firmaSetzen = (tok, fields) => req('PATCH', `companies/c1?${Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&')}`, tok, { fields });
await req('PATCH', `data/${mit.localId}`, 'owner', { fields: { cid: s('c1') } });
assert.equal((await req('GET', `data/${mit.localId}`, chef.idToken)).ok, true, 'ohne paidUntil: Chef liest');
await firmaSetzen('owner', { paidUntil: ts(-1) });
assert.equal((await req('GET', `data/${mit.localId}`, chef.idToken)).ok, false, 'abgelaufen: Chef liest nicht');
assert.equal((await req('PATCH', `data/${mit.localId}?updateMask.fieldPaths=x`, chef.idToken, { fields: { x: s('1'), cid: s('c1') } })).ok, false, 'abgelaufen: Chef korrigiert nicht');
assert.equal((await req('GET', `data/${mit.localId}`, mit.idToken)).ok, true, 'Mitarbeiter liest seine Daten weiter');
assert.equal((await req('GET', 'companies/c1/members', chef.idToken)).ok, true, 'Mitgliederliste bleibt sichtbar (Abo-Hinweis)');
assert.equal((await firmaSetzen(chef.idToken, { paidUntil: ts(30) })).ok, false, 'Chef verlängert nicht selbst');
assert.equal((await req('PATCH', 'companies/c1?updateMask.fieldPaths=paidUntil', chef.idToken, { fields: {} })).ok, false, 'Chef löscht paidUntil nicht');
assert.equal((await firmaSetzen(chef.idToken, { name: s('Test GmbH & Co') })).ok, true, 'Chef ändert weiter den Namen');
await firmaSetzen('owner', { paidUntil: ts(30) });
assert.equal((await req('GET', `data/${mit.localId}`, chef.idToken)).ok, true, 'bezahlt: Chef liest wieder');
assert.equal((await req('PATCH', 'companies/gratis_Firma', fremd2.idToken, { fields: { name: s('X'), owner: s(fremd.localId), paidUntil: ts(999) } })).ok, false, 'Firma nicht mit paidUntil anlegen');
console.log('Regeln für Projekte: alle Prüfungen bestanden');
