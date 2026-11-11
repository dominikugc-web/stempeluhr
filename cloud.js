// Login (Google oder E-Mail), Speichern in Firestore und Firmenverwaltung. Die Zeit-Oberfläche liegt in app.js.
// Gehalts- und Steuerangaben liegen getrennt in private/{uid}, damit der Chef sie nie sieht.
const PRIVATE = ['jobs', 'stkl', 'zkf', 'kirche', 'kvz', 'pv', 'hourly', 'theme', 'tips'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const G_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';

let fb = null, me = null;
let own = {};               // letzte Snapshots der eigenen Dokumente: { shared, priv, sharedSeen, privSeen }
let cid = undefined;        // Firma laut eigenem Datendokument
let company, membership, members = [], teamStats = {}; // undefined = lädt noch, null = gibt es nicht / kein Zugriff
let membersOn = false;
let viewing = null;         // { uid, name } wenn der Chef einen Mitarbeiter ansieht
let unsubs = [], companyUnsubs = [], viewUnsub = null;
let joinCode = new URLSearchParams(location.search).get('join');

const isOwner = () => !!(company && me && company.owner === me.uid);
const off = list => { list.forEach(f => f()); list.length = 0; };
const ref = path => fb.db.doc(path);

// ---------- start ----------
function startCloud() {
  // Lokal testen: http://localhost:8765/?emu nutzt die Firebase-Emulatoren (firebase emulators:start).
  const emu = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emu');
  const c = emu ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-stempeluhr' } : window.FIREBASE_CONFIG;
  if (!c || !c.apiKey || c.apiKey.startsWith('DEIN')) {
    showTabs(false);
    view.innerHTML = '<div class="card center"><p>Die Anmeldung ist noch nicht eingerichtet.</p><p class="muted small">firebase-config.js mit den Daten des Firebase-Projekts füllen.</p></div>';
    return;
  }
  firebase.initializeApp(c);
  fb = { auth: firebase.auth(), db: firebase.firestore() };
  if (emu) { fb.auth.useEmulator('http://127.0.0.1:9099'); fb.db.useEmulator('127.0.0.1', 8080); }
  fb.db.settings({ ignoreUndefinedProperties: true, merge: true });
  if (!emu) fb.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  fb.auth.getRedirectResult().catch(authError);
  view.innerHTML = '<p class="center muted" style="margin-top:40vh">Lädt …</p>';
  showTabs(false);
  fb.auth.onAuthStateChanged(u => {
    off(unsubs); off(companyUnsubs); viewUnsub?.(); viewUnsub = null;
    me = u; own = {}; cid = undefined; company = undefined; membership = undefined; members = []; viewing = null; membersOn = false;
    if (!u) { data = normalize({}); showTabs(false); renderLogin(); return; }
    unsubs.push(
      ref('data/' + u.uid).onSnapshot(s => onOwn('shared', s), cloudError),
      ref('private/' + u.uid).onSnapshot(s => onOwn('priv', s), cloudError),
    );
  });
}

function onOwn(kind, s) {
  if (!s.exists && s.metadata.fromCache) return;         // auf Antwort vom Server warten
  own[kind] = s.exists ? s.data() : null;
  own[kind + 'Seen'] = true;
  if (!own.sharedSeen || !own.privSeen) return;
  if (!own.shared) return firstLogin();
  if (own.shared.cid !== cid) watchCompany(own.shared.cid || null);
  if (s.metadata.hasPendingWrites && own.ready) return;  // eigene Änderung, data ist schon aktuell
  own.ready = true;
  if (!viewing) data = merged(own.shared, own.priv);
  showTabs(true);
  if (tab === 'login') tab = 'start';
  refresh();
  if (joinCode && !cid) { const c = joinCode; joinCode = null; history.replaceState(null, '', location.pathname); joinForm(c); }
}

// Beim ersten Login: Zeiten, die bisher nur auf diesem Gerät lagen, in die Cloud übernehmen.
function firstLogin() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(KEY)); } catch {}
  data = normalize(local || {});
  if (!data.settings.name) data.settings.name = me.displayName || '';
  if (!local) data.settings.onboarded = false;  // neues Konto: Einführung zeigen
  writeOwn(true);
  own.ready = true;  // data ist schon vollständig; die Snapshots der eigenen Schreibvorgänge werden übersprungen
  showTabs(true); tab = 'start'; refresh();
  if (joinCode) { const c = joinCode; joinCode = null; history.replaceState(null, '', location.pathname); joinForm(c); }
}

function merged(shared, priv) {
  return normalize({ sessions: shared.sessions, absences: shared.absences, adjustments: shared.adjustments, settings: { ...shared.settings, ...(priv?.settings || {}) } });
}
function split(settings) {
  const shared = { ...settings }, priv = {};
  for (const k of PRIVATE) { priv[k] = shared[k]; delete shared[k]; }
  return { shared, priv };
}

// app.js ruft save() nach jeder Änderung auf.
function save() {
  if (!me) return;
  if (viewing) {
    const { shared } = split(data.settings);
    ref('data/' + viewing.uid).update({ sessions: data.sessions, absences: data.absences, adjustments: data.adjustments, settings: shared }).catch(cloudError);
  } else writeOwn(false);
}
function writeOwn(first) {
  const { shared, priv } = split(data.settings), b = fb.db.batch();
  const doc = { sessions: data.sessions, absences: data.absences, adjustments: data.adjustments, settings: shared };
  if (first) doc.cid = null;
  b.set(ref('data/' + me.uid), doc, first ? undefined : { merge: true });
  b.set(ref('private/' + me.uid), { settings: priv });
  b.commit().catch(cloudError);
}
function refresh() { if ($('#sheet').hidden) render(); }

// ---------- firma beobachten ----------
function watchCompany(id) {
  off(companyUnsubs);
  cid = id; company = undefined; membership = undefined; members = []; teamStats = {}; membersOn = false;
  if (!id) return updateTabs();
  const listenCompany = () => companyUnsubs.push(ref('companies/' + id).onSnapshot(s => {
    company = s.exists ? { id, ...s.data() } : null;
    if (isOwner() && !membersOn) {
      membersOn = true;
      companyUnsubs.push(fb.db.collection(`companies/${id}/members`).onSnapshot(q => {
        members = q.docs.map(d => ({ uid: d.id, ...d.data() }));
        loadTeamStats(); updateTabs(); if (tab === 'team') refresh();
      }, cloudError));
    }
    updateTabs(); refresh();
  }, () => { company = null; updateTabs(); refresh(); }));
  companyUnsubs.push(ref(`companies/${id}/members/${me.uid}`).onSnapshot(s => {
    const was = membership?.status;
    membership = s.exists ? s.data() : null;
    if (membership?.status === 'active' && was !== 'active' && !company) listenCompany();
    refresh();
  }, () => {}));
  listenCompany();
}

async function loadTeamStats() {
  for (const m of members.filter(m => m.status === 'active')) {
    try {
      const s = await ref('data/' + m.uid).get();
      if (!s.exists) continue;
      const d = merged(s.data(), null), c = makeCalc(d, Date.now()), t = today(), w = monday(t);
      teamStats[m.uid] = { balance: c.balance(t), week: sum(c.range(w, addDays(w, 6)), 'net'), running: d.sessions.some(x => x.e == null) };
    } catch {}
  }
  if (tab === 'team') refresh();
}

// ---------- tabs ----------
function showTabs(on) { $('.tabs').hidden = !on; if (on) updateTabs(); }
function updateTabs() {
  const show = { start: !viewing, pay: !viewing, team: isOwner() };
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab in show) b.hidden = !show[b.dataset.tab]; });
  if (tab === 'team' && !isOwner()) { tab = 'start'; refresh(); }
}

// ---------- login ----------
function renderLogin(mode = 'login') {
  tab = 'login';
  const signup = mode === 'signup';
  view.innerHTML = `<h1 class="center" style="margin-top:8vh">Stempeluhr</h1>
  <p class="center muted">${signup ? 'Neues Konto erstellen' : 'Melde dich an. Deine Zeiten werden gespeichert und sind auf allen Geräten gleich.'}</p>
  <button class="pill wide gbtn" onclick="googleLogin()">${G_ICON} Mit Google ${signup ? 'registrieren' : 'anmelden'}</button>
  <div class="label center">oder mit E-Mail</div>
  <div class="group">
    ${signup ? '<label class="row"><span>Name</span><input id="lname" autocomplete="name" placeholder="Vor- und Nachname"></label>' : ''}
    <label class="row"><span>E-Mail</span><input id="lmail" type="email" autocomplete="email" inputmode="email" placeholder="name@firma.de"></label>
    <label class="row"><span>Passwort</span><input id="lpass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'mind. 6 Zeichen' : ''}"></label>
  </div>
  <p class="hint red" id="lerr"></p>
  <button class="big" onclick="${signup ? 'emailSignup()' : 'emailLogin()'}">${signup ? 'Konto erstellen' : 'Anmelden'}</button>
  <div class="center" style="margin-top:18px">
    <button class="pill sm" onclick="renderLogin('${signup ? 'login' : 'signup'}')">${signup ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen'}</button>
    ${signup ? '' : '<p><button class="muted small" onclick="resetPassword()">Passwort vergessen?</button></p>'}
  </div>
  ${joinCode ? `<p class="hint center">Nach der Anmeldung trittst du der Firma mit dem Code ${esc(joinCode)} bei.</p>` : ''}`;
  $('#lpass').addEventListener('keydown', e => e.key === 'Enter' && (signup ? emailSignup() : emailLogin()));
}
const AUTH_MSG = {
  'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.', 'auth/wrong-password': 'E-Mail oder Passwort ist falsch.',
  'auth/user-not-found': 'Zu dieser E-Mail gibt es kein Konto.', 'auth/invalid-email': 'Die E-Mail-Adresse ist ungültig.',
  'auth/email-already-in-use': 'Zu dieser E-Mail gibt es schon ein Konto. Melde dich an.',
  'auth/weak-password': 'Das Passwort braucht mindestens 6 Zeichen.', 'auth/missing-password': 'Bitte ein Passwort eingeben.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte kurz warten.', 'auth/network-request-failed': 'Keine Internetverbindung.',
  'auth/account-exists-with-different-credential': 'Diese E-Mail ist schon mit Passwort registriert. Melde dich mit E-Mail und Passwort an.',
};
function authError(e) {
  if (!e || ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
  const msg = AUTH_MSG[e.code] || 'Anmeldung fehlgeschlagen: ' + (e.message || e);
  if ($('#lerr')) $('#lerr').textContent = msg; else alert(msg);
}
async function googleLogin() {
  const p = new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await fb.auth.signInWithPopup(p); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) return fb.auth.signInWithRedirect(p);
    authError(e);
  }
}
function emailLogin() {
  fb.auth.signInWithEmailAndPassword($('#lmail').value.trim(), $('#lpass').value).catch(authError);
}
async function emailSignup() {
  const name = $('#lname').value.trim();
  if (!name) return authError({ message: 'Bitte deinen Namen eintragen.' });
  try {
    const r = await fb.auth.createUserWithEmailAndPassword($('#lmail').value.trim(), $('#lpass').value);
    await r.user.updateProfile({ displayName: name });
    if (data.settings && !data.settings.name) { data.settings.name = name; if (own.shared) save(); }
  } catch (e) { authError(e); }
}
function resetPassword() {
  const mail = $('#lmail').value.trim();
  if (!mail) return authError({ message: 'Trag oben deine E-Mail ein, dann schicken wir dir einen Link.' });
  fb.auth.sendPasswordResetEmail(mail)
    .then(() => { $('#lerr').textContent = ''; alert('Wir haben dir einen Link zum Zurücksetzen an ' + mail + ' geschickt.'); })
    .catch(authError);
}
function logout() {
  if (!confirm('Abmelden?')) return;
  fb.auth.signOut();
}
function cloudError(e) {
  console.error(e);
  if (e.code === 'permission-denied') return;  // z. B. aus der Firma entfernt, wird über den Status angezeigt
  alert('Speichern in der Cloud fehlgeschlagen: ' + e.message);
}

// ---------- konto & firma (Setup) ----------
function displayName() { return data.settings.name || me.displayName || me.email; }
function accountHtml() {
  if (viewing || !me) return '';
  let firm;
  if (!cid) firm = `<button class="row" onclick="companyForm()"><span>Firma anlegen (ich bin Chef)</span><span class="muted">›</span></button>
    <button class="row" onclick="joinForm()"><span>Firma beitreten (Code vom Chef)</span><span class="muted">›</span></button>`;
  else if (isOwner()) firm = `<button class="row" onclick="go('team')"><span>Chef von <b>${esc(company.name)}</b></span><span class="muted">Team ›</span></button>`;
  else if (membership?.status === 'active') firm = `<div class="row"><span>Mitarbeiter bei <b>${esc(company?.name || membership.companyName)}</b></span></div>
    <button class="row" onclick="leaveCompany()"><span class="red">Firma verlassen</span></button>`;
  else if (membership?.status === 'pending') firm = `<div class="row"><span>Anfrage an <b>${esc(membership.companyName)}</b> gesendet. Der Chef muss dich noch freigeben.</span></div>
    <button class="row" onclick="leaveCompany()"><span class="red">Anfrage zurückziehen</span></button>`;
  else if (membership === null && company === null) firm = `<div class="row"><span>Deine Anfrage wurde abgelehnt oder du wurdest aus der Firma entfernt.</span></div>
    <button class="row" onclick="leaveCompany()"><span>OK</span><span class="muted">›</span></button>`;
  else firm = '<div class="row muted">Lädt …</div>';
  return `<div class="label">Konto</div>
  <div class="group">
    <div class="row"><span>${esc(me.email || me.displayName)}<div class="muted small">${me.providerData.some(p => p.providerId === 'google.com') ? 'Google-Konto' : 'E-Mail-Konto'}</div></span><button class="pill sm" onclick="logout()">Abmelden</button></div>
  </div>
  <div class="label">Firma</div>
  <div class="group">${firm}</div>`;
}

function newCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join(''); }
async function freeCode() {
  for (;;) { const c = newCode(); if (!(await ref('invites/' + c).get()).exists) return c; }
}

function companyForm() {
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="closeSheet()">Abbrechen</button><button class="pill sm green" onclick="createCompany()">Anlegen</button></div>
  <h2>Firma anlegen</h2>
  <div class="group"><label class="row"><span>Name der Firma</span><input id="cname" placeholder="z. B. Muster GmbH"></label></div>
  <p class="hint">Du bekommst einen Einladungscode. Mitarbeiter geben ihn in ihrer App ein, du gibst sie dann frei und siehst ihre Zeiten.</p>`);
}
async function createCompany() {
  const name = $('#cname').value.trim();
  if (!name) return alert('Bitte einen Namen eintragen.');
  try {
    const code = await freeCode(), c = fb.db.collection('companies').doc();
    await c.set({ name, owner: me.uid, ownerName: displayName(), code, created: firebase.firestore.FieldValue.serverTimestamp() });
    await ref('invites/' + code).set({ cid: c.id, name });
    await ref('data/' + me.uid).update({ cid: c.id });
    closeSheet(); tab = 'team';
  } catch (e) { alert('Firma konnte nicht angelegt werden: ' + e.message); }
}

function joinForm(code = '') {
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="closeSheet()">Abbrechen</button><button class="pill sm green" onclick="joinCompany()">Beitreten</button></div>
  <h2>Firma beitreten</h2>
  <div class="group">
    <label class="row"><span>Einladungscode</span><input id="jcode" class="short" value="${esc(code)}" autocapitalize="characters" placeholder="ABC123" style="text-transform:uppercase"></label>
    <label class="row"><span>Dein Name</span><input id="jname2" value="${esc(displayName())}"></label>
  </div>
  <p class="hint">Den Code bekommst du von deinem Chef. Nach der Freigabe sieht er deine Zeiten und Abwesenheiten und kann sie korrigieren. Gehalt und Steuerdaten sieht er nicht.</p>`);
}
async function joinCompany() {
  const code = $('#jcode').value.trim().toUpperCase(), name = $('#jname2').value.trim();
  if (!code || !name) return alert('Bitte Code und Namen eintragen.');
  try {
    const inv = await ref('invites/' + code).get();
    if (!inv.exists) return alert('Diesen Code gibt es nicht. Frag deinen Chef nach dem aktuellen Code.');
    const { cid: id, name: companyName } = inv.data();
    await ref(`companies/${id}/members/${me.uid}`).set({ name, email: me.email || '', status: 'pending', code, companyName, requested: firebase.firestore.FieldValue.serverTimestamp() });
    data.settings.name = name;
    await ref('data/' + me.uid).update({ cid: id, 'settings.name': name });
    closeSheet();
    alert(`Anfrage an ${companyName} gesendet. Sobald dein Chef dich freigibt, bist du drin.`);
  } catch (e) {
    alert(e.code === 'permission-denied' ? 'Beitritt nicht möglich. Vielleicht bist du schon Mitglied oder der Code ist abgelaufen.' : 'Beitritt fehlgeschlagen: ' + e.message);
  }
}
async function leaveCompany() {
  if (membership && !confirm(membership.status === 'active' ? 'Firma wirklich verlassen? Dein Chef sieht deine Zeiten dann nicht mehr.' : 'Anfrage zurückziehen?')) return;
  try {
    if (membership) await ref(`companies/${cid}/members/${me.uid}`).delete();
    await ref('data/' + me.uid).update({ cid: null });
  } catch (e) { alert(e.message); }
}

// ---------- team (nur Chef) ----------
function renderTeam() {
  if (!isOwner()) return renderStart();
  const pending = members.filter(m => m.status === 'pending'), active = members.filter(m => m.status === 'active');
  const link = location.origin + location.pathname + '?join=' + company.code;
  view.innerHTML = `<h1 class="center">${esc(company.name)}</h1>
  <div class="label">Einladung</div>
  <div class="card center">
    <div class="muted small">Einladungscode</div>
    <div class="code">${esc(company.code)}</div>
    <div class="two" style="margin:14px 0 0"><button class="pill" onclick="shareInvite()">Link teilen</button><button class="pill" onclick="rotateCode()">Neuer Code</button></div>
  </div>
  <p class="hint" style="margin-top:8px">Mitarbeiter öffnen den Link oder geben den Code unter Setup → Firma beitreten ein. Ein neuer Code macht den alten ungültig.</p>
  ${pending.length ? `<div class="label">Anfragen</div><div class="group">${pending.map(m => `<div class="row"><span>${esc(m.name)}<div class="muted small">${esc(m.email)}</div></span>
    <span style="display:flex;gap:6px"><button class="pill sm red" onclick="rejectMember('${m.uid}')">Ablehnen</button><button class="pill sm green" onclick="approveMember('${m.uid}')">Freigeben</button></span></div>`).join('')}</div>` : ''}
  <div class="label">Mitarbeiter</div>
  ${active.length ? `<div class="group">${active.map(m => { const s = teamStats[m.uid]; return `<button class="row" onclick="viewMember('${m.uid}')">
    <span>${s?.running ? '<span class="green">●</span> ' : ''}${esc(m.name)}<div class="muted small">${s ? 'Diese Woche ' + dur(s.week) : esc(m.email)}</div></span>
    <span>${s ? `<span class="${cls(s.balance)}">${hm(s.balance, true)}</span>` : ''} ›</span></button>`; }).join('')}</div>
    <p class="hint">Grüner Punkt = gerade eingestempelt. Rechts das Überstundenkonto. Tippen zeigt Wochen, Monate und PDF des Mitarbeiters, dort kannst du auch korrigieren.</p>`
    : '<p class="muted center">Noch keine Mitarbeiter. Teil den Einladungscode.</p>'}
  ${active.length ? '<button class="big" onclick="openTeamExport()">Team als Excel exportieren</button>' : ''}`;
}
async function shareInvite() {
  const link = location.origin + location.pathname + '?join=' + company.code;
  const text = `Tritt ${company.name} in der Stempeluhr bei: ${link} (Code ${company.code})`;
  if (navigator.share) { try { await navigator.share({ text }); } catch {} return; }
  try { await navigator.clipboard.writeText(link); alert('Link kopiert:\n' + link); } catch { prompt('Link kopieren:', link); }
}
async function rotateCode() {
  if (!confirm('Neuen Code erzeugen? Der alte Code funktioniert dann nicht mehr. Bestehende Mitarbeiter bleiben drin.')) return;
  try {
    const code = await freeCode(), old = company.code;
    await ref('invites/' + code).set({ cid: company.id, name: company.name });
    await ref('companies/' + company.id).update({ code });
    await ref('invites/' + old).delete();
  } catch (e) { alert(e.message); }
}
function approveMember(uid) { ref(`companies/${cid}/members/${uid}`).update({ status: 'active' }).catch(cloudError); }
function rejectMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (confirm(`Anfrage von ${m.name} ablehnen?`)) ref(`companies/${cid}/members/${uid}`).delete().catch(cloudError);
}
function removeMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (!confirm(`${m.name} aus der Firma entfernen? Du siehst die Zeiten dann nicht mehr. Die Daten bleiben beim Mitarbeiter.`)) return;
  stopViewing();
  ref(`companies/${cid}/members/${uid}`).delete().catch(cloudError);
}

function viewMember(uid) {
  const m = members.find(x => x.uid === uid);
  viewing = { uid, name: m.name };
  tab = 'week'; weekStart = monday(today());
  view.innerHTML = '<p class="center muted" style="margin-top:40vh">Lädt …</p>';
  updateTabs();
  viewUnsub = ref('data/' + uid).onSnapshot(s => {
    if (s.metadata.hasPendingWrites || !viewing) return;
    data = s.exists ? merged(s.data(), null) : normalize({});
    refresh();
  }, e => { alert('Zeiten konnten nicht geladen werden: ' + e.message); stopViewing(); });
}
function stopViewing() {
  viewUnsub?.(); viewUnsub = null;
  if (!viewing) return;
  viewing = null;
  data = merged(own.shared, own.priv);
  updateTabs(); closeSheet(); go('team');
}
function viewBanner() {
  return viewing ? `<div class="viewing"><span>Ansicht: <b>${esc(viewing.name)}</b></span><button class="pill sm" onclick="stopViewing()">Zurück zum Team</button></div>` : '';
}
