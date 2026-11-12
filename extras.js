// Zusatzfunktionen: Statistik, Überstunden-Erklärung, Export (Excel/CSV/Kalender), Urlaubsplaner, Schulferien,
// Arbeitspläne, Runden, Farben, Einführung, Tipps und Tutorial. Nutzt die Helfer aus app.js.

// ---------- farben & hintergrund ----------
const COLOR_DEF = { accent: '#3b8dff', minus: '#e8667e', near: '#f0a03c', ok: '#8cc63f', over: '#3b8dff' };
const COLOR_LABEL = { accent: 'Akzentfarbe', minus: 'Minus (unter 80 %)', near: 'Fast erreicht (80–99 %)', ok: 'Ziel erreicht', over: 'Überstunden (ab 110 %)' };
const BGS = {
  kaffee: ['Kaffee', '#140d09', 'radial-gradient(90% 45% at 65% 5%,#6b3d1c 0,rgba(107,61,28,0) 70%),radial-gradient(70% 40% at 5% 45%,#3d2615 0,rgba(61,38,21,0) 70%),radial-gradient(80% 45% at 95% 78%,#40230f 0,rgba(64,35,15,0) 70%)'],
  nacht: ['Nacht', '#070b16', 'radial-gradient(90% 45% at 65% 5%,#1d3a6b 0,rgba(29,58,107,0) 70%),radial-gradient(70% 40% at 5% 45%,#15233d 0,rgba(21,35,61,0) 70%),radial-gradient(80% 45% at 95% 78%,#1a1f4a 0,rgba(26,31,74,0) 70%)'],
  wald: ['Wald', '#07110b', 'radial-gradient(90% 45% at 65% 5%,#1f5132 0,rgba(31,81,50,0) 70%),radial-gradient(70% 40% at 5% 45%,#163322 0,rgba(22,51,34,0) 70%),radial-gradient(80% 45% at 95% 78%,#28401a 0,rgba(40,64,26,0) 70%)'],
  beere: ['Beere', '#120814', 'radial-gradient(90% 45% at 65% 5%,#5a1f5e 0,rgba(90,31,94,0) 70%),radial-gradient(70% 40% at 5% 45%,#36183d 0,rgba(54,24,61,0) 70%),radial-gradient(80% 45% at 95% 78%,#4a1530 0,rgba(74,21,48,0) 70%)'],
  meer: ['Meer', '#051214', 'radial-gradient(90% 45% at 65% 5%,#0f5257 0,rgba(15,82,87,0) 70%),radial-gradient(70% 40% at 5% 45%,#0d3338 0,rgba(13,51,56,0) 70%),radial-gradient(80% 45% at 95% 78%,#123c52 0,rgba(18,60,82,0) 70%)'],
  stein: ['Stein', '#0e0f10', 'radial-gradient(90% 45% at 65% 5%,#3a3d42 0,rgba(58,61,66,0) 70%),radial-gradient(70% 40% at 5% 45%,#24272b 0,rgba(36,39,43,0) 70%)'],
  schwarz: ['Schwarz', '#000000', 'none'],
  dunkel: ['Dark', '#1c1c1e', 'radial-gradient(90% 45% at 65% 5%,#2c2c30 0,rgba(44,44,48,0) 70%)'],
  hell: ['Light', '#f2f2f7', 'radial-gradient(90% 45% at 65% 5%,#ffffff 0,rgba(255,255,255,0) 70%),radial-gradient(80% 45% at 5% 70%,#e6e9f2 0,rgba(230,233,242,0) 70%)', 'light'],
};
function myTheme() { return (viewing ? own.priv?.settings?.theme : data.settings.theme) || {}; }
function applyTheme() {
  const t = myTheme(), r = document.documentElement.style, bg = BGS[t.bg] || BGS.kaffee;
  for (const k in COLOR_DEF) r.setProperty('--' + k, t[k] || COLOR_DEF[k]);
  r.setProperty('--bg', bg[1]);
  r.setProperty('--bgimg', bg[2]);
  document.documentElement.classList.toggle('light', bg[3] === 'light');   // Light-Modus: helle Flächen, dunkle Schrift
  $('meta[name=theme-color]').content = bg[1];
}
const progColor = p => p >= 110 ? 'var(--over)' : p >= 100 ? 'var(--ok)' : p >= 80 ? 'var(--near)' : 'var(--minus)';

function openTheme() {
  const t = data.settings.theme || {};
  sheet(`<div class="sheet-head"><h2>Farben</h2><button class="pill sm" onclick="backToTopic()">Fertig</button></div>
  <div class="label">Hintergrund</div>
  ${swatchesHtml(t.bg)}
  <div class="label">Farben</div>
  <div class="scale"><div style="background:linear-gradient(90deg,var(--minus) 0 60%,var(--near) 66% 84%,var(--ok) 88% 92%,var(--over) 96%)"></div><span>0 %</span><span>80 %</span><span>100 %</span><span>110 %</span></div>
  <div class="group">${Object.entries(COLOR_LABEL).map(([k, l]) => `<label class="row"><span>${l}</span><input type="color" value="${t[k] || COLOR_DEF[k]}" oninput="setTheme('${k}', this.value)"></label>`).join('')}</div>
  <button class="pill wide" onclick="setTheme(); openTheme()">Standard wiederherstellen</button>`);
}
function swatchesHtml(cur, fn = 'setTheme') {
  return `<div class="swatches">${Object.entries(BGS).map(([k, b]) => `<button class="swatch ${(cur || 'kaffee') === k ? 'on' : ''} ${b[3] === 'light' ? 'lightsw' : ''}" data-bg="${k}" onclick="${fn}('bg', '${k}')" style="background:${b[2] === 'none' ? '' : b[2] + ','}${b[1]}"><span>${b[0]}</span></button>`).join('')}</div>`;
}
function setTheme(k, v) {
  data.settings.theme = k ? { ...data.settings.theme, [k]: v } : {};
  applyTheme();
  if (k === 'bg') { document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.bg === v)); }
  clearTimeout(setTheme.t); setTheme.t = setTimeout(save, 400);
}

// ---------- tipps ----------
const TIPS = [
  ['Tag nachtragen', 'Im Kalender auf einen Tag tippen, dann kannst du Zeiten ergänzen oder korrigieren.'],
  ['Überstunden verstehen', 'Tippe in der Übersicht auf dein Überstundenkonto. Du siehst Tag für Tag, wie es zustande kommt.'],
  ['Brückentage finden', 'Unter Abwesenheiten → Urlaubsplaner findest du die besten Brückentage für deinen Resturlaub.'],
  ['Export für den Geschäftsführer', 'Unter Statistik → Exportieren bekommst du Excel, CSV oder eine Kalenderdatei.'],
  ['Farben anpassen', 'Unter Setup → Darstellung wählst du Hintergrund und Farben für Minus, Ziel und Überstunden.'],
  ['Wie funktioniert was?', 'Unter Setup → Hilfe erklärt dir die App Schritt für Schritt alle Funktionen.'],
];
let tipIdx = Math.floor(Date.now() / 86400000) % TIPS.length;
function tipHtml() {
  if (viewing || data.settings.tips === false) return '';
  const [t, x] = TIPS[tipIdx % TIPS.length];
  return `<div class="tip"><div><b>💡 ${t}</b><div class="muted small">${x}</div></div>
    <div class="tipbtns"><button class="small" onclick="tipIdx++; render()">Nächster Tipp</button><button class="small muted" onclick="setS('tips', false); render()">Tipps ausblenden</button></div></div>`;
}

// ---------- einführung (erster Start) ----------
// Schritt 0: Rolle wählen (Geschäftsführer legt Firma an, Mitarbeiter tritt mit Code bei), dann Bundesland,
// Sollzeit, Überstundenkonto, fertig. Wer per Einladungslink schon beigetreten ist, überspringt Schritt 0.
let onboardStep = 0, onboardRole = '';
function maybeOnboard() {
  if (ADMIN_APP || viewing || !me || data.settings.onboarded !== false || !$('#sheet').hidden) return;
  if (!data.settings.theme?.bg) return onboardLook();   // ganz am Anfang: Aussehen wählen
  onboard(onboardStep);
}
// Aussehen wählen: kleines Fenster unten, darüber sieht man die App sofort im gewählten Hintergrund
function onboardLook() {
  if (tab !== 'start') { tab = 'start'; render(); }
  const cur = data.settings.theme?.bg || 'kaffee';
  sheet(`<h2>Wie soll deine App aussehen?</h2>
    <p class="muted small" style="margin:-6px 0 12px">Tippe auf einen Hintergrund, oben siehst du sofort, wie es wirkt.</p>
    ${swatchesHtml(cur, 'lookPick')}
    <button class="big" style="margin-top:16px" onclick="lookPick('bg', document.querySelector('.swatch.on')?.dataset.bg || 'kaffee', true)">Weiter</button>
    <p class="hint center" style="margin-top:10px">Später änderbar unter Setup → Darstellung.</p>`);
  $('#sheet').classList.add('preview');
}
function lookPick(k, v, done) {
  data.settings.theme = { ...data.settings.theme, bg: v };
  applyTheme();
  document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.bg === v));
  if (done) { save(); $('#sheet').classList.remove('preview'); onboard(onboardStep); }
}
function onboard(step) {
  if (step === 0 && cid) step = 1;
  onboardStep = step;
  const st = data.settings, steps = 5, dots = `<div class="dots">${Array.from({ length: steps }, (_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>`;
  const next = (label = 'Weiter') => `<button class="big" onclick="onboardNext()">${label}</button>`;
  const pages = [
    () => onboardRole === 'boss' ? `<h2>Deine Firma</h2>
      <div class="group"><label class="row"><span>Name der Firma</span><input id="cname" placeholder="z. B. Muster GmbH"></label></div>
      <p class="hint">Danach bekommst du einen Einladungscode. Deine Mitarbeiter geben ihn in ihrer App ein, du gibst sie frei und siehst im Tab Team ihre Zeiten.</p>
      <button class="big" onclick="onboardCompany()">Firma anlegen</button>
      <button class="pill wide" onclick="onboardRole = ''; onboard(0)">‹ Zurück</button>`
    : onboardRole === 'emp' ? `<h2>Firma beitreten</h2>
      <div class="group">
        <label class="row"><span>Einladungscode</span><input id="jcode" class="short" autocapitalize="characters" placeholder="ABC123" style="text-transform:uppercase"></label>
        <label class="row"><span>Dein Name</span><input id="jname2" value="${esc(displayName())}"></label>
      </div>
      <p class="hint">Den Code bekommst du von deinem Geschäftsführer. Nach der Freigabe sieht er deine Zeiten und Abwesenheiten, aber nicht dein Gehalt und deine Steuerdaten.</p>
      <button class="big" onclick="onboardJoin()">Beitreten</button>
      <button class="pill wide" onclick="onboard(1)">Ich habe noch keinen Code</button>
      <button class="pill wide" onclick="onboardRole = ''; onboard(0)">‹ Zurück</button>`
    : `<h2>Willkommen 👋</h2>
      <p>Die Stempeluhr erfasst Arbeitszeiten und rechnet das Überstundenkonto aus. Wer bist du?</p>
      <button class="choice" onclick="onboardRole = 'boss'; onboard(0)"><span class="ci">🏢</span><span><b>Geschäftsführer</b><span class="muted small">Ich lege meine Firma an, lade Mitarbeiter ein und sehe ihre Zeiten.</span></span></button>
      <button class="choice" onclick="onboardRole = 'emp'; onboard(0)"><span class="ci">👤</span><span><b>Mitarbeiter</b><span class="muted small">Ich erfasse meine Zeiten. Den Einladungscode habe ich von meinem Geschäftsführer.</span></span></button>
      <button class="pill wide" onclick="onboardRole = 'solo'; onboard(1)">Ich nutze die App nur für mich</button>
      <p class="hint">Das kannst du später unter Setup → Konto & Firma ändern.</p>`,
    () => `<h2>Wo arbeitest du?</h2>
      <div class="group">
        <label class="row"><span>Bundesland</span><select id="ob-state"><option value="">Nur bundesweite Feiertage</option>${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${st.state === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="row"><span>Pause pro Tag (Min.)</span><input id="ob-pause" type="number" inputmode="numeric" min="0" value="${st.pause}"></label>
      </div><p class="hint">Das Bundesland bestimmt die Feiertage und Schulferien. Die Pause wird an jedem Arbeitstag pauschal abgezogen.</p>${next()}`,
    () => `<h2>${onboardRole === 'boss' ? 'Deine eigene Sollzeit' : 'Deine Sollzeit'}</h2>
      <p class="muted">An welchen Tagen arbeitest du und wie lange?</p>
      <div class="group">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label class="row"><span>${WD[i]}</span><input type="number" class="ob-soll" data-i="${i}" inputmode="decimal" step="0.25" min="0" max="24" value="${st.soll[i]}"></label>`).join('')}</div>
      <p class="hint">Stunden pro Tag, 0 = frei. Wechselnde Zeiten (z. B. Teilzeit ab einem Datum) stellst du später unter Setup → Arbeitszeit ein.${onboardRole === 'boss' ? ' Die Sollzeiten deiner Mitarbeiter stellen diese selbst ein, oder du über Setup → Team → Mitarbeiter → Setup.' : ''}</p>${next()}`,
    () => `<h2>Überstundenkonto</h2>
      <div class="group">
        <label class="row"><span>Aufzeichnung seit</span><input id="ob-since" type="date" value="${st.since}"></label>
        <label class="row"><span>Startsaldo</span><input id="ob-bal" value="${hm(st.startBalance * MIN, true)}" placeholder="00:00"></label>
      </div><p class="hint">Ab diesem Datum zählen die Sollstunden. Hast du schon Überstunden (z. B. aus einer alten App), trag sie als Startsaldo ein, etwa 12:30 oder -3:15.</p>${next()}`,
    () => `<h2>Fertig! 🎉</h2>
      ${isOwner() ? `<p>Deine Firma <b>${esc(company?.name || '')}</b> ist angelegt. Im Tab <b>Team</b> findest du den Einladungscode für deine Mitarbeiter.</p>`
        : membership?.status === 'pending' ? `<p>Deine Anfrage an <b>${esc(membership.companyName)}</b> ist raus. Sobald dein Geschäftsführer dich freigibt, sieht er deine Zeiten.</p>` : ''}
      <p>Tippe auf <b>Start</b>, wenn du anfängst zu arbeiten.</p>
      <p class="muted">Eine ausführliche Erklärung aller Funktionen findest du jederzeit unter <b>Setup → Hilfe</b>.</p>${next('Auf geht\'s')}`,
  ];
  sheet(`${dots}${pages[step]()}`);
}
async function onboardCompany() {
  if (!$('#cname').value.trim()) return alert('Bitte den Namen der Firma eintragen.');
  if (await createCompany()) onboard(1);
}
async function onboardJoin() {
  if (await joinCompany()) onboard(1);
}
function onboardNext() {
  const st = data.settings, s = onboardStep;
  if (s === 1) { st.state = $('#ob-state').value; st.pause = Math.max(0, +$('#ob-pause').value || 0); }
  if (s === 2) document.querySelectorAll('.ob-soll').forEach(el => { st.soll[+el.dataset.i] = Math.min(24, Math.max(0, num(el.value))); });
  if (s === 3) {
    if ($('#ob-since').value) st.since = $('#ob-since').value;
    const b = parseHm($('#ob-bal').value);
    if (b == null) return alert('Startsaldo bitte im Format 12:30 oder -3:15 eingeben.');
    st.startBalance = b;
  }
  if (s >= 4) { onboardDone(); closeSheet(); if (isOwner()) { go('setup'); openTopic('team'); } else go('start'); return; }
  save(); onboard(s + 1);
}
function onboardDone() { data.settings.onboarded = true; save(); }
function parseHm(v) {
  const r = String(v).trim().replace('−', '-').match(/^([+-]?)(\d+)(?:[:,.](\d{1,2}))?$/);
  if (!String(v).trim()) return 0;
  return r ? (r[1] === '-' ? -1 : 1) * (+r[2] * 60 + +(r[3] || 0)) : null;
}

// ---------- tutorial ----------
const TUTORIAL = [
  ['▶︎', 'Stempeln', 'Auf <b>Start</b> tippst du, wenn du anfängst, auf <b>Stop</b>, wenn du gehst. Machst du mittendrin länger Schluss, stempelst du einfach erneut: Ein Tag darf mehrere Zeitblöcke haben. Die große Uhr zeigt, wie lange du heute schon da bist.'],
  ['📊', 'Die Heute-Karte', 'Die <b>Prozentzahl</b> zeigt, wie viel deiner Sollzeit von heute geschafft ist. Der Balken färbt sich von Rot über Orange zu Grün, ab 110 % in der Überstundenfarbe. <b>Fertig um</b> sagt dir, wann du dein Soll inklusive Pause erreichst. <b>Differenz</b> ist Ist minus Soll von heute.'],
  ['☕️', 'Pause', 'Die Pause wird an jedem Tag mit Arbeitszeit <b>pauschal</b> abgezogen (Setup → Arbeitszeit). Du musst sie also nicht ausstempeln. Arbeitest du kürzer als die Pause, wird nur so viel abgezogen, wie du da warst.'],
  ['🎯', 'Sollzeit & Arbeitspläne', 'Unter Setup → Arbeitszeit legst du fest, wie viele Stunden du an jedem Wochentag arbeiten sollst. Ändert sich das (z. B. Teilzeit ab März), legst du unter <b>Arbeitspläne</b> eine neue Sollzeit ab einem Datum an. Gesetzliche <b>Feiertage</b> deines Bundeslands haben automatisch kein Soll.'],
  ['⚖️', 'Überstundenkonto', 'Jeden Tag wird <b>Netto minus Soll</b> gerechnet und aufaddiert, ab dem Datum „Aufzeichnung seit“. Dazu kommt dein <b>Startsaldo</b> und eventuelle <b>Korrekturen</b>. Tippe in der Übersicht auf das Konto, um die Rechnung Tag für Tag zu sehen. Mit „Auszahlen ab“ wird alles über einer Grenze am Monatsende ausgezahlt.'],
  ['📅', 'Kalender', 'Im Tab <b>Kalender</b> wechselst du oben zwischen <b>Tag</b>, <b>Woche</b> und <b>Monat</b>. Mit ‹ › blätterst du, „Heute“ springt zurück. Die Punkte zeigen den Status: <span class="green">grün</span> = Soll erreicht, <span class="red">rot</span> = zu wenig, <span style="color:var(--accent)">blau</span> = frei/abwesend. <b>Tippe auf einen Tag</b>, dann öffnet sich die Tagesansicht. Dort trägst du Zeiten nach, änderst sie oder trägst eine Abwesenheit ein. Im Monat findest du auch den PDF-Export.'],
  ['🏖', 'Abwesenheiten', 'Urlaub, Krank, Kind krank, unbezahlter Urlaub, Feiertag oder Stundenreduzierung trägst du unter <b>Abwesenheiten</b> ein. Diese Tage haben kein Soll (bei Reduzierung weniger). Der <b>Urlaubsplaner</b> sucht dir die besten Brückentage, und die <b>Schulferien</b> deines Bundeslands übernimmst du mit einem Tipp.'],
  ['⏱', 'Runden', 'Rundet dein Arbeitgeber Zeiten, stellst du das unter Setup → Arbeitszeit ein: auf 5, 10, 15 oder 30 Minuten, kaufmännisch, zugunsten Mitarbeiter (Start ab-, Ende aufrunden) oder zugunsten Arbeitgeber (umgekehrt). Gerundet wird nur in der Rechnung, die echten Stempelzeiten bleiben erhalten.'],
  ['📈', 'Statistik & Export', 'Der Tab <b>Statistik</b> zeigt Stunden, Überstunden, Urlaub und Krankheit für dieses Jahr. Über <b>Zeitraum</b> wählst du einen Monat, das Vorjahr oder beliebige Daten. Über <b>Exportieren</b> bekommst du Excel, CSV (Felder frei wählbar) oder eine Kalenderdatei für Apple- oder Google-Kalender.'],
  ['💶', 'Verdienst', 'Trag unter Setup → Verdienst & Steuern deine Jobs, Steuerklasse und Krankenkasse ein. Der Tab <b>Verdienst</b> rechnet dann Brutto, Abzüge und Netto pro Monat aus, inklusive ausgezahlter Überstunden. Diese Daten sieht nur du.'],
  ['👥', 'Firma & Team', 'Ein Geschäftsführer legt unter Setup eine <b>Firma</b> an und teilt den Einladungscode. Mitarbeiter treten bei, der Geschäftsführer gibt sie frei. Unter <b>Setup → Team</b> sieht der Geschäftsführer, wer gerade eingestempelt ist, Wochenstunden und Überstundenkonten, und kann Zeiten korrigieren oder alle Mitarbeiter als Excel exportieren.'],
];
const GLOSSARY = [
  ['Brutto', 'Die ganze Zeit zwischen Ein- und Ausstempeln, inklusive Pause.'],
  ['Pause', 'Pauschal abgezogene Zeit pro Arbeitstag (Setup).'],
  ['Netto', 'Brutto minus Pause, also deine angerechnete Arbeitszeit.'],
  ['Soll', 'Wie lange du an diesem Tag arbeiten solltest. 0 an Feiertagen, im Urlaub und vor deinem Startdatum.'],
  ['Differenz', 'Netto minus Soll. Plus = länger gearbeitet, Minus = kürzer.'],
  ['Überstundenkonto', 'Alle Differenzen seit dem Startdatum zusammengezählt, plus Startsaldo und Korrekturen, minus Auszahlungen.'],
  ['Überstunden gestern / aktuell', '„Gestern“ ist der Stand bis gestern. „Aktuell“ rechnet heute schon mit dem vollen Soll ein.'],
  ['Startsaldo', 'Dein Überstundenstand zu Beginn der Aufzeichnung, z. B. aus einer alten App.'],
  ['Korrektur', 'Eine manuelle Buchung aufs Konto, z. B. abgefeierte oder vom Geschäftsführer gutgeschriebene Stunden.'],
  ['Auszahlen ab', 'Grenze für das Konto. Was am Monatsende darüber liegt, wird ausgezahlt und im Verdienst berechnet.'],
  ['Arbeitsplan', 'Eine eigene Sollzeit pro Wochentag ab einem Datum, z. B. bei Teilzeit.'],
  ['Runden', 'Start und Ende werden für die Rechnung auf volle 5/10/15/30 Minuten gerundet.'],
  ['Arbeitstag', 'Ein Tag mit Sollzeit laut Plan, der kein Feiertag ist. Urlaubs- und Krankheitstage zählen nur an Arbeitstagen.'],
];
let tutPage = 0;
function openTutorial(p = 0) {
  tutPage = Math.max(0, Math.min(TUTORIAL.length - 1, p));
  const [icon, title, text] = TUTORIAL[tutPage];
  sheet(`<div class="sheet-head"><span class="muted small">${tutPage + 1} / ${TUTORIAL.length}</span><button class="pill sm" onclick="backToTopic()">Schließen</button></div>
  <div class="tut-icon">${icon}</div><h2 class="center">${title}</h2><p class="tut-text">${text}</p>
  <div class="dots">${TUTORIAL.map((_, i) => `<span class="${i === tutPage ? 'on' : ''}" onclick="openTutorial(${i})"></span>`).join('')}</div>
  <div class="two"><button class="pill" onclick="openTutorial(${tutPage - 1})" ${tutPage ? '' : 'disabled style="opacity:.4"'}>‹ Zurück</button>
  ${tutPage < TUTORIAL.length - 1 ? `<button class="pill" onclick="openTutorial(${tutPage + 1})">Weiter ›</button>` : '<button class="pill green" onclick="openGlossary()">Begriffe ›</button>'}</div>`);
}
function openGlossary() {
  sheet(`<div class="sheet-head"><h2>Begriffe</h2><button class="pill sm" onclick="backToTopic()">Fertig</button></div>
  <div class="group">${GLOSSARY.map(([t, x]) => `<div class="row"><span><b>${t}</b><div class="muted small">${x}</div></span></div>`).join('')}</div>`);
}

// ---------- arbeitspläne & runden ----------
function planText(p) {
  return `ab ${dmy(p.from)}${p.to ? ' bis ' + dmy(p.to) : ''} · ${p.soll.reduce((a, b) => a + (+b || 0), 0).toLocaleString('de-DE')} Std./Woche`;
}
function planForm(i) {
  const p = i == null ? { name: '', from: today(), to: '', soll: data.settings.soll.slice() } : data.settings.plans[i];
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="backToTopic()">Abbrechen</button><button class="pill sm green" onclick="savePlan(${i ?? -1})">Speichern</button></div>
  <h2>${i == null ? 'Arbeitsplan anlegen' : 'Arbeitsplan bearbeiten'}</h2>
  <div class="group">
    <label class="row"><span>Name</span><input id="pname" value="${esc(p.name)}" placeholder="z. B. Teilzeit"></label>
    <label class="row"><span>Gilt ab</span><input id="pfrom" type="date" value="${p.from}"></label>
    <label class="row"><span>Gilt bis</span><input id="pto" type="date" value="${p.to || ''}"></label>
  </div><p class="hint">„Gilt bis“ leer lassen = unbegrenzt. Überschneiden sich Pläne, gilt der mit dem späteren Startdatum.</p>
  <div class="label">Sollstunden pro Tag</div>
  <div class="group">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="row"><span>${WD[d]}</span><input type="number" class="psoll" data-i="${d}" inputmode="decimal" step="0.25" min="0" max="24" value="${p.soll[d]}"></label>`).join('')}</div>
  ${i == null ? '' : `<button class="pill wide red" onclick="delPlan(${i})">Arbeitsplan löschen</button>`}`);
}
function savePlan(i) {
  const soll = [0, 0, 0, 0, 0, 0, 0];
  document.querySelectorAll('.psoll').forEach(el => { soll[+el.dataset.i] = Math.min(24, Math.max(0, num(el.value))); });
  const p = { name: $('#pname').value.trim(), from: $('#pfrom').value, to: $('#pto').value, soll };
  if (!p.from) return alert('Bitte ein Startdatum wählen.');
  if (p.to && p.to < p.from) return alert('„Gilt bis“ muss nach „Gilt ab“ liegen.');
  if (i < 0) data.settings.plans.push(p); else data.settings.plans[i] = p;
  data.settings.plans.sort((a, b) => a.from.localeCompare(b.from));
  save(); backToTopic();
}
function delPlan(i) { if (confirm('Arbeitsplan löschen?')) { data.settings.plans.splice(i, 1); save(); backToTopic(); } }
function setRound(k, v) { data.settings.round = { ...data.settings.round, [k]: k === 'step' ? +v : v }; save(); openTopic('work'); }

function setupExtrasHtml() {
  const st = data.settings, r = st.round || {};
  return `<div class="label">Arbeitspläne</div>
  ${st.plans.length ? `<div class="group">${st.plans.map((p, i) => `<button class="row" onclick="planForm(${i})"><span>${esc(p.name || 'Arbeitsplan')}<div class="muted small">${planText(p)}</div></span><span class="muted">›</span></button>`).join('')}</div>` : ''}
  <button class="pill wide" onclick="planForm()">+ Arbeitsplan hinzufügen</button>
  <p class="hint">Für andere Sollzeiten ab einem Datum oder in einem Zeitraum, z. B. Teilzeit, Elternzeit oder Saisonarbeit. Ohne Plan gelten die Sollstunden oben.</p>
  <div class="label">Runden</div>
  <div class="group">
    <label class="row"><span>Runden auf</span><select onchange="setRound('step', this.value)">${[[0, 'Nicht runden'], [5, '5 Min.'], [10, '10 Min.'], [15, '15 Min.'], [30, '30 Min.']].map(([v, l]) => `<option value="${v}" ${+r.step === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${+r.step ? `<label class="row"><span>Regel</span><select onchange="setRound('mode', this.value)">${[['nearest', 'Kaufmännisch'], ['employee', 'Zugunsten Mitarbeiter'], ['employer', 'Zugunsten Arbeitgeber']].map(([v, l]) => `<option value="${v}" ${r.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
  </div>
  <p class="hint">Gerundet wird nur in der Rechnung, deine echten Stempelzeiten bleiben. Zugunsten Mitarbeiter: Start wird ab-, Ende aufgerundet. Zugunsten Arbeitgeber: umgekehrt.</p>`;
}
// ---------- statistik ----------
// Standard ist dieses Jahr; „Zeitraum“ öffnet ein Fenster mit weiteren Zeiträumen und freier Auswahl.
let statRange = { preset: 'year', from: '', to: '' };
const STAT_PRESETS = { month: 'Dieser Monat', lastmonth: 'Letzter Monat', '12m': 'Letzte 12 Monate', last: 'Letztes Jahr' };
function statBounds() {
  const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7) - 1, p = statRange.preset;
  if (p === 'year') return [y + '-01-01', y + '-12-31'];
  if (p === 'last') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
  if (p === '12m') return [addDays(t, -364), t];
  if (p === 'month') return monthBounds(y, m);
  if (p === 'lastmonth') { const d = new Date(y, m - 1, 1); return monthBounds(d.getFullYear(), d.getMonth()); }
  return [statRange.from || y + '-01-01', statRange.to || t];
}
function statLabel() {
  if (statRange.preset === 'custom') { const [f, t] = statBounds(); return dmy(f).slice(0, 6) + ' – ' + dmy(t); }
  return STAT_PRESETS[statRange.preset];
}
function setStat(p) { statRange.preset = p; closeSheet(); render(); }
function openRange() {
  const [f, t] = statBounds(), opt = (p, l) => `<button class="row" onclick="setStat('${p}')"><span>${l}</span><span>${statRange.preset === p ? '✓' : ''}</span></button>`;
  sheet(`<div class="sheet-head"><h2>Zeitraum</h2><button class="pill sm" onclick="closeSheet()">Abbrechen</button></div>
  <div class="group" style="margin-top:12px">${opt('year', 'Dieses Jahr')}${Object.entries(STAT_PRESETS).map(([p, l]) => opt(p, l)).join('')}</div>
  <div class="label">Eigener Zeitraum</div>
  <div class="group">
    <label class="row"><span>Von</span><input type="date" id="rfrom" value="${f}"></label>
    <label class="row"><span>Bis</span><input type="date" id="rto" value="${t}"></label>
  </div>
  <button class="big" onclick="applyRange()">Übernehmen</button>`);
}
function applyRange() {
  const f = $('#rfrom').value, t = $('#rto').value;
  if (!f || !t || t < f) return alert('Bitte einen gültigen Zeitraum wählen.');
  statRange = { preset: 'custom', from: f, to: t }; closeSheet(); render();
}
function chart(cols, h = 140) {
  const max = Math.max(HOUR, ...cols.map(c => Math.max(c.v, c.soll || 0)));
  return `<div class="chart">${cols.map(c => `<div class="ccol"><span class="cval">${c.v ? (c.v / HOUR).toFixed(c.v / HOUR < 10 ? 1 : 0).replace('.', ',') : ''}</span>
    <div class="ctrack" style="height:${h}px"><div class="cbar" style="height:${c.v / max * 100}%;background:${c.color || 'var(--accent)'}"></div>${c.soll ? `<div class="cmark" style="bottom:${c.soll / max * 100}%"></div>` : ''}</div>
    <span class="clab">${c.label}</span></div>`).join('')}</div>`;
}
// Geschäftsführer: Auswahl „Ich“, „Ganze Firma“ oder ein einzelner Mitarbeiter
let statWho = 'me';
const teamData = {};   // uid -> { d, at } geladene Daten der Mitarbeiter (für Statistik)
async function teamLoad(uids, force) {
  await Promise.all(uids.map(async uid => {
    if (!force && teamData[uid] && Date.now() - teamData[uid].at < 60000) return;
    try { const s = await ref('data/' + uid).get(); teamData[uid] = { d: s.exists ? merged(s.data(), null) : normalize({}), at: Date.now() }; }
    catch (e) { teamData[uid] = { err: e.message, at: Date.now() }; }
  }));
}
function setWho(v) { statWho = v; render(); view.scrollTop = 0; }
function renderStats() {
  const boss = isOwner() && (!viewing || asSelf()) && company;
  const people = boss ? teamPeople().filter(p => !p.self) : [];
  if (boss && statWho !== 'me' && statWho !== 'team' && !people.some(p => p.uid === statWho)) statWho = 'me';
  const [from, to] = statBounds(), year = statRange.preset === 'year';
  const head = `<h1 class="center">Statistik</h1>
  ${boss ? `<div class="group whopick">
    ${ADMIN_APP ? '' : firmSwitchHtml() || `<div class="row"><span>Firma</span><span><b>${esc(company.name)}</b></span></div>`}
    <label class="row"><span>Ansicht</span><select onchange="setWho(this.value)">
      <option value="me" ${statWho === 'me' ? 'selected' : ''}>Ich</option>
      <option value="team" ${statWho === 'team' ? 'selected' : ''}>Ganze Firma (${teamPeople().length} ${teamPeople().length === 1 ? 'Person' : 'Personen'})</option>
      ${people.length ? `<optgroup label="Mitarbeiter">${people.map(p => `<option value="${p.uid}" ${statWho === p.uid ? 'selected' : ''}>${esc(p.name)}${p.boss ? ' (GF)' : ''}</option>`).join('')}</optgroup>` : ''}
    </select></label></div>` : ''}
  <div class="statbar"><button class="pill sm ${year ? 'sel' : ''}" onclick="setStat('year')">Dieses Jahr</button><button class="pill sm ${year ? '' : 'sel'}" onclick="openRange()">📅 ${year ? 'Zeitraum' : statLabel()} ▾</button></div>
  <p class="center muted small">${dmy(from)} – ${dmy(to)}</p>`;
  if (!boss || statWho === 'me') { view.innerHTML = head + statsHtml(data, null); return; }
  const loading = `<p class="center muted" style="margin-top:20vh">Lädt …</p>`;
  if (statWho === 'team') {
    const uids = teamPeople().map(p => p.uid), ready = uids.every(u => teamData[u]);
    view.innerHTML = head + (ready ? teamStatsHtml(from, to) : loading);
    teamLoad(uids).then(() => { if (!ready && tab === 'stats' && statWho === 'team') render(); });
    return;
  }
  const p = people.find(x => x.uid === statWho), td = teamData[statWho];
  view.innerHTML = head + (td?.d ? `<p class="center" style="margin:-4px 0 8px"><b>${esc(p.name)}</b>${p.boss ? ' <span class="badge-gf">GF</span>' : ''}</p>` + statsHtml(td.d, p)
    : td?.err ? `<p class="center red">Zeiten konnten nicht geladen werden: ${esc(td.err)}</p>` : loading);
  if (!td?.d) teamLoad([statWho]).then(() => { if (tab === 'stats' && statWho === p.uid) render(); });
}
// Übersicht der ganzen Firma: Summen und eine Zeile pro Person
function teamStatsHtml(from, to) {
  const t = today(), until = to < t ? to : t;
  const rows = teamPeople().map(p => {
    const d = teamData[p.uid]?.d; if (!d) return null;
    const c = makeCalc(d, Date.now()), all = c.range(from, to), past = all.filter(x => x.d <= t);
    const y = until.slice(0, 4), yd = c.range(y + '-01-01', y + '-12-31');
    return { p, net: sum(past, 'net'), soll: sum(past, 'soll'), bal: c.balance(until), days: past.filter(x => x.net > 0).length,
      vac: countAbs(all, 'urlaub'), vacLeft: (+d.settings.vacation || 0) - countAbs(yd, 'urlaub'), sick: countAbs(all, 'krank'), kid: countAbs(all, 'kindkrank'), unpaid: countAbs(all, 'unbezahlt'),
      open: openState(d.sessions) };
  }).filter(Boolean);
  const tot = k => rows.reduce((a, r) => a + r[k], 0);
  const sick = tot('sick'), net = tot('net'), soll = tot('soll');
  return `<div class="label">Überblick Firma</div>
  <div class="kpis">
    <div class="kpi"><b>${hours(net)}</b><span>Gearbeitet gesamt</span></div>
    <div class="kpi"><b class="${cls(net - soll)}">${hm(net - soll, true)}</b><span>Differenz zum Soll</span></div>
    <div class="kpi"><b>${tot('vac')}</b><span>Urlaubstage</span></div>
    <div class="kpi"><b>${sick + tot('kid')}</b><span>Krankheitstage${tot('kid') ? ' inkl. Kind krank' : ''}</span></div>
  </div>
  <div class="label">Pro Person</div>
  ${rows.map(r => `<button class="card teamstat" onclick="setWho('${r.p.self ? 'me' : r.p.uid}')">
    <div class="ts-head"><b>${openLabel(r.open)}${esc(r.p.name)}${r.p.self ? ' <span class="muted">(du)</span>' : ''}${r.p.boss ? ' <span class="badge-gf">GF</span>' : ''}</b><span class="muted">›</span></div>
    <div class="ts-grid">
      <span><b>${hours(r.net)}</b><small>Gearbeitet</small></span>
      <span><b class="${cls(r.net - r.soll)}">${hm(r.net - r.soll, true)}</b><small>Differenz</small></span>
      <span><b class="${cls(r.bal)}">${hm(r.bal, true)}</b><small>Konto</small></span>
      <span><b>${r.days}</b><small>Arbeitstage</small></span>
      <span><b>${r.vac}</b><small>Urlaub · Rest ${r.vacLeft}</small></span>
      <span><b>${r.sick}</b><small>Krank${r.kid ? ` · Kind ${r.kid}` : ''}${r.unpaid ? ` · Unbez. ${r.unpaid}` : ''}</small></span>
    </div></button>`).join('')}
  <p class="hint">Konto = Überstundenkonto am ${dmy(until)}. Rest = verbleibende Urlaubstage im Jahr ${until.slice(0, 4)}. Tippe auf eine Person für alle Details.</p>
  <button class="pill wide" onclick="openPayroll()">📤 Zeitraum für die Lohnabrechnung exportieren</button>`;
}
function statsHtml(d, who) {  // who: null = eigene Daten, sonst { uid, name } eines Mitarbeiters
  const c = makeCalc(d, Date.now()), t = today(), [from, to] = statBounds(), until = to < t ? to : t;
  const all = c.range(from, to), past = all.filter(x => x.d <= t), worked = past.filter(x => x.net > 0);
  const net = sum(past, 'net'), soll = sum(past, 'soll'), diff = net - soll, s = stats(all);
  const short = (parseYmd(to) - parseYmd(from)) / 86400000 <= 62;
  const buckets = [];
  for (const x of all) {
    const k = short ? 'KW ' + isoWeek(x.d) : MSHORT[+x.d.slice(5, 7) - 1] + (from.slice(0, 4) !== to.slice(0, 4) ? " '" + x.d.slice(2, 4) : '');
    let b = buckets.at(-1);
    if (!b || b.label !== k) buckets.push(b = { label: k, v: 0, soll: 0, future: true });
    b.v += x.net; if (x.d <= t) { b.soll += x.soll; b.future = false; }
  }
  buckets.forEach(b => b.color = b.future ? 'var(--future)' : progColor(b.soll ? Math.round(b.v / b.soll * 100) : 100));
  const wd = [1, 2, 3, 4, 5, 6, 0].map(i => { const ds = worked.filter(x => parseYmd(x.d).getDay() === i); return { label: WD[i].slice(0, 2), v: ds.length ? sum(ds, 'net') / ds.length : 0, color: 'var(--accent)' }; });
  const longest = worked.reduce((a, x) => !a || x.net > a.net ? x : a, null);
  const earliest = worked.reduce((a, x) => !a || minOfDay(x.sess[0].s) < minOfDay(a.sess[0].s) ? x : a, null);
  const holi = all.filter(x => x.holiday && x.planned).length, year = statRange.preset === 'year';
  const row = (l, v, k = '') => `<div class="row"><span>${l}</span><span class="${k}">${v}</span></div>`;
  const bal = who ? `<div class="kpi"><b class="${cls(c.balance(until))}">${hm(c.balance(until), true)}</b><span>Überstundenkonto</span></div>`
    : `<button class="kpi" onclick="openBalance()"><b class="${cls(c.balance(until))}">${hm(c.balance(until), true)}</b><span>Überstundenkonto ›</span></button>`;
  const vacYear = (() => { const y = until.slice(0, 4), yd = c.range(y + '-01-01', y + '-12-31'); return { used: countAbs(yd, 'urlaub'), total: +d.settings.vacation || 0, y }; })();
  return `<div class="label">Überblick</div>
  <div class="kpis">
    <div class="kpi"><b>${hours(net)}</b><span>Gearbeitet</span></div>
    <div class="kpi"><b>${hours(soll)}</b><span>Soll bis ${dmy(until).slice(0, 6)}</span></div>
    <div class="kpi"><b class="${cls(diff)}">${hm(diff, true)}</b><span>Differenz</span></div>
    ${bal}
  </div>

  <div class="label">Verlauf (${short ? 'Wochen' : 'Monate'})</div>
  <div class="card">${chart(buckets)}<p class="hint" style="margin:10px 0 0">Balken = gearbeitete Stunden, Strich = Soll. Die Farbe zeigt, wie viel vom Soll erreicht ist.</p></div>

  <div class="label">Arbeitszeiten</div>
  <div class="group">
    ${row('Tage gearbeitet', worked.length)}${row('Ø pro Arbeitstag', worked.length ? dur(net / worked.length) : '–')}
    ${row('Ø Beginn', s.start)}${row('Ø Ende', s.end)}
    ${row('Längster Tag', longest ? `${dur(longest.net)} · ${dmy(longest.d).slice(0, 6)}` : '–')}
    ${row('Frühester Beginn', earliest ? `${tod(earliest.sess[0].s)} · ${dmy(earliest.d).slice(0, 6)}` : '–')}
  </div>
  <div class="card">${chart(wd, 90)}<p class="hint" style="margin:10px 0 0">Ø Stunden pro Wochentag</p></div>

  <div class="label">Abwesenheiten</div>
  <div class="group">
    ${row('Urlaubstage', countAbs(all, 'urlaub'))}${row(`Urlaub ${vacYear.y}: genommen / Anspruch`, `${vacYear.used} / ${vacYear.total} · Rest ${vacYear.total - vacYear.used}`)}${row('Krankheitstage', countAbs(all, 'krank'))}
    ${row('Kind krank', countAbs(all, 'kindkrank'))}${row('Unbezahlter Urlaub', countAbs(all, 'unbezahlt'))}
    ${row('Feiertage (an Arbeitstagen)', holi)}
  </div>

  <div class="label">Mehr</div>
  <div class="group">${who ? `
    <button class="row" onclick="viewMember('${who.uid}')"><span>Kalender von ${esc(who.name)} öffnen (Zeiten ansehen und korrigieren)</span><span class="muted">›</span></button>` : `
    <button class="row" onclick="openBalance()"><span>Überstunden Tag für Tag</span><span class="muted">›</span></button>
    <button class="row" onclick="openExport('${from}', '${to}')"><span>Zeitraum exportieren (Excel, CSV, Kalender)</span><span class="muted">›</span></button>`}
  </div>`;
}

// ---------- überstunden-erklärung & korrekturen ----------
function openBalance() {
  const c = calc(), st = data.settings, t = today(), po = c.payouts();
  const months = [];
  for (let d = st.since; d <= t; d = addDays(d, 1)) {
    const x = c.day(d), k = d.slice(0, 7);
    let m = months.at(-1);
    if (!m || m.k !== k) months.push(m = { k, rows: [], change: 0 });
    m.change += x.diff + x.adj;
    if (x.diff || x.adj || note(x)) m.rows.push(x);
    m.end = c.balance(d);
  }
  const box = x => `<div class="dbox ${cls(x.diff + x.adj)}"><b>${x.d.slice(8)}</b><span>${MSHORT[+x.d.slice(5, 7) - 1]}</span><span>${WD[parseYmd(x.d).getDay()].slice(0, 2)}</span></div>`;
  const text = x => {
    const out = [];
    if (x.soll || x.net) out.push(`<b>${dur(x.net)} von ${dur(x.soll)}</b><div class="muted small">${x.diff > 0 ? `Du hast ${dur(x.diff)} mehr gearbeitet` : x.diff < 0 ? `Du hast ${dur(-x.diff)} weniger gearbeitet` : 'Genau dein Soll'}${note(x) ? ' · ' + esc(note(x)) : ''}</div>`);
    else out.push(`<b>${esc(note(x)) || 'Kein Soll'}</b>`);
    for (const a of (data.adjustments || []).filter(a => a.d === x.d)) out.push(`<div class="small" style="color:var(--accent)">Korrektur ${hm(a.min * MIN, true)}${a.note ? ': ' + esc(a.note) : ''}</div>`);
    return out.join('');
  };
  sheet(`<div class="sheet-head"><h2>Überstunden</h2><button class="pill sm" onclick="closeSheet()">Fertig</button></div>
  <p class="hint" style="margin:6px 4px 12px">Die Werte rechts laufen fortlaufend: Jeder Tag addiert seine Differenz (Netto minus Soll). An Tagen ohne Soll und ohne Arbeit ändert sich nichts.</p>
  <div class="group">
    <div class="row"><span>Startsaldo (${dmy(st.since)})</span><span class="${cls(st.startBalance * MIN)}">${hm(st.startBalance * MIN, true)}</span></div>
    <div class="row"><span><b>Stand heute</b></span><span class="${cls(c.balance(t))}"><b>${hm(c.balance(t), true)}</b></span></div>
  </div>
  <button class="pill wide" onclick="adjForm()">+ Korrektur buchen</button>
  ${months.slice().reverse().map((m, i) => `<details class="month" ${i === 0 ? 'open' : ''}><summary><span>${MONTHS[+m.k.slice(5) - 1]} ${m.k.slice(0, 4)}</span><span class="badge2 ${cls(m.end)}">${hm(m.end, true)}</span></summary>
    <div class="muted small" style="margin:0 6px 8px">Veränderung im Monat: ${hm(m.change, true)}${po[m.k] ? ` · ausgezahlt: ${hm(po[m.k])} Std.` : ''}</div>
    ${m.rows.slice().reverse().map(x => `<div class="brow">${box(x)}<div class="btext">${text(x)}</div><span class="badge2 ${cls(c.balance(x.d))}">${hm(c.balance(x.d), true)}</span></div>`).join('') || '<p class="muted small center">Keine Veränderung</p>'}
  </details>`).join('')}
  ${(data.adjustments || []).length ? `<div class="label">Korrekturen</div><div class="group">${data.adjustments.slice().sort((a, b) => b.d.localeCompare(a.d)).map(a => `<div class="row"><span>${dmy(a.d)} · <span class="${cls(a.min)}">${hm(a.min * MIN, true)}</span><div class="muted small">${esc(a.note || '')}</div></span><button class="del" onclick="delAdj('${a.id}')">Löschen</button></div>`).join('')}</div>` : ''}`);
}
function adjForm() {
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="openBalance()">Abbrechen</button><button class="pill sm green" onclick="saveAdj()">Speichern</button></div>
  <h2>Korrektur buchen</h2>
  <div class="group">
    <label class="row"><span>Datum</span><input id="adate" type="date" value="${today()}"></label>
    <label class="row"><span>Art</span><select id="asign"><option value="1">Gutschrift (+)</option><option value="-1">Abzug (−)</option></select></label>
    <label class="row"><span>Stunden</span><input id="amin" class="short" placeholder="2:30" inputmode="numeric"></label>
    <label class="row"><span>Notiz</span><input id="anote" placeholder="z. B. Überstunden abgefeiert"></label>
  </div>
  <p class="hint">Für Buchungen, die keine Arbeitszeit sind: abgefeierte Überstunden, Gutschriften vom Geschäftsführer, Ausgleich aus einer alten App. Erst ab dem Startdatum (${dmy(data.settings.since)}) wirksam.</p>`);
}
function saveAdj() {
  const d = $('#adate').value, m = parseHm($('#amin').value);
  if (!d || !m || m < 0) return alert('Bitte Datum und Stunden (z. B. 2:30) eintragen.');
  data.adjustments.push({ id: Date.now().toString(36), d, min: m * +$('#asign').value, note: $('#anote').value.trim() });
  save(); render(); openBalance();
}
function delAdj(id) {
  if (!confirm('Korrektur löschen?')) return;
  data.adjustments = data.adjustments.filter(a => a.id !== id); save(); render(); openBalance();
}

// ---------- export ----------
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`) && window.XLSX) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Excel-Modul konnte nicht geladen werden (Internet?)'));
    document.head.append(s);
  });
}
const COLS = {
  date: 'Datum', wd: 'Wochentag', times: 'Von – Bis', gross: 'Brutto', pause: 'Pause', net: 'Netto', soll: 'Soll', diff: 'Differenz', bal: 'Überstundenkonto', note: 'Bemerkung',
};
const DEF_COLS = ['date', 'wd', 'times', 'net', 'soll', 'diff', 'bal', 'note'];
function exportPrefs() {
  try { return { cols: DEF_COLS, dec: false, ...JSON.parse(localStorage.getItem('stempeluhr-export')) }; } catch { return { cols: DEF_COLS, dec: false }; }
}
function openExport(from, to) {
  const p = exportPrefs(), [mf, mt] = monthBounds(month.y, month.m);
  sheet(`<div class="sheet-head"><h2>Exportieren</h2><button class="pill sm" onclick="closeSheet()">Abbrechen</button></div>
  <div class="group">
    <label class="row"><span>Format</span><select id="xfmt" onchange="$('#xcols').hidden = this.value === 'ics'"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="ics">Kalender (.ics)</option></select></label>
    <label class="row"><span>Von</span><input id="xfrom" type="date" value="${from || mf}"></label>
    <label class="row"><span>Bis</span><input id="xto" type="date" value="${to || mt}"></label>
  </div>
  <div id="xcols">
    <div class="label">Spalten</div>
    <div class="group">${Object.entries(COLS).map(([k, l]) => `<label class="row"><span>${l}</span><input type="checkbox" class="xcol" value="${k}" ${p.cols.includes(k) ? 'checked' : ''}></label>`).join('')}</div>
    <div class="group"><label class="row"><span>Zeiten als Dezimalstunden (8,5 statt 08:30)</span><input type="checkbox" id="xdec" ${p.dec ? 'checked' : ''}></label></div>
  </div>
  <p class="hint">Die Kalenderdatei enthält deine Arbeitszeiten und Abwesenheiten. Öffne sie auf dem iPhone, dann fragt der Kalender, ob er sie übernehmen soll.</p>
  <button class="big" onclick="doExport()">Exportieren</button>`);
}
function rowsFor(d, from, to, cols, dec) {
  const c = makeCalc(d, Date.now()), t = today();
  const f = ms => dec ? Math.round(ms / HOUR * 100) / 100 : hm(ms, ms < 0);
  return c.range(from, to).map(x => cols.map(k => ({
    date: dmy(x.d), wd: WD[parseYmd(x.d).getDay()], times: span(x, ' - '),
    gross: x.gross ? f(x.gross) : '', pause: x.gross ? f(x.pause) : '', net: x.gross ? f(x.net) : '', soll: x.soll ? f(x.soll) : '',
    diff: x.d <= t && (x.soll || x.gross) ? (dec ? f(x.diff) : hm(x.diff, true)) : '',
    bal: x.d <= t ? (dec ? f(c.balance(x.d)) : hm(c.balance(x.d), true)) : '', note: note(x),
  })[k]));
}
async function doExport() {
  const fmt = $('#xfmt').value, from = $('#xfrom').value, to = $('#xto').value;
  if (!from || !to || to < from) return alert('Bitte einen gültigen Zeitraum wählen.');
  const cols = [...document.querySelectorAll('.xcol:checked')].map(e => e.value), dec = $('#xdec').checked;
  try { localStorage.setItem('stempeluhr-export', JSON.stringify({ cols, dec })); } catch {}
  const who = (data.settings.name || 'Arbeitszeit').replace(/[^\wäöüÄÖÜß-]+/g, '_'), name = `${who}_${from}_bis_${to}`;
  if (fmt === 'ics') return deliver(new Blob([icsFor(data, from, to)], { type: 'text/calendar' }), name + '.ics');
  if (!cols.length) return alert('Bitte mindestens eine Spalte wählen.');
  const head = cols.map(k => COLS[k]), rows = rowsFor(data, from, to, cols, dec);
  if (fmt === 'csv') {
    const cell = v => typeof v === 'number' ? String(v).replace('.', ',') : /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
    const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
    return deliver(new Blob([csv], { type: 'text/csv' }), name + '.csv');
  }
  try {
    await loadScript(XLSX_SRC);
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = cols.map(k => ({ wch: k === 'note' ? 30 : k === 'times' ? 16 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Arbeitszeit');
    deliver(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name + '.xlsx');
  } catch (e) { alert(e.message); }
}
function icsFor(d, from, to) {
  const z = n => String(n).padStart(2, '0');
  const utc = ms => { const x = new Date(ms); return `${x.getUTCFullYear()}${z(x.getUTCMonth() + 1)}${z(x.getUTCDate())}T${z(x.getUTCHours())}${z(x.getUTCMinutes())}00Z`; };
  const day = s => s.replace(/-/g, ''), txt = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = utc(Date.now()), ev = [];
  for (const x of d.sessions) {
    const dd = ymd(new Date(x.s));
    if (dd < from || dd > to || x.e == null) continue;
    ev.push(['BEGIN:VEVENT', `UID:s${x.s}@stempeluhr`, `DTSTAMP:${stamp}`, `DTSTART:${utc(x.s)}`, `DTEND:${utc(x.e)}`, 'SUMMARY:Arbeit', 'END:VEVENT']);
  }
  for (const a of d.absences) {
    if (a.to < from || a.from > to) continue;
    ev.push(['BEGIN:VEVENT', `UID:a${a.id}@stempeluhr`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(a.from)}`, `DTEND;VALUE=DATE:${day(addDays(a.to, 1))}`,
      `SUMMARY:${txt(TYPES[a.type] + (a.comment ? ': ' + a.comment : ''))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT']);
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Stempeluhr//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Arbeitszeit', ...ev.flat(), 'END:VCALENDAR'].join('\r\n');
}

// Geschäftsführer: alle Mitarbeiter eines Monats als Excel (Übersicht + ein Blatt pro Person)
function openTeamExport() {
  const n = new Date();
  sheet(`<div class="sheet-head"><h2>Team exportieren</h2><button class="pill sm" onclick="closeSheet()">Abbrechen</button></div>
  <div class="group"><label class="row"><span>Monat</span><input type="month" id="tmonth" value="${n.getFullYear()}-${pad(n.getMonth() + 1)}"></label></div>
  <p class="hint">Excel-Datei mit einer Übersicht (Soll, Ist, Differenz, Überstundenkonto, Urlaub, Krankheit) und einem Blatt pro Mitarbeiter mit allen Tagen.</p>
  <button class="big" onclick="doTeamExport()">Excel erstellen</button>`);
}
async function doTeamExport() {
  const [y, m] = $('#tmonth').value.split('-').map(Number);
  if (!y) return;
  const [from, to] = monthBounds(y, m - 1), t = today(), stand = to < t ? to : t, cols = DEF_COLS, dec = exportPrefs().dec;
  try {
    await loadScript(XLSX_SRC);
    const wb = XLSX.utils.book_new(), over = [['Name', 'Soll', 'Gearbeitet', 'Differenz', `Überstundenkonto (${dmy(stand)})`, 'Urlaubstage', 'Krankheitstage']], sheets = [];
    for (const mem of teamPeople()) {
      const s = await ref('data/' + mem.uid).get();
      if (!s.exists) continue;
      const d = merged(s.data(), null), c = makeCalc(d, Date.now()), days = c.range(from, to), past = days.filter(x => x.d <= stand);
      over.push([mem.name, hm(sum(days, 'soll')), hm(sum(days, 'net')), hm(sum(past, 'diff'), true), hm(c.balance(stand), true), countAbs(days, 'urlaub'), countAbs(days, 'krank')]);
      sheets.push([mem.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Mitarbeiter', [cols.map(k => COLS[k]), ...rowsFor(d, from, to, cols, dec)]]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(over), 'Übersicht');
    const used = new Set(['Übersicht']);
    for (let [n, aoa] of sheets) { let k = n, i = 2; while (used.has(k)) k = n.slice(0, 28) + ' ' + i++; used.add(k); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), k); }
    deliver(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${company.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${y}-${pad(m)}.xlsx`);
  } catch (e) { alert('Export fehlgeschlagen: ' + e.message); }
}

// ---------- Lohn-Export / Schnittstellen (Geschäftsführer) ----------
// Lexware & Co. haben für Arbeitszeiten keine Online-Schnittstelle. Die App erzeugt eine Importdatei,
// die die Lohnsoftware einliest. Einstellungen liegen in companies/{cid}/admin/settings: alle Geschäftsführer
// teilen sie, Mitarbeiter sehen keine Personalnummern der Kollegen.
const PAY_SOFT = {
  lexware: { name: 'Lexware lohn+gehalt', enc: 'win', hint: 'In Lexware lohn+gehalt: Datei → Import → Lohndaten (Bewegungsdaten). Beim ersten Mal ordnest du die Spalten zu, Lexware merkt sich das.' },
  datev: { name: 'DATEV Lohn (Bewegungsdaten)', enc: 'win', hint: 'Für DATEV LODAS bzw. Lohn und Gehalt über den ASCII-Import. Personalnummern und Lohnarten mit dem Steuerbüro abstimmen.' },
  other: { name: 'Andere Lohnsoftware (CSV)', enc: 'utf8', hint: 'Allgemeine CSV-Datei mit Semikolon, die fast jede Lohnsoftware einlesen kann.' },
};
const PAY_LA = [['work', 'Arbeitsstunden', 'Std.', '1000'], ['over', 'Überstunden', 'Std.', '1100'], ['vac', 'Urlaub', 'Tage', '1200'], ['sick', 'Krankheit', 'Tage', '1300']];
const payStored = () => companyAdmin.payroll || data.settings.payroll;
const payHas = () => !!payStored()?.soft;
const payCfg = () => ({ soft: 'lexware', day: 'last', content: 'sum', la: {}, pnr: {}, last: '', ...(payStored() || {}) });
const ymKey = (y, m) => `${y}-${pad(m + 1)}`;
const ymName = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }); };
// Für welchen Monat ist der Export zuletzt fällig geworden?
function payDueMonth(cfg = payCfg(), now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), lastDay = new Date(y, m + 1, 0).getDate();
  if (cfg.day === 'last') return d === lastDay ? ymKey(y, m) : ymKey(new Date(y, m - 1, 1).getFullYear(), new Date(y, m - 1, 1).getMonth());
  const back = d >= +cfg.day ? 1 : 2, t = new Date(y, m - back, 1);
  return ymKey(t.getFullYear(), t.getMonth());
}
function payDue() { if (!isOwner() || viewing || !payHas()) return null; const k = payDueMonth(); return (payCfg().last || '') >= k ? null : k; }
function payDueHtml() {
  const k = payDue(); if (!k) return '';
  return `<div class="card paydue"><b>📤 Lohn-Export für ${ymName(k)} ist fällig</b><div class="muted small">${PAY_SOFT[payCfg().soft].name}</div>
    <button class="pill wide sel" onclick="openPayroll('${k}')">Jetzt exportieren</button></div>`;
}
function openPayroll(month) {
  const cfg = payCfg(), act = teamPeople();
  const k = month || payDueMonth(cfg);
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="openTopic('team')">‹ Team</button><button class="pill sm" onclick="openPaySettings()">⚙︎ Schnittstelle</button></div>
  <h2>Lohn-Export</h2>
  <div class="label">Zeitraum</div>
  <div class="group">
    <label class="row"><span>Monat</span><input type="month" id="pmonth" value="${k}" onchange="$('#pfrom').value=''; $('#pto').value=''"></label>
    <label class="row"><span>oder von</span><input type="date" id="pfrom"></label>
    <label class="row"><span>bis</span><input type="date" id="pto"></label>
  </div>
  <div class="label">Mitarbeiter</div>
  <div class="group">
    <label class="row"><span><b>Alle Mitarbeiter</b></span><input type="checkbox" switch id="pall" checked onchange="document.querySelectorAll('.pmem').forEach(c => c.checked = this.checked)"></label>
    ${act.map(m => `<label class="row"><span>${esc(m.name)}${m.self ? ' <span class="muted">(du)</span>' : ''}${m.boss ? ' <span class="badge-gf">GF</span>' : ''}<div class="muted small">${cfg.pnr[m.uid] ? 'Personalnr. ' + esc(cfg.pnr[m.uid]) : '<span class="red">Keine Personalnummer</span>'}</div></span><input type="checkbox" class="pmem" value="${m.uid}" checked onchange="$('#pall').checked = [...document.querySelectorAll('.pmem')].every(c => c.checked)"></label>`).join('')}
  </div>
  <div class="label">Format</div>
  <div class="group">
    <label class="row"><span>Für</span><select id="psoft">${Object.entries(PAY_SOFT).map(([v, x]) => `<option value="${v}" ${cfg.soft === v ? 'selected' : ''}>${x.name}</option>`).join('')}<option value="xlsx">Excel (Übersicht und alle Tage)</option></select></label>
    <label class="row"><span>Inhalt</span><select id="pcontent"><option value="sum" ${cfg.content === 'sum' ? 'selected' : ''}>Monatssummen je Lohnart</option><option value="days" ${cfg.content === 'days' ? 'selected' : ''}>Jeden Arbeitstag einzeln</option></select></label>
  </div>
  <p class="hint">${PAY_SOFT[cfg.soft]?.hint || ''}</p>
  <button class="big" onclick="doPayroll()">Exportieren</button>`);
  currentTopic = 'payroll';   // Firmen-Updates sollen dieses Fenster nicht durch die Team-Ansicht ersetzen
}
function openPaySettings() {
  const cfg = payCfg(), act = teamPeople();
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="openPayroll()">‹ Lohn-Export</button><button class="pill sm green" onclick="savePaySettings()">Speichern</button></div>
  <h2>Schnittstelle</h2>
  <div class="group">
    <label class="row"><span>Lohnsoftware</span><select id="ssoft">${Object.entries(PAY_SOFT).map(([v, x]) => `<option value="${v}" ${cfg.soft === v ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
    <label class="row"><span>Export fällig</span><select id="sday"><option value="last" ${cfg.day === 'last' ? 'selected' : ''}>Am letzten Tag des Monats</option>${Array.from({ length: 28 }, (_, i) => i + 1).map(d => `<option value="${d}" ${+cfg.day === d ? 'selected' : ''}>Am ${d}. des Folgemonats</option>`).join('')}</select></label>
    <label class="row"><span>Inhalt</span><select id="scontent"><option value="sum" ${cfg.content === 'sum' ? 'selected' : ''}>Monatssummen je Lohnart</option><option value="days" ${cfg.content === 'days' ? 'selected' : ''}>Jeden Arbeitstag einzeln</option></select></label>
  </div>
  <p class="hint">Am Stichtag erinnert dich die App im Team-Bereich und beim Öffnen. Später kann die Datei auch automatisch per E-Mail kommen.</p>
  <div class="label">Lohnarten</div>
  <div class="group">${PAY_LA.map(([k, n, u, ex]) => `<label class="row"><span>${n} <span class="muted small">(${u})</span></span><input class="short" id="sla_${k}" inputmode="numeric" placeholder="z. B. ${ex}" value="${esc(cfg.la[k] || '')}"></label>`).join('')}</div>
  <p class="hint">Die Nummern stehen in deiner Lohnsoftware bei den Lohnarten. Leer = diese Zeile wird nicht exportiert.</p>
  <div class="label">Personalnummern</div>
  ${act.length ? `<div class="group">${act.map(m => `<label class="row"><span>${esc(m.name)}</span><input class="short spnr" data-uid="${m.uid}" inputmode="numeric" placeholder="Nr." value="${esc(cfg.pnr[m.uid] || '')}"></label>`).join('')}</div>` : '<p class="muted center">Noch keine Mitarbeiter.</p>'}
  <p class="hint">So findet die Lohnsoftware den richtigen Mitarbeiter. Die Nummer steht in der Lohnsoftware beim Mitarbeiter.</p>`);
  currentTopic = 'payroll';
}
async function savePaySettings() {
  const cfg = payCfg();
  const payroll = { soft: $('#ssoft').value, day: $('#sday').value, content: $('#scontent').value, last: cfg.last || '',
    la: Object.fromEntries(PAY_LA.map(([k]) => [k, $('#sla_' + k).value.trim()])),
    pnr: { ...cfg.pnr, ...Object.fromEntries([...document.querySelectorAll('.spnr')].map(e => [e.dataset.uid, e.value.trim()])) } };
  try { await saveAdmin({ payroll }); openPayroll(); } catch (e) { cloudError(e); }
}
// Windows-Zeichensatz (für Lexware/DATEV, die Umlaute sonst falsch anzeigen)
function cp1252(str) {
  const map = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94 };
  return Uint8Array.from([...str].map(ch => { const c = ch.charCodeAt(0); return c < 256 ? c : map[ch] ?? 63; }));
}
async function doPayroll() {
  const cfg = payCfg(), soft = $('#psoft').value, content = $('#pcontent').value;
  let from = $('#pfrom').value, to = $('#pto').value, mk = $('#pmonth').value;
  if (from || to) { if (!from || !to || to < from) return alert('Bitte einen gültigen Zeitraum wählen.'); mk = ''; }
  else { if (!mk) return alert('Bitte einen Monat wählen.'); const [y, m] = mk.split('-').map(Number); [from, to] = monthBounds(y, m - 1); }
  const uids = [...document.querySelectorAll('.pmem:checked')].map(c => c.value);
  if (!uids.length) return alert('Bitte mindestens einen Mitarbeiter auswählen.');
  const missing = teamPeople().filter(m => uids.includes(m.uid) && !cfg.pnr[m.uid]);
  if (soft !== 'xlsx' && soft !== 'other' && missing.length && !confirm(`Ohne Personalnummer: ${missing.map(m => m.name).join(', ')}.\nDie Lohnsoftware kann diese Zeilen nicht zuordnen. Trotzdem exportieren?\n(Personalnummern trägst du unter ⚙︎ Schnittstelle ein.)`)) return;
  const fname = `${company.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}_Lohn_${mk || from + '_bis_' + to}`;
  try {
    if (soft === 'xlsx') {
      await doTeamExportRange(from, to, uids, fname);
    } else {
      const dec = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ','), t = today(), stand = to < t ? to : t;
      const q = v => /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
      const rows = content === 'sum'
        ? [['Personalnummer', 'Name', 'Lohnart', 'Bezeichnung', 'Menge', 'Einheit', 'Von', 'Bis']]
        : [['Personalnummer', 'Name', 'Datum', 'Beginn', 'Ende', 'Pause (Std.)', 'Stunden', 'Lohnart', 'Abwesenheit']];
      for (const mem of teamPeople().filter(m => uids.includes(m.uid))) {
        const snap = await ref('data/' + mem.uid).get(); if (!snap.exists) continue;
        const d = merged(snap.data(), null), c = makeCalc(d, Date.now()), days = c.range(from, to), past = days.filter(x => x.d <= stand);
        const pnr = cfg.pnr[mem.uid] || '';
        if (content === 'sum') {
          const val = { work: sum(days, 'net') / HOUR, over: Math.max(0, sum(past, 'diff')) / HOUR, vac: countAbs(days, 'urlaub'), sick: countAbs(days, 'krank') };
          for (const [k, n, u] of PAY_LA) if ((cfg.la[k] || soft === 'other') && val[k]) rows.push([pnr, mem.name, cfg.la[k] || '', n, u === 'Tage' ? String(val[k]) : dec(val[k]), u === 'Tage' ? 'Tage' : 'Stunden', dmy(from), dmy(to)]);
        } else {
          for (const x of days) {
            if (!x.gross && !x.absence) continue;
            const first = x.sess[0], last = x.sess[x.sess.length - 1];
            rows.push([pnr, mem.name, dmy(x.d), first ? tod(first.s) : '', last?.e ? tod(last.e) : '', x.gross ? dec(x.pause / HOUR) : '', x.gross ? dec(x.net / HOUR) : '', x.gross ? cfg.la.work || '' : '', x.absence ? TYPES[x.absence.type] || x.absence.type : (x.holiday || '')]);
          }
        }
      }
      const text = rows.map(r => r.map(v => q(String(v))).join(';')).join('\r\n') + '\r\n';
      const win = PAY_SOFT[soft].enc === 'win';
      await deliver(new Blob([win ? cp1252(text) : '﻿' + text], { type: 'text/csv' }), fname + '.csv');
    }
    if (mk && (!cfg.last || mk > cfg.last)) await saveAdmin({ payroll: { ...cfg, last: mk } });
  } catch (e) { alert('Export fehlgeschlagen: ' + e.message); }
}
async function doTeamExportRange(from, to, uids, fname) {
  const t = today(), stand = to < t ? to : t, cols = DEF_COLS, dec = exportPrefs().dec, cfg = payCfg();
  await loadScript(XLSX_SRC);
  const wb = XLSX.utils.book_new(), over = [['Personalnr.', 'Name', 'Soll', 'Gearbeitet', 'Differenz', `Überstundenkonto (${dmy(stand)})`, 'Urlaubstage', 'Krankheitstage']], sheets = [];
  for (const mem of teamPeople().filter(m => uids.includes(m.uid))) {
    const s = await ref('data/' + mem.uid).get(); if (!s.exists) continue;
    const d = merged(s.data(), null), c = makeCalc(d, Date.now()), days = c.range(from, to), past = days.filter(x => x.d <= stand);
    over.push([cfg.pnr[mem.uid] || '', mem.name, hm(sum(days, 'soll')), hm(sum(days, 'net')), hm(sum(past, 'diff'), true), hm(c.balance(stand), true), countAbs(days, 'urlaub'), countAbs(days, 'krank')]);
    sheets.push([mem.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Mitarbeiter', [cols.map(k => COLS[k]), ...rowsFor(d, from, to, cols, dec)]]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(over), 'Übersicht');
  const used = new Set(['Übersicht']);
  for (let [n, aoa] of sheets) { let k = n, i = 2; while (used.has(k)) k = n.slice(0, 28) + ' ' + i++; used.add(k); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), k); }
  await deliver(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname + '.xlsx');
}

// ---------- urlaubsplaner ----------
let planYear = null;
function openPlanner(y) {
  const t = today(), st = data.settings;
  planYear = y || planYear || +t.slice(0, 4);
  const c = calc(), from = String(planYear) === t.slice(0, 4) ? addDays(t, 1) : planYear + '-01-01', to = planYear + '-12-31';
  const used = countAbs(c.range(planYear + '-01-01', to), 'urlaub'), rest = Math.max(0, st.vacation - used);
  const ideas = rest ? bridgeIdeas(c, from, to, rest) : [];
  const wd = d => WD[parseYmd(d).getDay()].slice(0, 2) + ' ' + dmy(d).slice(0, 6);
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="openAbsences()">‹ Zurück</button><h2>Urlaubsplaner</h2></div>
  <div class="navrow" style="margin-top:12px"><button class="pill sm" onclick="openPlanner(${planYear - 1})" ${planYear <= +t.slice(0, 4) ? 'disabled style="opacity:.4"' : ''}>‹</button><button class="pill sm">${planYear}</button><button class="pill sm" onclick="openPlanner(${planYear + 1})">›</button></div>
  <div class="ot-grid"><div class="ot"><b>${rest}</b><span>Resturlaub</span></div><div class="ot"><b>${used}</b><span>schon verplant</span></div></div>
  ${!st.state ? '<p class="badge">Tipp: Stell unter Setup dein Bundesland ein, dann werden auch die regionalen Feiertage berücksichtigt.</p>' : ''}
  ${ideas.length ? `<div class="group">${ideas.map(x => `<div class="row"><span><b>${x.need.length} ${x.need.length === 1 ? 'Urlaubstag' : 'Urlaubstage'} → ${x.len} Tage frei</b>
      <div class="muted small">${wd(x.from)} – ${wd(x.to)} · ${esc(x.holiday)}</div><div class="small" style="color:var(--accent)">Urlaub: ${x.need.map(d => dmy(d).slice(0, 6)).join(', ')}</div></span>
      <button class="pill sm green" onclick="takeBridge('${x.need[0]}', '${x.need.at(-1)}', '${esc(x.holiday)}')">Eintragen</button></div>`).join('')}</div>
    <p class="hint">Sortiert nach Datum. Gezeigt werden nur Brücken, bei denen du für jeden Urlaubstag mindestens 2,5 freie Tage bekommst.</p>`
    : `<p class="muted center">${rest ? 'Keine lohnenden Brückentage mehr in diesem Jahr.' : 'Dein Urlaub für dieses Jahr ist schon verplant.'}</p>`}`);
}
function takeBridge(from, to, hol) {
  data.absences.push({ id: Date.now().toString(36), type: 'urlaub', from, to, hours: 0, comment: 'Brückentag ' + hol });
  save(); render(); openPlanner();
}

// ---------- schulferien ----------
const ferienCache = {};
async function loadFerien(state, y) {
  const k = state + y;
  if (ferienCache[k]) return ferienCache[k];
  try { const c = JSON.parse(localStorage.getItem('ferien-' + k)); if (c && c.t > Date.now() - 30 * 86400000) return ferienCache[k] = c.list; } catch {}
  const r = await fetch(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-${state}&validFrom=${y}-01-01&validTo=${y}-12-31&languageIsoCode=DE`);
  if (!r.ok) throw new Error('Server antwortet nicht (' + r.status + ')');
  const list = (await r.json()).map(h => ({ name: (h.name.find(n => n.language === 'DE') || h.name[0]).text, from: h.startDate, to: h.endDate }));
  try { localStorage.setItem('ferien-' + k, JSON.stringify({ t: Date.now(), list })); } catch {}
  return ferienCache[k] = list;
}
let ferienYear = null;
async function openFerien(y) {
  const st = data.settings, t = today();
  ferienYear = y || ferienYear || +t.slice(0, 4);
  const head = `<div class="sheet-head"><button class="pill sm" onclick="openAbsences()">‹ Zurück</button><h2>Schulferien</h2></div>
  <div class="navrow" style="margin-top:12px"><button class="pill sm" onclick="openFerien(${ferienYear - 1})">‹</button><button class="pill sm">${ferienYear}${st.state ? ' · ' + STATES[st.state] : ''}</button><button class="pill sm" onclick="openFerien(${ferienYear + 1})">›</button></div>`;
  if (!st.state) return sheet(head + '<p class="muted center">Stell zuerst unter Setup dein Bundesland ein.</p>');
  sheet(head + '<p class="muted center">Lädt …</p>');
  try {
    const list = await loadFerien(st.state, ferienYear), c = calc();
    const taken = f => data.absences.some(a => a.from === f.from && a.to === f.to);
    sheet(head + `<div class="group">${list.map((f, i) => `<div class="row"><span><b>${esc(f.name)}</b><div class="muted small">${dmy(f.from)}${f.to !== f.from ? ' – ' + dmy(f.to) : ''} · ${workdays(c, f.from, f.to)} ${workdays(c, f.from, f.to) === 1 ? 'Arbeitstag' : 'Arbeitstage'}</div></span>
      ${taken(f) ? '<span class="muted small">eingetragen</span>' : `<button class="pill sm" onclick="takeFerien(${i})">Übernehmen</button>`}</div>`).join('')}</div>
      <p class="hint">„Übernehmen“ trägt die Ferien als Urlaub ein, das kostet Urlaubstage. Den Typ kannst du danach in den Abwesenheiten ändern, indem du löschst und neu anlegst. Quelle: OpenHolidays.</p>`);
  } catch (e) { sheet(head + `<p class="muted center">Schulferien konnten nicht geladen werden: ${esc(e.message)}</p>`); }
}
function takeFerien(i) {
  const f = ferienCache[data.settings.state + ferienYear][i];
  if (!confirm(`${f.name} (${dmy(f.from)} – ${dmy(f.to)}) als Urlaub eintragen? Das sind ${workdays(calc(), f.from, f.to)} Urlaubstage.`)) return;
  data.absences.push({ id: Date.now().toString(36), type: 'urlaub', from: f.from, to: f.to, hours: 0, comment: f.name });
  save(); render(); openFerien();
}

// ---------- Standort: Orte mit automatischem Start/Stopp ----------
// Hinweis: Eine Web-App bekommt den Standort nur, solange sie geöffnet ist. Geprüft wird beim Öffnen,
// beim Zurückkehren in die App und alle 2 Minuten, solange sie offen ist. Die Koordinaten sind privat.
const LOC_R = [75, 100, 150, 250, 500];
const locNew = () => ({ id: Date.now().toString(36), name: '', lat: null, lng: null, r: 150, color: '#0083ff', def: false, arch: false, minLen: 0,
  enter: { act: 'start', off: false, shift: 0 }, leave: { act: 'stop', off: false, shift: 0 }, from: '00:00', to: '23:59' });
let locDraft = null;
function locListHtml() {
  const L = data.settings.locs || [];
  return `${L.length ? `<div class="group">${L.map((l, i) => `<button class="row" onclick="locForm(${i})">
      <span style="display:flex;align-items:center;gap:12px"><span class="locdot" style="background:${esc(l.color)}"></span>
      <span>${esc(l.name || 'Ohne Namen')}${l.def ? ' <span class="muted small">· Standard</span>' : ''}<div class="muted small">${l.arch ? 'Archiviert' : l.lat == null ? 'Kein Ort gewählt' : locSummary(l)}</div></span></span>
      <span class="muted">›</span></button>`).join('')}</div>` : ''}
    <button class="pill wide" onclick="locForm()">+ Ort hinzufügen</button>
    <p class="hint">Kommst du an einem Ort an, kann die Zeiterfassung automatisch starten, beim Verlassen stoppt sie. Wichtig: Als Web-App sieht die Stempeluhr deinen Standort nur, solange sie geöffnet ist. Öffne die App also kurz, wenn du ankommst oder gehst. Mit dem Zeitversatz kannst du die Zeit dann passend vor- oder zurückstellen. Deine Orte sieht nur du.</p>`;
}
function locSummary(l) {
  const a = { start: 'startet', none: '' }[l.enter.act], b = { stop: 'stoppt', none: '' }[l.leave.act];
  return `${l.r} m Umkreis${a || b ? ' · ' + [a && 'Ankommen ' + a, b && 'Gehen ' + b].filter(Boolean).join(', ') : ''}`;
}
function locForm(i, keep) {
  const l = keep ? locDraft : (locDraft = JSON.parse(JSON.stringify(i == null ? locNew() : data.settings.locs[i])));
  if (!keep) l._i = i ?? -1;
  i = l._i < 0 ? null : l._i;
  const sw = (id, on) => `<input id="${id}" type="checkbox" switch ${on ? 'checked' : ''}>`;
  const act = (k, opts) => `<select id="l${k}act">${Object.entries(opts).map(([v, t]) => `<option value="${v}" ${l[k].act === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="backToTopic()">‹ Standort</button><button class="pill sm green" onclick="locSave()">Speichern</button></div>
  <h2>${i == null ? 'Neuer Ort' : 'Ort bearbeiten'}</h2>
  <div class="label">Name des Ortes</div>
  <div class="group"><label class="row"><input id="lname" style="max-width:none;flex:1" value="${esc(l.name)}" placeholder="z. B. Büro"></label></div>
  <div class="label">Ort</div>
  <div class="group"><button class="row" onclick="locPick()"><span id="lpos" class="${l.lat == null ? 'muted' : ''}" style="text-align:left">${l.lat == null ? 'Wähle einen Ort' : locPosText(l) + `<div class="muted small">Umkreis ${l.r} m</div>`}</span><span class="muted">›</span></button></div>
  <div class="group"><label class="row"><span>Farbe</span><input id="lcolor" type="color" value="${esc(l.color)}" class="colorpick"></label></div>
  <div class="label">Standardort</div>
  <div class="group"><label class="row"><span>Als Standardort verwenden</span>${sw('ldef', l.def)}</label></div>
  <p class="hint">Zeiten, die du von Hand startest, werden diesem Ort zugeordnet.</p>
  <div class="label">Archiviert</div>
  <div class="group"><label class="row"><span>Ist archiviert</span>${sw('larch', l.arch)}</label></div>
  <div class="label">Minimale Timerlänge</div>
  <div class="group"><label class="row"><span>Timerlänge in Minuten</span><input id="lmin" class="short" type="number" inputmode="numeric" min="0" placeholder="0" value="${l.minLen || ''}"></label></div>
  <p class="hint">Bei z. B. 5 werden automatische Zeiteinträge, die kürzer als 5 Minuten sind, gelöscht.</p>
  <div class="label">Aktion beim Ankommen</div>
  <div class="group">
    <label class="row"><span>Aktion</span>${act('enter', { start: 'Zeiteintrag starten', none: 'Nichts tun' })}</label>
    <label class="row"><span>Auch an arbeitsfreien Tagen</span>${sw('lenteroff', l.enter.off)}</label>
    <label class="row"><span>Zeitversatz in Minuten</span><input id="lentershift" class="short" inputmode="numeric" placeholder="0" value="${l.enter.shift || ''}"></label>
  </div>
  <p class="hint">Bei 5 wird die Zeit um fünf Minuten nach vorne gesetzt, bei -5 um fünf Minuten zurück. Praktisch, wenn du die App erst etwas später öffnest.</p>
  <div class="label">Aktion beim Verlassen</div>
  <div class="group">
    <label class="row"><span>Aktion</span>${act('leave', { stop: 'Zeiteintrag stoppen', none: 'Nichts tun' })}</label>
    <label class="row"><span>Auch an arbeitsfreien Tagen</span>${sw('lleaveoff', l.leave.off)}</label>
    <label class="row"><span>Zeitversatz in Minuten</span><input id="lleaveshift" class="short" inputmode="numeric" placeholder="0" value="${l.leave.shift || ''}"></label>
  </div>
  <p class="hint">Bei -10 wird als Ende zehn Minuten vor dem Moment eingetragen, in dem die App merkt, dass du weg bist.</p>
  <div class="label">Erlaubter Zeitraum</div>
  <div class="group">
    <label class="row"><span>Prüft ab Uhrzeit</span><input id="lfrom" type="time" value="${l.from}"></label>
    <label class="row"><span>Prüft bis Uhrzeit</span><input id="lto" type="time" value="${l.to}"></label>
  </div>
  <p class="hint">Beide Aktionen werden nur ausgeführt, wenn die Zeit in diesem Zeitraum liegt.</p>
  ${i == null ? '' : `<button class="big redbtn" onclick="locDel(${i})">Löschen</button>`}`);
}
function locPosText(l) { return l.lat == null ? 'Noch kein Ort gewählt' : esc(l.addr || `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`); }
// Formularwerte in den Entwurf übernehmen (vor dem Wechsel in die Ortswahl und beim Speichern)
function locCollect() {
  const l = locDraft;
  Object.assign(l, { name: $('#lname').value.trim(), color: $('#lcolor').value, def: $('#ldef').checked, arch: $('#larch').checked,
    minLen: Math.max(0, Math.round(num($('#lmin').value))), from: $('#lfrom').value || '00:00', to: $('#lto').value || '23:59' });
  l.enter = { act: $('#lenteract').value, off: $('#lenteroff').checked, shift: Math.round(num($('#lentershift').value)) };
  l.leave = { act: $('#lleaveact').value, off: $('#lleaveoff').checked, shift: Math.round(num($('#lleaveshift').value)) };
}
function locSave() {
  const l = locDraft, i = l._i;
  locCollect();
  if (!l.name) return alert('Bitte einen Namen für den Ort eintragen.');
  if (l.lat == null) return alert('Bitte den Ort festlegen: aktuellen Standort übernehmen oder Adresse suchen.');
  delete l._i;
  const L = data.settings.locs ||= [];
  if (l.def) L.forEach(x => { x.def = false; });
  if (i < 0) L.push(l); else L[i] = l;
  save(); locDraft = null; backToTopic();
  if (l.enter.act !== 'none' || l.leave.act !== 'none') locAsk(() => locCheck(true));
}
function locDel(i) {
  if (!confirm('Diesen Ort löschen?')) return;
  data.settings.locs.splice(i, 1); save(); backToTopic();
}

// ----- Erlaubnis für den Standort -----
// Erst unsere Erklärung, dann fragt das iPhone selbst („… möchte deinen Standort verwenden“).
async function locPerm() { try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch (e) { return 'unknown'; } }
async function locAsk(then) {
  if (!navigator.geolocation) return alert('Dein Gerät gibt keinen Standort heraus.');
  const st = await locPerm();
  if (st === 'granted') return then();
  document.querySelector('.ask')?.remove();
  const d = document.createElement('div'); d.className = 'ask';
  d.innerHTML = st === 'denied'
    ? `<div class="askcard"><div class="askicon">📍</div><h3>Standort ist gesperrt</h3>
       <p>Du hast der Stempeluhr den Standort nicht erlaubt. So schaltest du ihn frei:<br><b>Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden der App“</b><br>Danach die App einmal schließen und neu öffnen.</p>
       <button class="pill wide" onclick="this.closest('.ask').remove()">Verstanden</button></div>`
    : `<div class="askcard"><div class="askicon">📍</div><h3>Darf die Stempeluhr deinen Standort verwenden?</h3>
       <p>Damit kann die Zeiterfassung starten, wenn du an deinem Arbeitsort ankommst, und stoppen, wenn du gehst. Dein Standort wird nur auf deinem Handy geprüft und nicht gespeichert, nur der Ort, den du festlegst.</p>
       <p class="muted small">Gleich fragt dein iPhone nach. Wähle dort „Erlauben“ bzw. „Beim Verwenden der App erlauben“.</p>
       <button class="big" id="askok">Weiter</button>
       <button class="pill wide" onclick="this.closest('.ask').remove()">Nicht jetzt</button></div>`;
  document.body.appendChild(d);
  const ok = d.querySelector('#askok');
  if (ok) ok.onclick = () => { d.remove(); then(); };
}
function locHere(cb) {
  locAsk(() => {
    toast('📍 Standort wird ermittelt …');
    navigator.geolocation.getCurrentPosition(p => cb(p.coords),
      e => e.code === 1 ? locAsk(() => {}) : alert('Standort nicht gefunden. Bitte nochmal versuchen, am besten draußen oder mit WLAN an.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

// ----- „Wähle einen Ort“: Suche, aktueller Standort, Karte mit Umkreis -----
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
let locMap = null, locSat = true;
function locPick() { locCollect(); locPickView(); }
function locPickView(results) {
  const l = locDraft, has = l.lat != null;
  if (locMap) { locMap.remove(); locMap = null; }
  sheet(`<div class="sheet-head"><button class="pill sm backbtn" onclick="locPickBack()" aria-label="Zurück">‹</button><h2 class="pick-title">Wähle einen Ort</h2>
      ${has ? `<span style="display:flex;gap:8px"><button class="pill sm red" onclick="locPickClear()" aria-label="Ort entfernen">🗑</button><button class="pill sm green" onclick="locPickSave()">Speichern</button></span>` : '<span></span>'}</div>
    <div class="locsearch"><input id="lq" placeholder="Suche einen Ort" enterkeyhint="search" onkeydown="event.key === 'Enter' && locFind()"><button class="pill sm sel" onclick="locFind()">Suche</button></div>
    <div id="lres">${(results || []).map((h, i) => `<button class="row card locres" onclick="locChoose(${i})"><span class="locpin">📍</span><span class="tt"><b>${esc(h.title)}</b><span class="muted small">${esc(h.sub)}</span></span></button>`).join('')}</div>
    ${has ? `<div class="mapwrap"><div id="lmap"></div><div class="mappin"></div></div>
      <div class="radrow"><input type="range" id="lrad" min="50" max="1000" step="25" value="${l.r}" oninput="locRadius(+this.value)"><span id="lradt">Radius ${l.r} m</span>
      <button class="pill sm" onclick="locLayer()" aria-label="Kartenart">🗺</button></div>
      <p class="hint">Verschiebe die Karte, bis der Punkt auf deinem Arbeitsort liegt. Der Kreis zeigt, ab wann du als „angekommen“ giltst.</p>`
    : `<button class="big locnow" onclick="locHere(c => { locDraft.lat = c.latitude; locDraft.lng = c.longitude; locDraft.addr = ''; locPickView(); })">Aktueller Standort</button>`}`);
  locPickResults = results || [];
  if (has) locMapInit();
}
let locPickResults = [];
async function locFind() {
  const q = $('#lq').value.trim(); if (!q) return;
  $('#lres').innerHTML = '<p class="hint center">Suche …</p>';
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=de,at,ch&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'de' } });
    const hits = (await r.json()).map(h => {
      const a = h.address || {}, street = [a.road || a.pedestrian || a.hamlet, a.house_number].filter(Boolean).join(' ');
      return { lat: +h.lat, lng: +h.lon, title: street || h.name || h.display_name.split(',')[0], sub: [a.postcode, a.village || a.town || a.city || a.municipality].filter(Boolean).join(' ') || h.display_name.split(',').slice(1, 3).join(',') };
    });
    if (!hits.length) { $('#lres').innerHTML = '<p class="hint center">Nichts gefunden. Versuch es mit Straße, Hausnummer und Ort.</p>'; return; }
    const keep = $('#lq').value; locPickView(hits); $('#lq').value = keep;
  } catch (e) { $('#lres').innerHTML = '<p class="hint center">Suche fehlgeschlagen (Internet?).</p>'; }
}
function locChoose(i) { const h = locPickResults[i]; Object.assign(locDraft, { lat: h.lat, lng: h.lng, addr: [h.title, h.sub].filter(Boolean).join(', ') }); locPickView(); }
function locPickClear() { Object.assign(locDraft, { lat: null, lng: null, addr: '' }); locPickView(); }
function locPickBack() { if (locMap) { locMap.remove(); locMap = null; } locForm(null, true); }
function locPickSave() {
  if (locMap) { const c = locMap.getCenter(), moved = distM(c.lat, c.lng, locDraft.lat, locDraft.lng) > 5; locDraft.lat = c.lat; locDraft.lng = c.lng; if (moved) locDraft.addr = ''; }
  locPickBack();
}
async function locMapInit() {
  try {
    if (!window.L) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.appendChild(css);
      await loadScript(LEAFLET + 'leaflet.min.js');
    }
  } catch (e) { $('#lmap').innerHTML = '<p class="hint center" style="padding-top:40%">Karte konnte nicht geladen werden (Internet?).</p>'; return; }
  const el = $('#lmap'); if (!el) return;
  const l = locDraft, c = [l.lat, l.lng];
  locMap = L.map(el, { zoomControl: false, attributionControl: true }).setView(c, 17);
  locMap._tiles = locTiles().addTo(locMap);
  locMap._circle = L.circle(c, { radius: l.r, color: '#8cc63f', weight: 2, fillColor: '#8cc63f', fillOpacity: 0.35, interactive: false }).addTo(locMap);
  locMap.on('move', () => locMap._circle.setLatLng(locMap.getCenter()));
  locMap.fitBounds(locMap._circle.getBounds(), { padding: [30, 30] });
}
function locTiles() {
  return locSat
    ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar' })
    : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
}
function locLayer() { if (!locMap) return; locSat = !locSat; locMap.removeLayer(locMap._tiles); locMap._tiles = locTiles().addTo(locMap); }
function locRadius(r) {
  locDraft.r = r; $('#lradt').textContent = `Radius ${r} m`;
  if (locMap) { locMap._circle.setRadius(r); }
}

// Automatik
const locStateKey = () => 'stempeluhr-locstate-' + (me?.uid || '');
function locState() { try { return JSON.parse(localStorage.getItem(locStateKey())) || {}; } catch (e) { return {}; } }
function locStateSave(s) { try { localStorage.setItem(locStateKey(), JSON.stringify(s)); } catch (e) { } }
const locActive = () => (data.settings.locs || []).filter(l => !l.arch && l.lat != null && (l.enter.act !== 'none' || l.leave.act !== 'none'));
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
let locBusy = false;
async function locCheck(force) {
  if (locBusy || !me || viewing || ADMIN_APP || document.hidden || !own.ready || !navigator.geolocation || !locActive().length) return;
  if (!force && (await locPerm()) === 'prompt') return;   // ohne Erlaubnis nicht ungefragt nachfragen
  locBusy = true;
  navigator.geolocation.getCurrentPosition(p => { locBusy = false; locApply(p.coords); }, () => { locBusy = false; },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: force ? 0 : 60000 });
}
function locApply(c) {
  if (c.accuracy > 300) return;   // zu ungenau, lieber nichts tun
  const st = locState();
  for (const l of locActive()) {
    const inside = distM(c.latitude, c.longitude, l.lat, l.lng) <= l.r + Math.min(c.accuracy, 50);
    const prev = st[l.id];
    st[l.id] = inside;
    if (inside && prev !== true) locEvent(l, 'enter');
    else if (!inside && prev === true) locEvent(l, 'leave');
  }
  locStateSave(st);
}
function locEvent(l, kind) {
  const a = l[kind]; if (!a || a.act === 'none') return;
  const now = new Date(), hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const inWindow = l.from <= l.to ? hhmm >= l.from && hhmm <= l.to : hhmm >= l.from || hhmm <= l.to;
  if (!inWindow) return;
  const d = calc().day(today());
  if (!a.off && (!d.workday || (d.absence && d.absence.type !== 'reduzierung'))) return;
  const t = Date.now() + (a.shift || 0) * MIN, run = data.sessions.find(x => x.e == null);
  if (kind === 'enter' && a.act === 'start') {
    if (run) return;
    data.sessions.push({ s: Math.min(t, Date.now()), e: null, loc: l.id, auto: 1 });
    save(); render(); toast(`📍 ${l.name}: Zeiterfassung gestartet${a.shift ? ` (${a.shift > 0 ? '+' : ''}${a.shift} Min.)` : ''}`);
  }
  if (kind === 'leave' && a.act === 'stop') {
    if (!run) return;
    run.e = Math.max(run.s, Math.min(t, Date.now() + 0));
    if (l.minLen && run.auto && run.e - run.s < l.minLen * MIN) {
      data.sessions.splice(data.sessions.indexOf(run), 1);
      save(); render(); toast(`📍 ${l.name}: Eintrag unter ${l.minLen} Min. verworfen`);
    } else { save(); render(); toast(`📍 ${l.name}: Zeiterfassung gestoppt`); }
  }
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(locCheck, 800); });
setInterval(locCheck, 120000);

// ---------- Feedback (Lampe über der Menüleiste) ----------
// Jeder Nutzer hat einen Chat mit dem Entwickler: feedback/{uid} (Übersicht) und feedback/{uid}/msgs (Nachrichten).
// Der Entwickler sieht alle Chats im Admin-Bereich und kann antworten.
const FB_TYPES = { idee: ['💡', 'Idee'], fehler: ['🐞', 'Fehler'], beschwerde: ['😕', 'Beschwerde'], frage: ['❓', 'Frage'] };
let fbUnsub = null, fbThread = null, fbMsgs = [], fbType = 'idee', fbMeta = null, fbMetaUnsub = null;
// Rote Markierung an der Lampe, wenn eine Antwort ungelesen ist
function feedbackWatch() {
  fbMetaUnsub?.(); fbMetaUnsub = null; fbMeta = null;
  if (!me) return feedbackBadge();
  fbMetaUnsub = ref('feedback/' + me.uid).onSnapshot(s => { fbMeta = s.exists ? s.data() : null; feedbackBadge(); }, () => {});
}
function feedbackBadge() { const b = $('#fbbtn'); if (b) b.classList.toggle('unread', !!fbMeta?.unreadUser); }
function openFeedback(uid) {   // uid gesetzt = Entwickler öffnet den Chat eines Nutzers
  const admin = !!uid && isAdmin();
  fbThread = uid || me.uid;
  fbUnsub?.();
  fbMsgs = [];
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="closeFeedback(${admin})">${admin ? '‹ Feedback' : 'Schließen'}</button><h2 class="pick-title">${admin ? esc(fbAdminName(uid)) : 'Feedback'}</h2><span style="width:60px"></span></div>
    <div class="chat" id="chat"><p class="hint center">Lädt …</p></div>
    ${admin ? '' : `<div class="fbtypes">${Object.entries(FB_TYPES).map(([k, [i, l]]) => `<button class="pill sm ${fbType === k ? 'sel' : ''}" data-t="${k}" onclick="fbSetType('${k}')">${i} ${l}</button>`).join('')}</div>`}
    <div class="chatbar"><textarea id="fbtext" rows="1" placeholder="${admin ? 'Antwort schreiben …' : 'Was können wir besser machen?'}" oninput="this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,140)+'px'"></textarea>
      <button class="sendbtn" onclick="sendFeedback(${admin})" aria-label="Senden"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`);
  $('#sheet').classList.add('chatsheet');
  fbUnsub = fb.db.collection(`feedback/${fbThread}/msgs`).orderBy('at').onSnapshot(q => {
    fbMsgs = q.docs.map(d => ({ id: d.id, ...d.data() }));
    fbRender(admin);
    // gelesen markieren
    const field = admin ? 'unreadAdmin' : 'unreadUser';
    if (fbMsgs.length) ref('feedback/' + fbThread).set({ [field]: false }, { merge: true }).catch(() => {});
  }, e => { $('#chat').innerHTML = `<p class="hint center red">Feedback konnte nicht geladen werden: ${esc(e.message)}</p>`; });
}
function fbRender(admin) {
  const el = $('#chat'); if (!el) return;
  const mine = m => admin ? m.from === 'admin' : m.from === 'user';
  el.innerHTML = (fbMsgs.length ? '' : `<div class="bubble them"><b>Hallo${admin ? '' : ' ' + esc((displayName() || '').split(' ')[0])}!</b> 👋<br>Hast du eine Idee für eine neue Funktion, stört dich etwas oder ist ein Fehler aufgetreten? Schreib es einfach hier rein. Wir lesen alles und antworten hier im Chat.</div>`)
    + fbMsgs.map(m => `<div class="bubble ${mine(m) ? 'me' : 'them'}">${m.type && FB_TYPES[m.type] ? `<span class="fbtag">${FB_TYPES[m.type].join(' ')}</span>` : ''}${esc(m.text).replace(/\n/g, '<br>')}
      <span class="btime">${m.from === 'admin' && !admin ? 'Entwickler · ' : ''}${m.at?.toDate ? m.at.toDate().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'jetzt'}</span></div>`).join('');
  el.scrollTop = el.scrollHeight;
}
function fbSetType(k) { fbType = k; document.querySelectorAll('.fbtypes .pill').forEach(b => b.classList.toggle('sel', b.dataset.t === k)); }
async function sendFeedback(admin) {
  const ta = $('#fbtext'), text = ta.value.trim();
  if (!text) return;
  if (text.length > 4000) return alert('Bitte etwas kürzer fassen (max. 4000 Zeichen).');
  ta.value = ''; ta.style.height = 'auto';
  const at = firebase.firestore.FieldValue.serverTimestamp();
  try {
    if (admin) {
      await fb.db.collection(`feedback/${fbThread}/msgs`).add({ text, from: 'admin', at });
      await ref('feedback/' + fbThread).set({ last: at, lastText: text.slice(0, 120), unreadUser: true, unreadAdmin: false }, { merge: true });
    } else {
      await fb.db.collection(`feedback/${me.uid}/msgs`).add({ text, from: 'user', type: fbType, at, name: displayName() || '', ver: document.querySelector('script[src*="app.js"]')?.src.split('v=')[1] || '', device: navigator.userAgent.slice(0, 160) });
      await ref('feedback/' + me.uid).set({ name: displayName() || '', email: me.email || '', company: company?.name || '', last: at, lastText: text.slice(0, 120), lastType: fbType, unreadAdmin: true, unreadUser: false }, { merge: true });
    }
  } catch (e) { ta.value = text; alert('Senden fehlgeschlagen: ' + e.message); }
}
function closeFeedback(admin) {
  fbUnsub?.(); fbUnsub = null;
  if (admin) { closeSheet(); render(); loadFeedbackAdmin(); } else closeSheet();
}
// Admin: Liste aller Chats
let fbAdmin = null;
const fbAdminName = uid => fbAdmin?.find(t => t.uid === uid)?.name || 'Nutzer';
async function loadFeedbackAdmin() {
  try {
    const q = await fb.db.collection('feedback').orderBy('last', 'desc').limit(200).get();
    fbAdmin = q.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) { fbAdmin = []; }
  if (tab === 'admin' && $('#fblist')) $('#fblist').innerHTML = feedbackAdminHtml();
}
function feedbackAdminHtml() {
  if (!fbAdmin) return '<p class="muted center">Lädt …</p>';
  if (!fbAdmin.length) return '<p class="muted center">Noch kein Feedback.</p>';
  return `<div class="group">${fbAdmin.map(t => `<button class="row" onclick="openFeedback('${t.uid}')">
    <span style="text-align:left;min-width:0">${t.unreadAdmin ? '<span class="dotnew"></span>' : ''}<b>${esc(t.name || t.email || 'Nutzer')}</b>${t.company ? ` <span class="muted small">· ${esc(t.company)}</span>` : ''}
      <div class="muted small fbprev">${t.lastType && FB_TYPES[t.lastType] ? FB_TYPES[t.lastType][0] + ' ' : ''}${esc(t.lastText || '')}</div></span>
    <span class="muted small">${t.last?.toDate ? t.last.toDate().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''} ›</span></button>`).join('')}</div>`;
}
