// Login (Google oder E-Mail), Speichern in Firestore und Firmenverwaltung. Die Zeit-Oberfläche liegt in app.js.
// Webseite mit Datenschutz und Impressum (aus der Admin-App eine Ebene höher)
const WEB = location.pathname.includes("/admin/") ? "../web/" : "web/";
// Gehalts- und Steuerangaben liegen getrennt in private/{uid}: der Geschäftsführer sieht sie nie, der Entwickler-Support nur lesend.
const PRIVATE = ['jobs', 'stkl', 'zkf', 'kirche', 'kvz', 'pv', 'hourly', 'theme', 'tips', 'locs', 'payroll', 'firmPriv'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const G_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';

let fb = null, me = null;
let own = {};               // letzte Snapshots der eigenen Dokumente: { shared, priv, sharedSeen, privSeen }
let cid = undefined;        // Firma laut eigenem Datendokument
let company, membership, members = [], teamStats = {}; // undefined = lädt noch, null = gibt es nicht / kein Zugriff
let companyAdmin = {};      // companies/{cid}/admin/settings: gemeinsame Einstellungen der Geschäftsführer
// Mehrere Firmen: myCompanies = alle Firmen, die ich gegründet habe. Meine eigenen Zeiten gehören zu cid (eigene Firma),
// angezeigt wird die gewählte Firma (company). Andere Firmen werden wie beim Entwickler „acting“ beobachtet.
let myCompanies = [];
const firmKey = () => 'stempeluhr-firm-' + (me?.uid || '');
let membersOn = false;
let viewing = null;         // { uid, name } wenn der Geschäftsführer einen Mitarbeiter ansieht
let unsubs = [], companyUnsubs = [], viewUnsub = null;
let joinCode = new URLSearchParams(location.search).get('join')?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
// Aus einer Benachrichtigung geöffnet (?fb=…): nach dem Laden einmal den Chat öffnen
const qs = new URLSearchParams(location.search);
let pushOpen = qs.get('fb') || (qs.has('slips') ? '#slips' : qs.has('team') ? '#team' : null);
function pushStartOpen() { if (!pushOpen) return; const u = pushOpen === '#slips' ? '?slips=1' : pushOpen === '#team' ? '?team=1' : '?fb=' + pushOpen; pushOpen = null; history.replaceState(null, '', location.pathname); setTimeout(() => openFromPush(u), 300); }

// Entwickler-App (admin/index.html): dieselbe Oberfläche mit Umschalter Entwickler / Geschäftsführer / Mitarbeiter / Ich.
// Die UID muss auch in firestore.rules (isAdmin) stehen, sonst verweigert der Server den Zugriff.
const ADMIN_UIDS = ['Pb3LEKsVdveCrDdWyhuqOkoNcc63'];
const ADMIN_APP = !!window.ADMIN_APP;
const APP_URL = location.origin + location.pathname.replace(/admin\/(index\.html)?$/, '');
let role = 'self', adminCache = null, adminQuery = '';
const isAdmin = () => !!me && ADMIN_UIDS.includes(me.uid);

// Geschäftsführer = Gründer der Firma oder freigegebenes Mitglied mit Rolle „Geschäftsführer“ (gleiche Rechte)
// Entwickler „als Nutzer“: asUser = der Nutzer, dessen Sicht gerade gezeigt wird (sonst null)
let asUser = null;
const actingUid = () => (ADMIN_APP && role === 'as' && asUser) ? asUser.uid : me?.uid;
const asSelf = () => !!(ADMIN_APP && role === 'as' && asUser && viewing?.uid === asUser.uid);
const isFounder = () => !!(company && me && company.owner === actingUid());
const isOwner = () => !!(company && me && (company.owner === actingUid() || (membership?.status === 'active' && membership.role === 'boss')
  || (ADMIN_APP && role === 'boss' && isAdmin())));
// Alle Personen der Firma: Gründer + freigegebene Mitglieder (Geschäftsführer zuerst, „du“ markiert)
function teamPeople() {
  if (!company) return [];
  const list = company.ownerTracks === false ? [] : [{ uid: company.owner, name: company.ownerName || 'Gründer', boss: true, founder: true }];
  for (const m of members) if (m.status === 'active' && m.uid !== company.owner) list.push({ uid: m.uid, name: m.name, email: m.email, boss: m.role === 'boss' });
  return list.map(p => ({ ...p, self: p.uid === actingUid() })).sort((a, b) => (b.boss - a.boss) || (a.self - b.self) || a.name.localeCompare(b.name, 'de'));
}
const off = list => { list.forEach(f => f()); list.length = 0; };
const ref = path => fb.db.doc(path);

// ---------- nur als App (Handy) ----------
// Auf dem Handy läuft die Stempeluhr nur als installierte App vom Home-Bildschirm. Im Browser erscheint stattdessen
// eine Anleitung. So meldet man sich gleich in der App an (Safari und Home-Bildschirm-App teilen keine Anmeldung).
// Zum Testen im Handy-Browser: ?web anhängen.
const UA = navigator.userAgent;
const IS_ANDROID = /Android/.test(UA);
const IS_IOS = !IS_ANDROID && (/iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/Chrome\//.test(UA)));
const IS_STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if ($('#instbtn')) $('#instbtn').hidden = false; });
addEventListener('appinstalled', () => { if ($('#instdone')) { $('#instdone').hidden = false; $('#instbtn').hidden = true; } });
function needInstall() {
  const q = new URLSearchParams(location.search);
  if (q.has('emu') || q.has('web') || IS_STANDALONE) return false;
  return IS_IOS || IS_ANDROID;
}
function renderInstall() {
  showTabs(false);
  const code = new URLSearchParams(location.search).get('join');
  const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\/|LinkedInApp|Snapchat|TikTok/.test(UA) || (IS_IOS && !/Safari\//.test(UA));
  const crios = /CriOS|FxiOS|EdgiOS/.test(UA);
  const share = '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const plus = '<svg viewBox="0 0 24 24" class="ico"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const step = (n, html) => `<div class="istep"><span class="inum">${n}</span><span>${html}</span></div>`;
  let steps;
  if (inApp) steps = `<p class="center">Du hast den Link in einer anderen App geöffnet. Öffne ihn bitte in ${IS_IOS ? '<b>Safari</b>' : '<b>Chrome</b>'}:</p>
    ${step(1, `Tippe oben rechts auf <b>•••</b> bzw. das Menü`)}${step(2, `Wähle <b>„In ${IS_IOS ? 'Safari' : 'Browser'} öffnen“</b>`)}
    <button class="pill wide" onclick="copyAppLink()">Link kopieren</button>`;
  else if (IS_IOS) steps = `
    ${crios ? '' : `<p class="small muted" style="margin:0">Aus Telegram, WhatsApp o. Ä. geöffnet? Dann zuerst unten rechts auf das Kompass-Symbol tippen, damit der Link in Safari aufgeht.</p>`}
    ${step(1, `Tippe ${crios ? 'oben in der Adressleiste' : 'unten'} auf ${share} <b>Teilen</b>.<div class="muted small">Neues iOS: erst auf <b>•••</b> tippen, dann auf Teilen.</div>`)}
    ${step(2, `Scrolle nach unten und tippe auf ${plus} <b>„Zum Home-Bildschirm“</b>.`)}
    ${step(3, `„Als Web-App öffnen“ eingeschaltet lassen und auf <b>Hinzufügen</b> tippen.`)}
    ${step(4, `Öffne die <b>Stempeluhr</b> auf deinem Home-Bildschirm und melde dich dort an.`)}`;
  else steps = `<button class="big" id="instbtn" ${installEvt ? '' : 'hidden'} onclick="doInstall()">App installieren</button>
    <p class="center green" id="instdone" hidden>Installiert! Öffne jetzt die Stempeluhr auf deinem Startbildschirm.</p>
    ${step(1, `Tippe oben rechts auf <b>⋮</b> (Menü).`)}
    ${step(2, `Wähle <b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b>.`)}
    ${step(3, `Öffne die <b>Stempeluhr</b> auf deinem Startbildschirm und melde dich dort an.`)}`;
  view.innerHTML = `<div class="install">
    <img src="icon-192.png" alt="" class="appicon">
    <h1 class="center">Stempeluhr als App</h1>
    <p class="center muted">Die Stempeluhr läuft auf dem Handy als App. So legst du sie in wenigen Sekunden auf deinen ${IS_IOS ? 'Home-Bildschirm' : 'Startbildschirm'}:</p>
    <div class="card isteps">${steps}</div>
    ${code ? `<p class="hint center">Dein Einladungscode <b>${esc(code)}</b> wird mitgenommen. Falls die App ihn nicht vorschlägt, gib ihn nach der Anmeldung unter Setup → Konto & Firma ein.</p>` : ''}
    <p class="hint center">Die Anmeldung passiert danach in der App. Im Browser kannst du nicht weitermachen, damit deine Zeiten immer am selben Ort landen.</p>
    ${IS_IOS && !inApp && !crios ? '<div class="install-arrow">↓</div>' : ''}
  </div>`;
}
async function doInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  const r = await installEvt.userChoice.catch(() => null);
  if (r?.outcome === 'accepted') { $('#instdone').hidden = false; $('#instbtn').hidden = true; }
  installEvt = null;
}
async function copyAppLink() {
  try { await navigator.clipboard.writeText(location.href); toast('Link kopiert. In Safari einfügen und öffnen.'); }
  catch { prompt('Link kopieren:', location.href); }
}

// ---------- start ----------
function startCloud() {
  if (needInstall()) return renderInstall();
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
    fbMetaUnsub?.(); fbMetaUnsub = null; fbMeta = null;
    me = u; own = {}; cid = undefined; company = undefined; membership = undefined; members = []; viewing = null; membersOn = false;
    if (!u) { data = normalize({}); showTabs(false); renderLogin(); return; }
    unsubs.push(
      ref('data/' + u.uid).onSnapshot(s => onOwn('shared', s), cloudError),
      ref('private/' + u.uid).onSnapshot(s => onOwn('priv', s), cloudError),
      fb.db.collection('companies').where('owner', '==', u.uid).onSnapshot(q => {
        myCompanies = q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
        restoreFirm(); refreshTeam();
      }, () => {}),
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
  if (ADMIN_APP && !own.roleSet) { own.roleSet = true; if (!isAdmin()) return renderNoAccess(); setRole('dev'); if (pushOn()) enablePush(true); return pushStartOpen(); }
  if (ADMIN_APP && !isAdmin()) return;
  if (ADMIN_APP && role === 'dev') return;
  showTabs(true);
  if (tab === 'login') tab = 'start';
  refresh();
  if (joinCode && !cid) { const c = joinCode; joinCode = null; history.replaceState(null, '', location.pathname); joinForm(c); }
  restoreFirm();
  pushStartOpen();
}
// Zuletzt gewählte Firma wieder öffnen
function restoreFirm() {
  if (!own.ready || (ADMIN_APP && role !== 'self')) return;
  let want = null; try { want = localStorage.getItem(firmKey()); } catch {}
  if (want && want !== company?.id && myCompanies.some(c => c.id === want)) switchFirm(want, true);
}
// Alle Firmen, zwischen denen ich wechseln kann: gegründete + die eigene Firma (falls ich dort Geschäftsführer bin)
function myFirms() {
  if (ADMIN_APP && role === 'as') return [];   // Entwickler-Sicht: keine eigenen Firmen anbieten
  const list = [...myCompanies];
  if (cid && company?.id === cid && isOwner() && !list.some(c => c.id === cid)) list.push({ id: cid, name: company.name });
  if (cid && !list.some(c => c.id === cid) && membership?.role === 'boss') list.push({ id: cid, name: membership.companyName || 'Meine Firma' });
  return list;
}
function switchFirm(id, quiet) {
  if (id === '__new') return companyForm(true);
  if (!id || id === company?.id) return;
  if (ADMIN_APP && role !== 'self') return setRole('boss', id);
  if (id === cid) watchCompany(id); else watchCompany(id, true);
  try { localStorage.setItem(firmKey(), id); } catch {}
  if (typeof statWho !== 'undefined') statWho = 'me';
  if (quiet) return;
  const name = myFirms().find(c => c.id === id)?.name;
  if (name) toast('Firma: ' + name);
  if (currentTopic === 'team') openTopic('team'); else refresh();
}
function firmSwitchHtml() {
  const firms = myFirms();
  if (!company || firms.length < 2) return '';
  return `<label class="row"><span>Firma</span><select onchange="switchFirm(this.value)">${firms.map(c => `<option value="${c.id}" ${c.id === company.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ Weitere Firma anlegen</option></select></label>`;
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
// Wer bei einer Beitrittsanfrage benachrichtigt wird: Gründer und alle Geschäftsführer. Steht im Einladungscode,
// weil der neue Mitarbeiter die Firma vor der Freigabe noch nicht lesen darf.
const inviteNotify = () => [...new Set([company.owner, ...members.filter(m => m.status === 'active' && m.role === 'boss').map(m => m.uid)])].slice(0, 5);
let inviteSynced = '';
async function syncInvite() {
  if (ADMIN_APP || !company?.code || !isOwner()) return;
  const want = inviteNotify(), key = company.code + want.join();
  if (inviteSynced === key) return;
  inviteSynced = key;
  try {
    const r = ref('invites/' + company.code), s = await r.get();
    if (!s.exists || s.data().cid !== company.id || String(s.data().notify) === String(want)) return;
    await r.delete(); await r.set({ ...s.data(), notify: want });   // Codes dürfen nur angelegt/gelöscht werden
  } catch (e) { inviteSynced = ''; }
}
function watchCompany(id, acting) {  // acting: Entwickler sieht eine fremde Firma als Geschäftsführer
  off(companyUnsubs);
  if (!acting) cid = id;
  company = undefined; membership = undefined; members = []; teamStats = {}; membersOn = false; companyAdmin = {};
  if (!id) return updateTabs();
  // Mitglieder und gemeinsame Einstellungen nur für Geschäftsführer abonnieren
  const bossFeeds = () => {
    if (!isOwner() || membersOn) return;
    membersOn = true;
    companyUnsubs.push(fb.db.collection(`companies/${id}/members`).onSnapshot(q => {
      members = q.docs.map(d => ({ uid: d.id, ...d.data() }));
      loadTeamStats(); updateTabs(); refreshTeam(); syncInvite(); setTimeout(joinPrompt, 600);
    }, cloudError));
    companyUnsubs.push(ref(`companies/${id}/admin/settings`).onSnapshot(s => {
      companyAdmin = s.exists ? s.data() : {};
      migrateAdminSettings(id);
      refreshTeam();
    }, () => {}));
  };
  const listenCompany = () => companyUnsubs.push(ref('companies/' + id).onSnapshot(s => {
    company = s.exists ? { id, ...s.data() } : null;
    bossFeeds();
    updateTabs(); refreshTeam();
  }, () => { company = null; updateTabs(); refresh(); }));
  if (!acting) companyUnsubs.push(ref(`companies/${id}/members/${me.uid}`).onSnapshot(s => {
    const was = membership?.status, wasRole = membership?.role;
    membership = s.exists ? s.data() : null;
    // Rolle entzogen: alles neu abonnieren, damit keine Geschäftsführer-Daten mehr geladen werden
    if (membersOn && wasRole === 'boss' && membership?.role !== 'boss' && !isFounder()) return watchCompany(id);
    if (membership?.status === 'active' && was !== 'active' && !company) listenCompany();
    bossFeeds();
    refresh();
  }, () => {}));
  listenCompany();
}

async function loadTeamStats() {
  for (const m of teamPeople()) {
    try {
      const s = await ref('data/' + m.uid).get();
      if (!s.exists) continue;
      const d = merged(s.data(), null), c = makeCalc(d, Date.now()), t = today(), w = monday(t);
      teamStats[m.uid] = { balance: c.balance(t), week: sum(c.range(w, addDays(w, 6)), 'net'), open: openState(d.sessions) };
    } catch {}
  }
  refreshTeam();
}
function refreshTeam() { if (currentTopic === 'team') openTopic('team', true); else refresh(); }

// ---------- tabs ----------
function showTabs(on) { $('.tabs').hidden = !on; $('#fbbtn').hidden = !on; if (on) { updateTabs(); requestAnimationFrame(moveTabInd); if (!fbMetaUnsub) feedbackWatch(); } }
function updateTabs() {
  const show = { start: !viewing || viewing.preview, pay: !viewing || asSelf() };
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
  ${joinCode ? `<p class="hint center">Nach der Anmeldung trittst du der Firma mit dem Code ${esc(joinCode)} bei.</p>` : ''}
  <p class="hint center">${signup ? 'Mit dem Erstellen des Kontos gilt unsere ' : ''}<a class="link" href="${WEB}datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a> · <a class="link" href="${WEB}impressum.html" target="_blank" rel="noopener">Impressum</a></p>`;
  $('#lpass').addEventListener('keydown', e => e.key === 'Enter' && (signup ? emailSignup() : emailLogin()));
}
const AUTH_MSG = {
  'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.', 'auth/wrong-password': 'E-Mail oder Passwort ist falsch.',
  'auth/user-not-found': 'Zu dieser E-Mail gibt es kein Konto.', 'auth/invalid-email': 'Die E-Mail-Adresse ist ungültig.',
  'auth/email-already-in-use': 'Zu dieser E-Mail gibt es schon ein Konto. Melde dich an.',
  'auth/weak-password': 'Das Passwort braucht mindestens 6 Zeichen.', 'auth/missing-password': 'Bitte ein Passwort eingeben.',
  'auth/requires-recent-login': 'Bitte melde dich einmal ab und wieder an und versuch es dann noch einmal.',
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
// Konto endgültig löschen (Pflicht für den App Store, Art. 17 DSGVO). Reihenfolge: erst neu anmelden lassen,
// dann alle Daten, zum Schluss das Anmeldekonto. Eigene Firmen mit Mitarbeitern werden nicht stillschweigend gelöscht.
async function deleteAccount() {
  const word = prompt('Konto endgültig löschen?\n\nAlle deine Zeiten, Einstellungen, Gehaltsdaten, Standorte und Feedback-Nachrichten werden gelöscht. Das kann nicht rückgängig gemacht werden.\n\nTippe LÖSCHEN zum Bestätigen:');
  if (word == null) return;
  if (word.trim().toUpperCase() !== 'LÖSCHEN') return alert('Nicht gelöscht. Bitte genau LÖSCHEN eintippen.');
  const uid = me.uid, gone = [];
  try {
    // 1. Firebase verlangt eine frische Anmeldung zum Löschen. Lieber vorher, damit nichts halb gelöscht wird.
    if (Date.now() - Date.parse(me.metadata.lastSignInTime) > 4 * 60000) {
      if (me.providerData.some(p => p.providerId === 'google.com')) await me.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
      else {
        const pw = prompt('Zur Sicherheit bitte noch einmal dein Passwort eingeben:');
        if (!pw) return;
        await me.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(me.email, pw));
      }
    }
    // 2. Eigene Firmen: nur löschen, wenn keine Mitarbeiter mehr drin sind
    for (const c of myCompanies) {
      const mem = (await fb.db.collection(`companies/${c.id}/members`).get()).docs;
      if (mem.some(d => d.data().status === 'active')) return alert(`Deine Firma „${c.name}“ hat noch Mitarbeiter. Entferne sie zuerst unter Setup → Team, dann kannst du dein Konto löschen.`);
    }
    off(unsubs); off(companyUnsubs); viewUnsub?.(); fbMetaUnsub?.(); fbMetaUnsub = null;
    view.innerHTML = '<p class="center muted" style="margin-top:40vh">Konto wird gelöscht …</p>';
    for (const c of myCompanies) {
      for (const d of (await fb.db.collection(`companies/${c.id}/members`).get()).docs) await d.ref.delete();
      await ref(`companies/${c.id}/admin/settings`).delete();
      if (c.code) await ref('invites/' + c.code).delete().catch(() => {});
      await ref('companies/' + c.id).delete();
      gone.push(c.name);
    }
    // 3. Mitgliedschaft in einer fremden Firma
    if (cid && !myCompanies.some(c => c.id === cid)) await ref(`companies/${cid}/members/${uid}`).delete().catch(() => {});
    // 4. Feedback-Chat
    for (const d of (await fb.db.collection(`feedback/${uid}/msgs`).get()).docs) await d.ref.delete();
    await ref('feedback/' + uid).delete();
    // 5. Lohnabrechnungen, eigene Daten und Push-Abos
    for (const d of (await fb.db.collection(`payslips/${uid}/docs`).get()).docs) await d.ref.delete();
    await ref('private/' + uid).delete();
    await ref('data/' + uid).delete();
    await pushCall('/forget', {}).catch(() => {});
    // 6. Anmeldekonto
    await me.delete();
    try { localStorage.clear(); } catch {}
    alert('Dein Konto und alle Daten wurden gelöscht.' + (gone.length ? ` Gelöschte Firma: ${gone.join(', ')}.` : ''));
  } catch (e) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    alert('Löschen fehlgeschlagen: ' + (AUTH_MSG[e.code] || e.message) + '\nBitte versuch es noch einmal oder schreib uns über die Lampe.');
    location.reload();
  }
}
function cloudError(e) {
  console.error(e);
  if (e.code === 'permission-denied') return;  // z. B. aus der Firma entfernt, wird über den Status angezeigt
  alert('Speichern in der Cloud fehlgeschlagen: ' + e.message);
}

// ---------- konto & firma (Setup) ----------
function displayName() { return data.settings.name || me.displayName || me.email; }
function accountHtml() {
  if ((viewing && !asSelf()) || !me) return '';
  let firm;
  if (asSelf()) firm = `<div class="row"><span>${!company ? 'Keine Firma' : isOwner() ? `Geschäftsführer von <b>${esc(company.name)}</b>` : membership?.status === 'pending' ? `Anfrage an <b>${esc(company.name)}</b> offen` : `Mitarbeiter bei <b>${esc(company.name)}</b>`}</span></div>`;
  else if (!cid) firm = `<button class="row" onclick="companyForm()"><span>Firma anlegen (ich bin Geschäftsführer)</span><span class="muted">›</span></button>
    <button class="row" onclick="joinForm()"><span>Firma beitreten (Code vom Geschäftsführer)</span><span class="muted">›</span></button>`;
  else if (isOwner()) firm = `<button class="row" onclick="openTopic('team')"><span>Geschäftsführer von <b>${esc(company.name)}</b></span><span class="muted">Team ›</span></button>
    <button class="row" onclick="companyEdit()"><span>Firmendaten & Kontakt bearbeiten</span><span class="muted">›</span></button>
    ${myFirms().length > 1 ? `<div class="row"><span>Deine Firmen<div class="muted small">${myFirms().map(c => esc(c.name)).join(', ')}</div></span></div>` : ''}
    <button class="row" onclick="companyForm(true)"><span>+ Weitere Firma anlegen</span><span class="muted">›</span></button>${isFounder() ? '' : `
    <button class="row" onclick="leaveCompany()"><span class="red">Firma verlassen</span></button>`}`;
  else if (membership?.status === 'active') firm = `<div class="row"><span>Mitarbeiter bei <b>${esc(company?.name || membership.companyName)}</b></span></div>
    <button class="row" onclick="leaveCompany()"><span class="red">Firma verlassen</span></button>`;
  else if (membership?.status === 'pending') firm = `<div class="row"><span>Anfrage an <b>${esc(membership.companyName)}</b> gesendet. Der Geschäftsführer muss dich noch freigeben.</span></div>
    <button class="row" onclick="leaveCompany()"><span class="red">Anfrage zurückziehen</span></button>`;
  else if (membership === null && company === null) firm = `<div class="row"><span>Deine Anfrage wurde abgelehnt oder du wurdest aus der Firma entfernt.</span></div>
    <button class="row" onclick="leaveCompany()"><span>OK</span><span class="muted">›</span></button>`;
  else firm = '<div class="row muted">Lädt …</div>';
  return `<div class="label">Konto</div>
  <div class="group">
    ${asSelf() ? `<div class="row"><span>${esc(asUser.email || asUser.name)}<div class="muted small">Ansicht als dieser Nutzer</div></span></div>`
      : `<div class="row"><span>${esc(me.email || me.displayName)}<div class="muted small">${me.providerData.some(p => p.providerId === 'google.com') ? 'Google-Konto' : 'E-Mail-Konto'}</div></span><button class="pill sm" onclick="logout()">Abmelden</button></div>
    <button class="row" onclick="deleteAccount()"><span class="red">Konto löschen</span></button>`}
  </div>
  <div class="label">Firma</div>
  <div class="group">${firm}</div>
  ${(asSelf() ? company : cid) && membership?.status === 'active' ? companyInfoHtml() : ''}`;
}

// ---------- Firmendaten (Geschäftsführer) ----------
// Name, Adresse, Kontakt liegen im Firmen-Dokument (freigegebene Mitarbeiter sehen sie). Steuer- und Lohnnummern
// liegen in companies/{cid}/admin/settings, das nur Geschäftsführer lesen.
const COMPANY_FIELDS = [
  ['Firma', [['legal', 'Rechtsform', 'z. B. GmbH, Einzelunternehmen'], ['owner', 'Inhaber / Geschäftsführer', 'Vor- und Nachname']]],
  ['Adresse', [['street', 'Straße und Nr.', 'Musterstraße 1'], ['zip', 'PLZ', '12345', 'numeric'], ['city', 'Ort', 'Musterstadt']]],
  ['Kontakt', [['contact', 'Ansprechpartner', 'Name'], ['phone', 'Telefon', '0123 456789', 'tel'], ['mobile', 'Mobil', '0170 1234567', 'tel'], ['email', 'E-Mail', 'info@firma.de', 'email'], ['web', 'Website', 'www.firma.de', 'url']]],
  ['Steuer & Lohn', [['taxno', 'Steuernummer', '12/345/67890'], ['vat', 'USt-IdNr.', 'DE123456789'], ['bnr', 'Betriebsnummer', '8-stellig', 'numeric'], ['hrb', 'Handelsregister', 'z. B. HRB 12345, AG Musterstadt']]],
];
function companyEdit() {
  if (!isOwner()) return;
  const info = { ...(company.info || {}), ...(companyAdmin.firmPriv || data.settings.firmPriv || {}) };
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="openTopic('team')">‹ Team</button><button class="pill sm green" onclick="companySave()">Speichern</button></div>
  <h2>Firmendaten</h2>
  <div class="group"><label class="row"><span>Name der Firma</span><input id="cf_name" value="${esc(company.name)}" placeholder="z. B. Muster GmbH"></label></div>
  ${COMPANY_FIELDS.map(([title, fields]) => `<div class="label">${title}</div><div class="group">${fields.map(([k, label, ph, type]) =>
    `<label class="row"><span>${label}</span><input id="cf_${k}" value="${esc(info[k] || '')}" placeholder="${esc(ph)}"${type === 'numeric' ? ' inputmode="numeric"' : type ? ` type="${type}"` : ''}></label>`).join('')}</div>`).join('')}
  <p class="hint">Name, Adresse und Kontakt sehen deine freigegebenen Mitarbeiter unter Setup → Konto & Firma. Steuernummer, USt-IdNr., Betriebsnummer und Handelsregister sehen nur Geschäftsführer.</p>`);
  currentTopic = 'company';
}
async function companySave() {
  const name = $('#cf_name').value.trim();
  if (!name) return alert('Bitte einen Namen für die Firma eintragen.');
  const info = {}, priv = {}, PRIV = ['taxno', 'vat', 'bnr', 'hrb'];
  for (const [, fields] of COMPANY_FIELDS) for (const [k] of fields) { const v = $('#cf_' + k).value.trim(); if (v) (PRIV.includes(k) ? priv : info)[k] = v; }
  if (info.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(info.email)) return alert('Die E-Mail-Adresse sieht nicht richtig aus.');
  try {
    const renamed = name !== company.name;
    await ref('companies/' + company.id).update({ name, info });
    await saveAdmin({ firmPriv: priv });
    if (renamed) {
      // Einladung und offene Anfragen sollen den neuen Namen zeigen (Einladungen lassen sich nur neu anlegen, nicht ändern)
      await ref('invites/' + company.code).delete();
      await ref('invites/' + company.code).set({ cid: company.id, name, notify: inviteNotify() });
      await Promise.all(members.map(m => ref(`companies/${company.id}/members/${m.uid}`).update({ companyName: name }).catch(() => {})));
    }
    company.name = name; company.info = info;
    toast('Firmendaten gespeichert');
    openTopic('team');
  } catch (e) { cloudError(e); }
}
function companyInfoHtml() {  // für Mitarbeiter: Firmendaten nur lesen
  const i = company?.info || {}, row = (l, v, href) => v ? `<div class="row"><span>${l}</span><span>${href ? `<a href="${href}" class="link">${esc(v)}</a>` : esc(v)}</span></div>` : '';
  const addr = [i.street, [i.zip, i.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rows = row('Adresse', addr) + row('Ansprechpartner', i.contact) + row('Telefon', i.phone, 'tel:' + (i.phone || '').replace(/[^\d+]/g, ''))
    + row('Mobil', i.mobile, 'tel:' + (i.mobile || '').replace(/[^\d+]/g, '')) + row('E-Mail', i.email, 'mailto:' + i.email)
    + row('Website', i.web, /^https?:/.test(i.web || '') ? i.web : 'https://' + i.web);
  return rows ? `<div class="label">Kontakt der Firma</div><div class="group">${rows}</div>` : '';
}

function newCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join(''); }
async function freeCode() {
  for (;;) { const c = newCode(); if (!(await ref('invites/' + c).get()).exists) return c; }
}

function companyForm(extra) {
  extra = extra === true || !!cid;
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="${extra && company ? "openTopic('team')" : 'closeSheet()'}">Abbrechen</button><button class="pill sm green" onclick="createCompany(${extra})">Anlegen</button></div>
  <h2>${extra ? 'Weitere Firma anlegen' : 'Firma anlegen'}</h2>
  <div class="group"><label class="row"><span>Name der Firma</span><input id="cname" placeholder="z. B. Muster GmbH"></label></div>
  <p class="hint">${extra ? 'Die neue Firma bekommt einen eigenen Einladungscode, eigene Mitarbeiter, eigene Firmendaten und einen eigenen Lohn-Export. Zwischen deinen Firmen wechselst du oben im Team-Bereich. Deine eigenen Zeiten bleiben bei deiner bisherigen Firma.'
    : 'Du bekommst einen Einladungscode. Mitarbeiter geben ihn in ihrer App ein, du gibst sie dann frei und siehst ihre Zeiten.'}</p>`);
}
async function createCompany(extra) {
  const name = $('#cname').value.trim();
  if (!name) return alert('Bitte einen Namen eintragen.');
  try {
    const code = await freeCode(), c = fb.db.collection('companies').doc();
    await c.set({ name, owner: me.uid, ownerName: displayName(), code, created: firebase.firestore.FieldValue.serverTimestamp(), ...(extra ? { ownerTracks: false } : {}) });
    await ref('invites/' + code).set({ cid: c.id, name, notify: [me.uid] });
    if (extra) { closeSheet(); go('setup'); switchFirm(c.id, true); openTopic('team'); toast(`${name} angelegt`); return true; }
    await ref('data/' + me.uid).update({ cid: c.id });
    closeSheet();
    if (data.settings.onboarded !== false) { go('setup'); openTopic('team'); }  // in der Einführung geht es dort weiter
    return true;
  } catch (e) { alert('Firma konnte nicht angelegt werden: ' + e.message); }
}

// Firma beitreten: Vollbild, oben der Name (nur wenn noch keiner da ist), darunter je Zeichen eine Kachel.
// Technisch ein einziges unsichtbares Eingabefeld über den Kacheln, so klappen Tippen, Einfügen und Autovervollständigen.
function joinForm(code = '') {
  const has = data.settings.name || me.displayName || '';
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="closeSheet()">‹ Zurück</button><span></span></div>
  <div class="joinwrap">
    <div class="joinicon">🏢</div>
    <h1 class="center">Firma beitreten</h1>
    <p class="center muted">Gib den Einladungscode von deinem Geschäftsführer ein.</p>
    <div class="group" id="jnamebox" ${has ? 'hidden' : ''}><label class="row"><span>Dein Name</span><input id="jname2" value="${esc(has)}" placeholder="Vor- und Nachname" autocomplete="name" oninput="otpPaint()"></label></div>
    ${has ? `<p class="center small" id="jnameinfo">Du trittst bei als <b>${esc(has)}</b> · <button class="link" onclick="$('#jnamebox').hidden = false; $('#jnameinfo').remove(); $('#jname2').focus()">ändern</button></p>` : ''}
    <div class="otp">${'<span></span>'.repeat(6)}<input id="jcode" aria-label="Einladungscode" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" oninput="otpInput()" onpaste="otpPaste(event)" onfocus="otpEnd()" onclick="otpEnd()" onselect="otpEnd()" onkeyup="otpEnd()" onblur="otpPaint()" onkeydown="event.key === 'Enter' && !$('#jbtn').disabled && joinCompany()"></div>
    <button class="pill sm pastebtn" onclick="otpClipboard()">📋 Code einfügen</button>
    <button class="big" id="jbtn" onclick="joinCompany()" disabled>Beitreten</button>
    <p class="hint center">Nach der Freigabe sieht dein Geschäftsführer deine Zeiten und Abwesenheiten und kann sie korrigieren. Gehalt und Steuerdaten sieht er nicht.</p>
  </div>`);
  $('#sheet').classList.add('full');
  $('#jcode').value = code ? cleanCode(code) : '';
  otpPaint();
  setTimeout(() => (has ? $('#jcode') : $('#jname2'))?.focus(), 350);
}
// Einfügen ersetzt immer alle Kacheln (egal in welche Kachel), aus Link oder Nachricht wird nur der Code genommen
function otpSet(text) {
  const c = cleanCode(text).slice(0, 6);
  if (!c) return toast('In der Zwischenablage ist kein Code.');
  $('#jcode').value = c; otpPaint(); haptic();
  if (c.length === 6 && !$('#jname2').value.trim()) $('#jname2').focus();
}
// Wie ein Textfeld: egal welche Kachel man antippt, die Eingabe geht immer ans Ende (nächste freie Kachel)
function otpEnd() {
  const i = $('#jcode'); if (!i) return;
  const end = () => { const n = i.value.length; if (i.selectionStart !== n || i.selectionEnd !== n) i.setSelectionRange(n, n); };
  end(); setTimeout(end, 0); setTimeout(end, 60);   // iOS setzt den Cursor erst nach dem Tippen, darum zweimal nachziehen
  otpPaint();
}
document.addEventListener('selectionchange', () => { if (document.activeElement?.id === 'jcode') otpEnd(); });
function otpPaste(e) { e.preventDefault(); otpSet(e.clipboardData?.getData('text') || ''); }
async function otpClipboard() {
  try { otpSet(await navigator.clipboard.readText()); }
  catch { $('#jcode').focus(); toast('Tippe lange auf die Kacheln und wähle „Einsetzen“.'); }
}
function otpInput() {
  const i = $('#jcode'), raw = i.value;
  i.value = (raw.length > 6 ? cleanCode(raw) : raw.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 6);   // eingefügte Nachricht → nur der Code
  otpPaint();
  if (i.value.length === 6) haptic();
}
function otpPaint() {
  const i = $('#jcode'); if (!i) return;
  const v = i.value, f = document.activeElement === i;
  document.querySelectorAll('.otp span').forEach((s, k) => { s.textContent = v[k] || ''; s.classList.toggle('cur', f && k === Math.min(v.length, 5)); s.classList.toggle('on', !!v[k]); });
  $('#jbtn').disabled = v.length < 6 || !$('#jname2').value.trim();
}
// Code aus allem holen, was Leute einfügen: nur der Code, der Link (?join=…) oder die ganze Einladungsnachricht
function cleanCode(v) {
  const t = String(v || '').toUpperCase(), re = new RegExp(`[${CODE_CHARS}]{6}`);
  const m = t.match(/JOIN=([A-Z0-9]+)/) || t.match(/CODE\W*([A-Z0-9]{6})\b/);
  if (m) return m[1];
  const plain = t.replace(/[^A-Z0-9]/g, '');
  return plain.length <= 8 ? plain : ((t.match(new RegExp(`\\b[${CODE_CHARS}]{6}\\b`, 'g')) || []).pop() || plain.match(re)?.[0] || '');
}
async function joinCompany() {
  const code = cleanCode($('#jcode').value), name = $('#jname2').value.trim();
  $('#jcode').value = code;
  if (!code || !name) return alert('Bitte Code und Namen eintragen.');
  try {
    const inv = await ref('invites/' + code).get();
    if (!inv.exists) return alert('Diesen Code gibt es nicht. Frag deinen Geschäftsführer nach dem aktuellen Code.');
    const { cid: id, name: companyName, notify = [] } = inv.data();
    await ref(`companies/${id}/members/${me.uid}`).set({ name, email: me.email || '', status: 'pending', code, companyName, requested: firebase.firestore.FieldValue.serverTimestamp() });
    data.settings.name = name;
    await ref('data/' + me.uid).update({ cid: id, 'settings.name': name });
    if (notify.length) notifyPush({ kind: 'join', to: notify, body: name, firm: companyName });
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
  const pending = members.filter(m => m.status === 'pending'), people = teamPeople(), active = people.filter(p => !p.self);
  const info = company.info || {}, addr = [info.street, [info.zip, info.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `<div class="label">Firma</div>
  <div class="group">${firmSwitchHtml()}<button class="row" onclick="companyEdit()"><span style="text-align:left"><b>${esc(company.name)}</b>
    <div class="muted small">${esc([addr, info.phone, info.email].filter(Boolean).join(' · ') || 'Adresse und Kontaktdaten hinzufügen')}</div></span><span class="muted">Bearbeiten ›</span></button>
    ${myFirms().length < 2 && !asUser ? `<button class="row" onclick="companyForm(true)"><span>+ Weitere Firma anlegen</span><span class="muted">›</span></button>` : ''}</div>
  ${company.ownerTracks === false && isFounder() ? '<p class="hint">Deine eigenen Zeiten zählen zu deiner Hauptfirma, deshalb stehst du hier nicht in der Team-Liste.</p>' : ''}
  <div class="label">Einladung</div>
  <div class="card center">
    <div class="muted small">Einladungscode</div>
    <div class="code">${esc(company.code)}</div>
    <div class="two" style="margin:14px 0 0"><button class="pill" onclick="shareInvite()">Link teilen</button><button class="pill" onclick="rotateCode()">Neuer Code</button></div>
  </div>
  <p class="hint" style="margin-top:8px">Mitarbeiter öffnen den Link oder geben den Code unter Setup → Konto & Firma ein. Ein neuer Code macht den alten ungültig. Ein zweiter Geschäftsführer tritt genauso bei, du machst ihn danach zum Geschäftsführer.</p>
  ${pending.length ? `<div class="label">Anfragen</div><div class="group">${pending.map(m => `<div class="row reqrow"><span>${esc(m.name)}<div class="muted small">${esc(m.email)}</div></span>
    <span class="reqbtns"><button class="pill red" onclick="rejectMember('${m.uid}')">Ablehnen</button><button class="pill green" onclick="approveMember('${m.uid}')">Freigeben</button></span></div>`).join('')}</div>` : ''}
  <div class="label">Team</div>
  <div class="group">${people.map(m => { const s = teamStats[m.uid]; return `<button class="row" onclick="viewMember('${m.uid}')">
    <span>${openLabel(s?.open)}${esc(m.name)}${m.self ? ' <span class="muted">(du)</span>' : ''}${m.boss ? ' <span class="badge-gf">GF</span>' : ''}<div class="muted small">${s ? (s.open ? openText(s.open) + ' · ' : '') + 'Diese Woche ' + dur(s.week) : esc(m.email || '')}</div></span>
    <span>${s ? `<span class="${cls(s.balance)}">${hm(s.balance, true)}</span>` : ''} ›</span></button>`; }).join('')}</div>
  <p class="hint">${active.length ? 'Grüner Punkt = gerade eingestempelt, gelber Punkt = in Pause, oranger Punkt = Eintrag seit über 16 Std. offen (vergessen auszustempeln). Rechts das Überstundenkonto. Tippen zeigt den Kalender, dort kannst du Zeiten korrigieren. GF = Geschäftsführer, die Rolle vergibst du im Setup des jeweiligen Mitarbeiters.' : 'Noch keine Mitarbeiter. Teil den Einladungscode.'}</p>
  ${people.length ? `<div class="label">Lohn & Export</div>${payDueHtml()}
    <div class="group">
      <button class="row" onclick="openPayroll()"><span>📤 Lohn-Export<div class="muted small">${payHas() ? PAY_SOFT[payCfg().soft].name + (payCfg().last ? ' · zuletzt ' + ymName(payCfg().last) : '') : 'Lexware, DATEV, CSV oder Excel'}</div></span><span class="muted">›</span></button>
      <button class="row" onclick="openSlipUpload()"><span>📄 Lohnabrechnungen verteilen<div class="muted small">PDFs aus Lexware & Co. hochladen, jeder sieht seine eigene</div></span><span class="muted">›</span></button>
      <button class="row" onclick="openPaySettings()"><span>⚙︎ Schnittstelle einrichten<div class="muted small">Lohnsoftware, Stichtag, Lohnarten, Personalnummern</div></span><span class="muted">›</span></button>
    </div>` : ''}`;
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
    await ref('invites/' + code).set({ cid: company.id, name: company.name, notify: inviteNotify() });
    await ref('companies/' + company.id).update({ code });
    await ref('invites/' + old).delete();
  } catch (e) { alert(e.message); }
}
// Offene Beitrittsanfragen: Beim Öffnen der App erscheint je Anfrage ein Fenster mit Annehmen / Ablehnen / Später.
// „Später“ blendet sie bis zum nächsten Öffnen der App aus, in Setup → Team bleibt sie sichtbar.
const joinSeen = new Set();
function joinPrompt() {
  if (ADMIN_APP || viewing || !company || !isOwner() || document.querySelector('.ask')) return;
  const m = members.find(x => x.status === 'pending' && !joinSeen.has(x.uid));
  if (!m) return;
  joinSeen.add(m.uid);
  const d = document.createElement('div'); d.className = 'ask';
  d.innerHTML = `<div class="askcard"><div class="askicon">👋</div><h3>Neue Beitrittsanfrage</h3>
    <p><b>${esc(m.name)}</b>${m.email ? ` <span class="small">(${esc(m.email)})</span>` : ''} möchte <b>${esc(company.name)}</b> beitreten.</p>
    <p class="muted small">Nach dem Annehmen siehst du die Zeiten und Abwesenheiten und kannst sie korrigieren. Gehalt und Steuerdaten bleiben privat.</p>
    <button class="big" data-a="yes">Annehmen</button>
    <div class="two joinbtns"><button class="pill" data-a="no"><span class="red">Ablehnen</span></button><button class="pill" data-a="later">Später entscheiden</button></div></div>`;
  d.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    d.remove(); haptic();
    try {
      if (a === 'yes') { await ref(`companies/${company.id}/members/${m.uid}`).update({ status: 'active' }); toast(`✓ ${m.name} ist jetzt im Team`); }
      if (a === 'no') { await ref(`companies/${company.id}/members/${m.uid}`).delete(); toast(`Anfrage von ${m.name} abgelehnt`); }
    } catch (err) { cloudError(err); }
    setTimeout(joinPrompt, 400);   // weitere offene Anfragen nacheinander
  };
  document.body.appendChild(d);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { joinSeen.clear(); setTimeout(joinPrompt, 600); } });
function approveMember(uid) { ref(`companies/${company.id}/members/${uid}`).update({ status: 'active' }).catch(cloudError); }
function rejectMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (confirm(`Anfrage von ${m.name} ablehnen?`)) ref(`companies/${company.id}/members/${uid}`).delete().catch(cloudError);
}
function removeMember(uid) {
  const m = members.find(x => x.uid === uid);
  if (!m) return;
  if (!confirm(`${m.name} aus der Firma entfernen? Du siehst die Zeiten dann nicht mehr. Die Daten bleiben beim Mitarbeiter.`)) return;
  stopViewing();
  ref(`companies/${company.id}/members/${uid}`).delete().catch(cloudError);
}

function viewMember(uid) {
  closeSheet();
  if (uid === actingUid()) return go('cal');   // eigene Zeiten: einfach den eigenen Kalender öffnen
  viewAs(uid, teamPeople().find(x => x.uid === uid)?.name || 'Mitarbeiter');
}
// Weiteren Geschäftsführer ernennen bzw. Rechte entziehen (nicht beim Gründer)
async function setBoss(uid, on) {
  const m = members.find(x => x.uid === uid); if (!m) return;
  if (!confirm(on ? `${m.name} zum Geschäftsführer machen?\n\n${m.name} bekommt dieselben Rechte wie du: Mitarbeiter freigeben und entfernen, alle Zeiten sehen und korrigieren, Firmendaten und Lohn-Export. Gehalt und Steuerdaten bleiben privat.`
    : `${m.name} die Geschäftsführer-Rechte entziehen? ${m.name} bleibt als Mitarbeiter in der Firma.`)) return;
  try {
    await ref(`companies/${company.id}/members/${uid}`).update({ role: on ? 'boss' : firebase.firestore.FieldValue.delete() });
    toast(on ? `${m.name} ist jetzt Geschäftsführer` : `${m.name} ist jetzt Mitarbeiter`);
    if (uid === me.uid) { stopViewing(); }
  } catch (e) { cloudError(e); }
}
// Gemeinsame Einstellungen: früher privat beim Gründer gespeichert, jetzt für alle Geschäftsführer
function migrateAdminSettings(id) {
  if (!isFounder() || migrateAdminSettings.done) return;
  migrateAdminSettings.done = true;
  const up = {};
  if (!companyAdmin.payroll && data.settings.payroll) up.payroll = data.settings.payroll;
  if (!companyAdmin.firmPriv && data.settings.firmPriv) up.firmPriv = data.settings.firmPriv;
  if (Object.keys(up).length) ref(`companies/${id}/admin/settings`).set(up, { merge: true }).catch(() => {});
}
const saveAdmin = patch => { Object.assign(companyAdmin, patch); return ref(`companies/${company.id}/admin/settings`).set(patch, { merge: true }); };
function viewAs(uid, name, startTab = 'cal', preview = false) {  // preview: Entwickler sieht die App wie dieser Nutzer
  viewUnsub?.(); viewUnsub = null;
  viewing = { uid, name, preview };
  tab = startTab; calView = 'week'; calDay = today();
  view.innerHTML = '<p class="center muted" style="margin-top:40vh">Lädt …</p>';
  updateTabs();
  // Support-Ansicht (Entwickler „als Nutzer“): auch die privaten Einstellungen lesen, damit alles 1:1 aussieht
  const support = preview && ADMIN_APP && isAdmin();
  let shared, priv = null, privSeen = !support;
  const apply = () => { if (!viewing || shared === undefined || !privSeen) return; data = shared ? merged(shared, priv) : normalize({}); refresh(); };
  const u1 = ref('data/' + uid).onSnapshot(s => {
    if (s.metadata.hasPendingWrites || !viewing) return;
    shared = s.exists ? s.data() : null; apply();
  }, e => { alert('Zeiten konnten nicht geladen werden: ' + e.message); stopViewing(); });
  const u2 = support ? ref('private/' + uid).onSnapshot(s => { priv = s.exists ? s.data() : null; privSeen = true; apply(); }, () => { privSeen = true; apply(); }) : null;
  viewUnsub = () => { u1(); u2?.(); };
}
function stopViewing() {
  viewUnsub?.(); viewUnsub = null;
  if (!viewing) return;
  const preview = viewing.preview;
  viewing = null;
  data = merged(own.shared, own.priv);
  if (!preview && ADMIN_APP && role === 'as' && asUser) return setRole('as', asUser.uid, 'team');   // zurück zur Sicht des Nutzers
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
async function setRole(r, id, then) {
  viewUnsub?.(); viewUnsub = null; viewing = null; closeSheet();
  role = r;
  if (r !== 'as') asUser = null;
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
  if (r === 'as') {   // die App genau so sehen wie dieser Nutzer (Geschäftsführer oder Mitarbeiter)
    const u = adminCache.users.find(x => x.uid === id) || adminCache.users.find(x => x.uid !== me.uid) || adminCache.users[0];
    if (!u) return setRole('dev');
    asUser = u;
    const firm = adminCache.companies.find(c => c.owner === u.uid)?.id || u.cid || null;
    // Firma des Nutzers wie bei ihm laden; seine Mitgliedschaft (Rolle) kommt aus companies/{cid}/members/{uid}
    watchCompany(firm, true);
    if (firm) ref(`companies/${firm}/members/${u.uid}`).get().then(s => { if (asUser?.uid === u.uid) { membership = s.exists ? s.data() : null; refresh(); } }).catch(() => {});
    viewAs(u.uid, u.name, then === 'team' ? 'setup' : 'start', true);
    if (then === 'team') setTimeout(() => { if (asUser?.uid === u.uid && isOwner()) openTopic('team'); }, 600);
  }
}
async function loadAdmin() {
  loadFeedbackAdmin();
  try {
    const [d, c, m] = await Promise.all([fb.db.collection('data').get(), fb.db.collection('companies').get(), fb.db.collectionGroup('members').get()]);
    const t = today(), mem = m.docs.map(x => ({ uid: x.id, cid: x.ref.parent.parent.id, ...x.data() }));
    const users = d.docs.map(x => {
      const v = x.data(), dd = merged(v, null), mm = mem.find(y => y.uid === x.id && y.cid === v.cid);
      return { uid: x.id, name: dd.settings.name || mm?.name || v.email || 'Ohne Namen', email: v.email || mm?.email || '', cid: v.cid || null, status: mm?.status,
        open: openState(dd.sessions), last: dd.sessions.reduce((a, s) => Math.max(a, s.e || Date.now()), 0), balance: makeCalc(dd, Date.now()).balance(t) };
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
  if (role === 'as' && adminCache?.users.length)
    ctx = `<label class="row"><span>Nutzer</span><select onchange="setRole('as', this.value)">${adminCache.users.map(u => `<option value="${u.uid}" ${asUser?.uid === u.uid ? 'selected' : ''}>${esc(u.name)}${adminCache.companies.some(c => c.owner === u.uid) ? ' (GF)' : ''}</option>`).join('')}</select></label>`;
  const who = asUser ? (isOwner() ? `Geschäftsführer von ${esc(company?.name || '…')}` : company ? `Mitarbeiter bei ${esc(company.name)}` : 'ohne Firma') : '';
  return `<div class="adminbar"><div class="seg">${seg('dev', 'Entwickler')}${seg('boss', 'Firma')}${seg('as', 'Als Nutzer')}${seg('self', 'Ich')}</div>
    ${ctx ? `<div class="group">${ctx}</div>` : ''}${role === 'as' && asUser ? `<p class="hint">So sieht <b>${esc(asUser.name)}</b> die App (${who}). Stempeln ist gesperrt, Korrekturen an Zeiten werden gespeichert. Private Daten (Gehalt, Steuern, Standorte, Aussehen) siehst du nur zum Lesen.</p>` : ''}</div>`;
}
function renderAdmin() {
  const a = adminCache;
  if (!a) { view.innerHTML = '<p class="center muted" style="margin-top:30vh">Lädt …</p>'; return; }
  const wk = Date.now() - 7 * 86400000, kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  view.innerHTML = `<h1 class="center">Entwickler</h1>
  <div class="kpis">${kpi(a.users.length, 'Nutzer')}${kpi(a.companies.length, 'Firmen')}${kpi(a.users.filter(u => u.open && !u.open.stale && !u.open.pause).length, 'gerade eingestempelt')}${kpi(a.users.filter(u => u.last > wk).length, 'aktiv (7 Tage)')}</div>
  <div class="label">Firmen</div>
  ${a.companies.length ? `<div class="group">${a.companies.map(c => `<button class="row" onclick="setRole('boss', '${c.id}')"><span><b>${esc(c.name)}</b>
    <div class="muted small">Geschäftsführer: ${esc(c.ownerName || '–')} · ${c.active} Mitarbeiter${c.pending ? ` · <span class="red">${c.pending} Anfrage${c.pending > 1 ? 'n' : ''}</span>` : ''} · Code ${esc(c.code)}</div></span><span class="muted">Ansehen ›</span></button>`).join('')}</div>` : '<p class="muted center">Noch keine Firmen.</p>'}
  <div class="label">Feedback ${fbAdmin?.some(t => t.unreadAdmin) ? `<span class="badge-gf">${fbAdmin.filter(t => t.unreadAdmin).length} neu</span>` : ''}</div>
  ${pushAskHtml('Bei neuem Feedback benachrichtigen')}<div id="fblist">${feedbackAdminHtml()}</div>
  <div class="label">Nutzer</div>
  <div class="group"><div class="row"><input class="full" placeholder="Name oder E-Mail suchen" value="${esc(adminQuery)}" oninput="adminQuery = this.value; $('#ulist').innerHTML = adminUsers()"></div></div>
  <div id="ulist">${adminUsers()}</div>
  <button class="pill wide" onclick="adminCache = null; render(); loadAdmin()">Aktualisieren</button>
  <p class="hint">Stand ${new Date(a.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}. Tippe auf eine Firma, um sie als Geschäftsführer zu sehen, oder auf einen Nutzer für seine Mitarbeiter-Ansicht. Private Daten (Gehalt, Steuern, Standorte) kannst du zur Hilfe nur lesen, nicht ändern.</p>
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
  return `<div class="group">${list.map(u => `<button class="row" onclick="setRole('as', '${u.uid}')"><span>${openLabel(u.open)}<b>${esc(u.name)}</b>${u.uid === me.uid ? ' (du)' : ''}
    <div class="muted small">${esc(u.email)}${u.email ? ' · ' : ''}${firm(u)} · ${u.open ? openText(u.open) : u.last ? 'zuletzt ' + dmy(ymd(new Date(u.last))) : 'noch nie gestempelt'}</div></span>
    <span class="${cls(u.balance)}">${hm(u.balance, true)} ›</span></button>`).join('')}</div>`;
}
