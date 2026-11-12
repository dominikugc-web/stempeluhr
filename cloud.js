// Login (Google oder E-Mail), Speichern in Firestore und Firmenverwaltung. Die Zeit-Oberfläche liegt in app.js.
// Gehalts- und Steuerangaben liegen getrennt in private/{uid}, damit der Geschäftsführer sie nie sieht.
const PRIVATE = ['jobs', 'stkl', 'zkf', 'kirche', 'kvz', 'pv', 'hourly', 'theme', 'tips'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const G_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';

let fb = null, me = null;
let own = {};               // letzte Snapshots der eigenen Dokumente: { shared, priv, sharedSeen, privSeen }
let cid = undefined;        // Firma laut eigenem Datendokument
let company, membership, members = [], teamStats = {}; // undefined = lädt noch, null = gibt es nicht / kein Zugriff
let membersOn = false;
let viewing = null;         // { uid, name } wenn der Geschäftsführer einen Mitarbeiter ansieht
let unsubs = [], companyUnsubs = [], viewUnsub = null;
let joinCode = new URLSearchParams(location.search).get('join');

// Entwickler-App (admin/index.html): dieselbe Oberfläche mit Umschalter Entwickler / Geschäftsführer / Mitarbeiter / Ich.
// Die UID muss auch in firestore.rules (isAdmin) stehen, sonst verweigert der Server den Zugriff.
const ADMIN_UIDS = ['Pb3LEKsVdveCrDdWyhuqOkoNcc63'];
const ADMIN_APP = !!window.ADMIN_APP;
const APP_URL = location.origin + location.pathname.replace(/admin\/(index\.html)?$/, '');
let role = 'self', adminCache = null, adminQuery = '';
const isAdmin = () => !!me && ADMIN_UIDS.includes(me.uid);

const isOwner = () => !!(company && me && (company.owner === me.uid || (ADMIN_APP && role === 'boss' && isAdmin())));
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
  if (own.shared.cid !== cid) {
    if (ADMIN_APP && role !== 'self') cid = own.shared.cid || null;  // Admin sieht gerade eine andere Firma
    else watchCompany(own.shared.cid || null);
  }
  if (s.metadata.hasPendingWrites && own.ready) return;  // eigene Änderung, data ist schon aktuell
  own.ready = true;
  if (!viewing) data = merged(own.shared, own.priv);
  if (ADMIN_APP && !own.roleSet) { own.roleSet = true; return isAdmin() ? setRole('dev') : renderNoAccess(); }
  if (ADMIN_APP && !isAdmin()) return;
  if (ADMIN_APP && role === 'dev') return;
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
  if (ADMIN_APP) { own.roleSet = true; return isAdmin() ? setRole('dev') : renderNoAccess(); }
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
  const doc = { sessions: data.sessions, absences: data.absences, adjustments: data.adjustments, settings: shared, email: me.email || '' };
  if (first) doc.cid = null;
  b.set(ref('data/' + me.uid), doc, first ? undefined : { merge: true });
  b.set(ref('private/' + me.uid), { settings: priv });
  b.commit().catch(cloudError);
}
function refresh() { if ($('#sheet').hidden) render(); }

// ---------- firma beobachten ----------
function watchCompany(id, acting) {  // acting: Entwickler sieht eine fremde Firma als Geschäftsführer
  off(companyUnsubs);
  if (!acting) cid = id;
  company = undefined; membership = undefined; members = []; teamStats = {}; membersOn = false;
  if (!id) return updateTabs();
  const listenCompany = () => companyUnsubs.push(ref('companies/' + id).onSnapshot(s => {
    company = s.exists ? { id, ...s.data() } : null;
    if (isOwner() && !membersOn) {
      membersOn = true;
      companyUnsubs.push(fb.db.collection(`companies/${id}/members`).onSnapshot(q => {
        members = q.docs.map(d => ({ uid: d.id, ...d.data() }));
        loadTeamStats(); updateTabs(); refreshTeam();
      }, cloudError));
    }
    updateTabs(); refreshTeam();
  }, () => { company = null; updateTabs(); refresh(); }));
  if (!acting) companyUnsubs.push(ref(`companies/${id}/members/${me.uid}`).onSnapshot(s => {
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
  refreshTeam();
}
function refreshTeam() { if (currentTopic === 'team') openTopic('team', true); else refresh(); }

// ---------- tabs ----------
function showTabs(on) { $('.tabs').hidden = !on; if (on) { updateTabs(); requestAnimationFrame(moveTabInd); } }
function updateTabs() {
  const show = { start: !viewing || viewing.preview, pay: !viewing };
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab in show) b.hidden = !show[b.dataset.tab]; });
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
  if (!cid) firm = `<button class="row" onclick="companyForm()"><span>Firma anlegen (ich bin Geschäftsführer)</span><span class="muted">›</span></button>
    <button class="row" onclick="joinForm()"><span>Firma beitreten (Code vom Geschäftsführer)</span><span class="muted">›</span></button>`;
  else if (isOwner()) firm = `<button class="row" onclick="openTopic('team')"><span>Geschäftsführer von <b>${esc(company.name)}</b></span><span class="muted">Team ›</span></button>`;
  else if (membership?.status === 'active') firm = `<div class="row"><span>Mitarbeiter bei <b>${esc(company?.name || membership.companyName)}</b></span></div>
    <button class="row" onclick="leaveCompany()"><span class="red">Firma verlassen</span></button>`;
  else if (membership?.status === 'pending') firm = `<div class="row"><span>Anfrage an <b>${esc(membership.companyName)}</b> gesendet. Der Geschäftsführer muss dich noch freigeben.</span></div>
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
    closeSheet();
    if (data.settings.onboarded !== false) { go('setup'); openTopic('team'); }  // in der Einführung geht es dort weiter
    return true;
  } catch (e) { alert('Firma konnte nicht angelegt werden: ' + e.message); }
}

function joinForm(code = '') {
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="closeSheet()">Abbrechen</button><button class="pill sm green" onclick="joinCompany()">Beitreten</button></div>
  <h2>Firma beitreten</h2>
  <div class="group">
    <label class="row"><span>Einladungscode</span><input id="jcode" class="short" value="${esc(code)}" autocapitalize="characters" placeholder="ABC123" style="text-transform:uppercase"></label>
    <label class="row"><span>Dein Name</span><input id="jname2" value="${esc(displayName())}"></label>
  </div>
  <p class="hint">Den Code bekommst du von deinem Geschäftsführer. Nach der Freigabe sieht er deine Zeiten und Abwesenheiten und kann sie korrigieren. Gehalt und Steuerdaten sieht er nicht.</p>`);
}
async function joinCompany() {
  const code = $('#jcode').value.trim().toUpperCase(), name = $('#jname2').value.trim();
  if (!code || !name) return alert('Bitte Code und Namen eintragen.');
  try {
    const inv = await ref('invites/' + code).get();
    if (!inv.exists) return alert('Diesen Code gibt es nicht. Frag deinen Geschäftsführer nach dem aktuellen Code.');
    const { cid: id, name: companyName } = inv.data();
    await ref(`companies/${id}/members/${me.uid}`).set({ name, email: me.email || '', status: 'pending', code, companyName, requested: firebase.firestore.FieldValue.serverTimestamp() });
    data.settings.name = name;
    await ref('data/' + me.uid).update({ cid: id, 'settings.name': name });
    closeSheet();
    alert(`Anfrage an ${companyName} gesendet. Sobald dein Geschäftsführer dich freigibt, bist du drin.`);
    return true;
  } catch (e) {
    alert(e.code === 'permission-denied' ? 'Beitritt nicht möglich. Vielleicht bist du schon Mitglied oder der Code ist abgelaufen.' : 'Beitritt fehlgeschlagen: ' + e.message);
  }
}
async function leaveCompany() {
  if (membership && !confirm(membership.status === 'active' ? 'Firma wirklich verlassen? Dein Geschäftsführer sieht deine Zeiten dann nicht mehr.' : 'Anfrage zurückziehen?')) return;
  try {
    if (membership) await ref(`companies/${cid}/members/${me.uid}`).delete();
    await ref('data/' + me.uid).update({ cid: null });
  } catch (e) { alert(e.message); }
}

// ---------- team (nur Geschäftsführer) ----------
function teamHtml() {  // Inhalt des Fensters Setup → Team
  if (!isOwner()) return '<p class="center muted">Lädt …</p>';
  const pending = members.filter(m => m.status === 'pending'), active = members.filter(m => m.status === 'active');
  return `<p class="center"><b>${esc(company.name)}</b></p>
  <div class="label">Einladung</div>
  <div class="card center">
    <div class="muted small">Einladungscode</div>
    <div class="code">${esc(company.code)}</div>
    <div class="two" style="margin:14px 0 0"><button class="pill" onclick="shareInvite()">Link teilen</button><button class="pill" onclick="rotateCode()">Neuer Code</button></div>
  </div>
  <p class="hint" style="margin-top:8px">Mitarbeiter öffnen den Link oder geben den Code unter Setup → Konto & Firma ein. Ein neuer Code macht den alten ungültig.</p>
  ${pending.length ? `<div class="label">Anfragen</div><div class="group">${pending.map(m => `<div class="row"><span>${esc(m.name)}<div class="muted small">${esc(m.email)}</div></span>
    <span style="display:flex;gap:6px"><button class="pill sm red" onclick="rejectMember('${m.uid}')">Ablehnen</button><button class="pill sm green" onclick="approveMember('${m.uid}')">Freigeben</button></span></div>`).join('')}</div>` : ''}
  <div class="label">Mitarbeiter</div>
  ${active.length ? `<div class="group">${active.map(m => { const s = teamStats[m.uid]; return `<button class="row" onclick="viewMember('${m.uid}')">
    <span>${s?.running ? '<span class="green">●</span> ' : ''}${esc(m.name)}<div class="muted small">${s ? 'Diese Woche ' + dur(s.week) : esc(m.email)}</div></span>
    <span>${s ? `<span class="${cls(s.balance)}">${hm(s.balance, true)}</span>` : ''} ›</span></button>`; }).join('')}</div>
    <p class="hint">Grüner Punkt = gerade eingestempelt. Rechts das Überstundenkonto. Tippen zeigt den Kalender des Mitarbeiters, dort kannst du auch Zeiten korrigieren.</p>`
    : '<p class="muted center">Noch keine Mitarbeiter. Teil den Einladungscode.</p>'}
  ${active.length ? '<button class="big" onclick="openTeamExport()">Team als Excel exportieren</button>' : ''}`;
}
async function shareInvite() {
  const link = APP_URL + '?join=' + company.code;
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
function approveMember(uid) { ref(`companies/${company.id}/members/${uid}`).update({ status: 'active' }).catch(cloudError); }
function rejectMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (confirm(`Anfrage von ${m.name} ablehnen?`)) ref(`companies/${company.id}/members/${uid}`).delete().catch(cloudError);
}
function removeMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (!confirm(`${m.name} aus der Firma entfernen? Du siehst die Zeiten dann nicht mehr. Die Daten bleiben beim Mitarbeiter.`)) return;
  stopViewing();
  ref(`companies/${company.id}/members/${uid}`).delete().catch(cloudError);
}

function viewMember(uid) { closeSheet(); viewAs(uid, members.find(x => x.uid === uid).name); }
function viewAs(uid, name, startTab = 'cal', preview = false) {  // preview: Entwickler sieht die App wie dieser Mitarbeiter
  viewUnsub?.(); viewUnsub = null;
  viewing = { uid, name, preview };
  tab = startTab; calView = 'week'; calDay = today();
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
  const preview = viewing.preview;
  viewing = null;
  data = merged(own.shared, own.priv);
  if (preview) return setRole('dev');
  updateTabs(); closeSheet(); go('setup'); openTopic('team');
}
function viewBanner() {
  if (viewing?.preview) return '';
  return viewing ? `<div class="viewing"><span>Ansicht: <b>${esc(viewing.name)}</b></span><button class="pill sm" onclick="stopViewing()">Zurück zum Team</button></div>` : '';
}

// ---------- entwickler-bereich (nur admin/index.html) ----------
function renderNoAccess() {
  showTabs(false);
  view.innerHTML = `<div class="card center" style="margin-top:20vh"><h2>Kein Zugriff</h2>
    <p class="muted">Dieser Bereich ist nur für Entwickler. Angemeldet als ${esc(me.email || me.uid)}.</p>
    <button class="pill wide" onclick="fb.auth.signOut()">Abmelden</button><a class="pill wide" href="${APP_URL}">Zur Stempeluhr</a></div>`;
}
async function setRole(r, id) {
  viewUnsub?.(); viewUnsub = null; viewing = null; closeSheet();
  role = r;
  data = merged(own.shared, own.priv);
  if (r === 'dev') { showTabs(false); tab = 'admin'; render(); view.scrollTop = 0; return loadAdmin(); }
  showTabs(true);
  if (r === 'self') { watchCompany(own.shared.cid || null); return go('start'); }
  if (!adminCache) await loadAdmin();
  if (r === 'boss') {
    const c = id || company?.id || adminCache.companies[0]?.id;
    if (!c) { alert('Es gibt noch keine Firma.'); return setRole('dev'); }
    watchCompany(c, true); updateTabs(); go('setup'); return openTopic('team');
  }
  if (r === 'emp') {
    const u = adminCache.users.find(x => x.uid === id) || adminCache.users.find(x => x.uid !== me.uid) || adminCache.users[0];
    if (!u) return setRole('dev');
    viewAs(u.uid, u.name, 'start', true);
  }
}
async function loadAdmin() {
  try {
    const [d, c, m] = await Promise.all([fb.db.collection('data').get(), fb.db.collection('companies').get(), fb.db.collectionGroup('members').get()]);
    const t = today(), mem = m.docs.map(x => ({ uid: x.id, cid: x.ref.parent.parent.id, ...x.data() }));
    const users = d.docs.map(x => {
      const v = x.data(), dd = merged(v, null), mm = mem.find(y => y.uid === x.id && y.cid === v.cid);
      return { uid: x.id, name: dd.settings.name || mm?.name || v.email || 'Ohne Namen', email: v.email || mm?.email || '', cid: v.cid || null, status: mm?.status,
        running: dd.sessions.some(s => s.e == null), last: dd.sessions.reduce((a, s) => Math.max(a, s.e || Date.now()), 0), balance: makeCalc(dd, Date.now()).balance(t) };
    });
    const companies = c.docs.map(x => {
      const v = x.data(), ms = mem.filter(y => y.cid === x.id);
      return { id: x.id, name: v.name, owner: v.owner, ownerName: v.ownerName || users.find(u => u.uid === v.owner)?.name || '', code: v.code,
        active: ms.filter(y => y.status === 'active').length, pending: ms.filter(y => y.status === 'pending').length };
    });
    adminCache = { users: users.sort((a, b) => b.last - a.last), companies: companies.sort((a, b) => a.name.localeCompare(b.name)), at: Date.now() };
  } catch (e) {
    alert('Entwickler-Daten konnten nicht geladen werden: ' + e.message);
    adminCache ||= { users: [], companies: [], at: Date.now() };
  }
  if (tab === 'admin' || role !== 'dev') refresh();
}
function adminBar() {
  if (!ADMIN_APP || !isAdmin()) return '';
  const seg = (r, l) => `<button class="pill sm ${role === r ? 'sel' : ''}" onclick="setRole('${r}')">${l}</button>`;
  let ctx = '';
  if (role === 'boss' && adminCache?.companies.length)
    ctx = `<label class="row"><span>Firma</span><select onchange="setRole('boss', this.value)">${adminCache.companies.map(c => `<option value="${c.id}" ${company?.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
  if (role === 'emp' && adminCache?.users.length)
    ctx = `<label class="row"><span>Mitarbeiter</span><select onchange="setRole('emp', this.value)">${adminCache.users.map(u => `<option value="${u.uid}" ${viewing?.uid === u.uid ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>`;
  return `<div class="adminbar"><div class="seg">${seg('dev', 'Entwickler')}${seg('boss', 'Geschäftsführer')}${seg('emp', 'Mitarbeiter')}${seg('self', 'Ich')}</div>
    ${ctx ? `<div class="group">${ctx}</div>` : ''}${role === 'emp' ? '<p class="hint">Vorschau: So sieht dieser Mitarbeiter die App. Stempeln ist gesperrt, Korrekturen im Kalender werden gespeichert.</p>' : ''}</div>`;
}
function renderAdmin() {
  const a = adminCache;
  if (!a) { view.innerHTML = '<p class="center muted" style="margin-top:30vh">Lädt …</p>'; return; }
  const wk = Date.now() - 7 * 86400000, kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  view.innerHTML = `<h1 class="center">Entwickler</h1>
  <div class="kpis">${kpi(a.users.length, 'Nutzer')}${kpi(a.companies.length, 'Firmen')}${kpi(a.users.filter(u => u.running).length, 'gerade eingestempelt')}${kpi(a.users.filter(u => u.last > wk).length, 'aktiv (7 Tage)')}</div>
  <div class="label">Firmen</div>
  ${a.companies.length ? `<div class="group">${a.companies.map(c => `<button class="row" onclick="setRole('boss', '${c.id}')"><span><b>${esc(c.name)}</b>
    <div class="muted small">Geschäftsführer: ${esc(c.ownerName || '–')} · ${c.active} Mitarbeiter${c.pending ? ` · <span class="red">${c.pending} Anfrage${c.pending > 1 ? 'n' : ''}</span>` : ''} · Code ${esc(c.code)}</div></span><span class="muted">Ansehen ›</span></button>`).join('')}</div>` : '<p class="muted center">Noch keine Firmen.</p>'}
  <div class="label">Nutzer</div>
  <div class="group"><div class="row"><input class="full" placeholder="Name oder E-Mail suchen" value="${esc(adminQuery)}" oninput="adminQuery = this.value; $('#ulist').innerHTML = adminUsers()"></div></div>
  <div id="ulist">${adminUsers()}</div>
  <button class="pill wide" onclick="adminCache = null; render(); loadAdmin()">Aktualisieren</button>
  <p class="hint">Stand ${new Date(a.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}. Tippe auf eine Firma, um sie als Geschäftsführer zu sehen, oder auf einen Nutzer für seine Mitarbeiter-Ansicht. Gehalts- und Steuerdaten der Nutzer sind auch für Entwickler gesperrt.</p>
  <div class="group"><div class="row"><span>${esc(me.email)}</span><button class="pill sm" onclick="logout()">Abmelden</button></div></div>
  <a class="pill wide" href="${APP_URL}">Normale App öffnen</a>`;
}
function adminUsers() {
  const a = adminCache, q = adminQuery.trim().toLowerCase();
  const list = a.users.filter(u => !q || (u.name + ' ' + u.email).toLowerCase().includes(q));
  const firm = u => {
    const own = a.companies.find(c => c.owner === u.uid), c = a.companies.find(c => c.id === u.cid);
    return own ? `Geschäftsführer von ${esc(own.name)}` : c ? `${esc(c.name)}${u.status === 'pending' ? ' (Anfrage offen)' : u.status ? '' : ' (nicht freigegeben)'}` : 'ohne Firma';
  };
  if (!list.length) return '<p class="muted center">Keine Treffer.</p>';
  return `<div class="group">${list.map(u => `<button class="row" onclick="setRole('emp', '${u.uid}')"><span>${u.running ? '<span class="green">●</span> ' : ''}<b>${esc(u.name)}</b>${u.uid === me.uid ? ' (du)' : ''}
    <div class="muted small">${esc(u.email)}${u.email ? ' · ' : ''}${firm(u)} · ${u.last ? 'zuletzt ' + dmy(ymd(new Date(u.last))) : 'noch nie gestempelt'}</div></span>
    <span class="${cls(u.balance)}">${hm(u.balance, true)} ›</span></button>`).join('')}</div>`;
}
