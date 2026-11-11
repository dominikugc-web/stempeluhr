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
};
function myTheme() { return (viewing ? own.priv?.settings?.theme : data.settings.theme) || {}; }
function applyTheme() {
  const t = myTheme(), r = document.documentElement.style, bg = BGS[t.bg] || BGS.kaffee;
  for (const k in COLOR_DEF) r.setProperty('--' + k, t[k] || COLOR_DEF[k]);
  r.setProperty('--bg', bg[1]);
  r.setProperty('--bgimg', bg[2]);
  $('meta[name=theme-color]').content = bg[1];
}
const progColor = p => p >= 110 ? 'var(--over)' : p >= 100 ? 'var(--ok)' : p >= 80 ? 'var(--near)' : 'var(--minus)';

function openTheme() {
  const t = data.settings.theme || {};
  sheet(`<div class="sheet-head"><h2>Farben</h2><button class="pill sm" onclick="closeSheet(); render()">Fertig</button></div>
  <div class="label">Hintergrund</div>
  <div class="swatches">${Object.entries(BGS).map(([k, b]) => `<button class="swatch ${(t.bg || 'kaffee') === k ? 'on' : ''}" onclick="setTheme('bg', '${k}')" style="background:${b[2] === 'none' ? '' : b[2] + ','}${b[1]}"><span>${b[0]}</span></button>`).join('')}</div>
  <div class="label">Farben</div>
  <div class="scale"><div style="background:linear-gradient(90deg,var(--minus) 0 60%,var(--near) 66% 84%,var(--ok) 88% 92%,var(--over) 96%)"></div><span>0 %</span><span>80 %</span><span>100 %</span><span>110 %</span></div>
  <div class="group">${Object.entries(COLOR_LABEL).map(([k, l]) => `<label class="row"><span>${l}</span><input type="color" value="${t[k] || COLOR_DEF[k]}" oninput="setTheme('${k}', this.value)"></label>`).join('')}</div>
  <button class="pill wide" onclick="setTheme(); openTheme()">Standard wiederherstellen</button>`);
}
function setTheme(k, v) {
  data.settings.theme = k ? { ...data.settings.theme, [k]: v } : {};
  applyTheme();
  if (k === 'bg') { document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.getAttribute('onclick').includes(`'${v}'`))); }
  clearTimeout(setTheme.t); setTheme.t = setTimeout(save, 400);
}

// ---------- tipps ----------
const TIPS = [
  ['Tag nachtragen', 'In Woche oder Monat auf einen Tag tippen, dann kannst du Zeiten ergänzen oder korrigieren.'],
  ['Überstunden verstehen', 'Tippe in der Übersicht auf dein Überstundenkonto. Du siehst Tag für Tag, wie es zustande kommt.'],
  ['Brückentage finden', 'Unter Abwesenheiten → Urlaubsplaner findest du die besten Brückentage für deinen Resturlaub.'],
  ['Export für den Geschäftsführer', 'Unter Statistik → Exportieren bekommst du Excel, CSV oder eine Kalenderdatei.'],
  ['Farben anpassen', 'Unter Setup → Farben wählst du Hintergrund und Farben für Minus, Ziel und Überstunden.'],
  ['Wie funktioniert was?', 'Unter Setup → Tutorial erklärt dir die App Schritt für Schritt alle Funktionen.'],
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
  if (!ADMIN_APP && !viewing && me && data.settings.onboarded === false && $('#sheet').hidden) onboard(onboardStep);
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
      <p class="hint">Das kannst du später unter Setup → Firma ändern.</p>`,
    () => `<h2>Wo arbeitest du?</h2>
      <div class="group">
        <label class="row"><span>Bundesland</span><select id="ob-state"><option value="">Nur bundesweite Feiertage</option>${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${st.state === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="row"><span>Pause pro Tag (Min.)</span><input id="ob-pause" type="number" inputmode="numeric" min="0" value="${st.pause}"></label>
      </div><p class="hint">Das Bundesland bestimmt die Feiertage und Schulferien. Die Pause wird an jedem Arbeitstag pauschal abgezogen.</p>${next()}`,
    () => `<h2>${onboardRole === 'boss' ? 'Deine eigene Sollzeit' : 'Deine Sollzeit'}</h2>
      <p class="muted">An welchen Tagen arbeitest du und wie lange?</p>
      <div class="group">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label class="row"><span>${WD[i]}</span><input type="number" class="ob-soll" data-i="${i}" inputmode="decimal" step="0.25" min="0" max="24" value="${st.soll[i]}"></label>`).join('')}</div>
      <p class="hint">Stunden pro Tag, 0 = frei. Wechselnde Zeiten (z. B. Teilzeit ab einem Datum) stellst du später unter Setup → Arbeitspläne ein.${onboardRole === 'boss' ? ' Die Sollzeiten deiner Mitarbeiter stellen diese selbst ein, oder du über Team → Mitarbeiter → Setup.' : ''}</p>${next()}`,
    () => `<h2>Überstundenkonto</h2>
      <div class="group">
        <label class="row"><span>Aufzeichnung seit</span><input id="ob-since" type="date" value="${st.since}"></label>
        <label class="row"><span>Startsaldo</span><input id="ob-bal" value="${hm(st.startBalance * MIN, true)}" placeholder="00:00"></label>
      </div><p class="hint">Ab diesem Datum zählen die Sollstunden. Hast du schon Überstunden (z. B. aus einer alten App), trag sie als Startsaldo ein, etwa 12:30 oder -3:15.</p>${next()}`,
    () => `<h2>Fertig! 🎉</h2>
      ${isOwner() ? `<p>Deine Firma <b>${esc(company?.name || '')}</b> ist angelegt. Im Tab <b>Team</b> findest du den Einladungscode für deine Mitarbeiter.</p>`
        : membership?.status === 'pending' ? `<p>Deine Anfrage an <b>${esc(membership.companyName)}</b> ist raus. Sobald dein Geschäftsführer dich freigibt, sieht er deine Zeiten.</p>` : ''}
      <p>Tippe auf <b>Start</b>, wenn du anfängst zu arbeiten.</p>
      <p class="muted">Eine ausführliche Erklärung aller Funktionen findest du jederzeit unter <b>Setup → Tutorial</b>.</p>${next('Auf geht\'s')}`,
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
  if (s >= 4) { onboardDone(); closeSheet(); go(isOwner() ? 'team' : 'start'); return; }
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
  ['☕️', 'Pause', 'Die Pause wird an jedem Tag mit Arbeitszeit <b>pauschal</b> abgezogen (Setup → Pause). Du musst sie also nicht ausstempeln. Arbeitest du kürzer als die Pause, wird nur so viel abgezogen, wie du da warst.'],
  ['🎯', 'Sollzeit & Arbeitspläne', 'Unter Setup legst du fest, wie viele Stunden du an jedem Wochentag arbeiten sollst. Ändert sich das (z. B. Teilzeit ab März), legst du unter <b>Arbeitspläne</b> eine neue Sollzeit ab einem Datum an. Gesetzliche <b>Feiertage</b> deines Bundeslands haben automatisch kein Soll.'],
  ['⚖️', 'Überstundenkonto', 'Jeden Tag wird <b>Netto minus Soll</b> gerechnet und aufaddiert, ab dem Datum „Aufzeichnung seit“. Dazu kommt dein <b>Startsaldo</b> und eventuelle <b>Korrekturen</b>. Tippe in der Übersicht auf das Konto, um die Rechnung Tag für Tag zu sehen. Mit „Auszahlen ab“ wird alles über einer Grenze am Monatsende ausgezahlt.'],
  ['📅', 'Woche & Monat', 'In der Woche siehst du jeden Tag mit Zeiten und Differenz. Der Punkt links zeigt den Status: <span class="green">grün</span> = Soll erreicht, <span class="red">rot</span> = zu wenig, <span style="color:var(--accent)">blau</span> = frei/abwesend. <b>Tippe auf einen Tag</b>, um Zeiten nachzutragen oder zu ändern. Der Monat zeigt Summen, Wochenbalken und den PDF-Export.'],
  ['🏖', 'Abwesenheiten', 'Urlaub, Krank, Kind krank, unbezahlter Urlaub, Feiertag oder Stundenreduzierung trägst du unter <b>Abwesenheiten</b> ein. Diese Tage haben kein Soll (bei Reduzierung weniger). Der <b>Urlaubsplaner</b> sucht dir die besten Brückentage, und die <b>Schulferien</b> deines Bundeslands übernimmst du mit einem Tipp.'],
  ['⏱', 'Runden', 'Rundet dein Arbeitgeber Zeiten, stellst du das unter Setup → Runden ein: auf 5, 10, 15 oder 30 Minuten, kaufmännisch, zugunsten Mitarbeiter (Start ab-, Ende aufrunden) oder zugunsten Arbeitgeber (umgekehrt). Gerundet wird nur in der Rechnung, die echten Stempelzeiten bleiben erhalten.'],
  ['📈', 'Statistik & Export', 'Der Tab <b>Statistik</b> zeigt Stunden, Überstunden, Urlaub und Krankheit für ein Jahr oder einen eigenen Zeitraum, mit Monats- und Wochentagsdiagrammen. Über <b>Exportieren</b> bekommst du Excel, CSV (Felder frei wählbar) oder eine Kalenderdatei für Apple- oder Google-Kalender.'],
  ['💶', 'Verdienst', 'Trag unter Setup deine Jobs, Steuerklasse und Krankenkasse ein. Der Tab <b>Verdienst</b> rechnet dann Brutto, Abzüge und Netto pro Monat aus, inklusive ausgezahlter Überstunden. Diese Daten sieht nur du.'],
  ['👥', 'Firma & Team', 'Ein Geschäftsführer legt unter Setup eine <b>Firma</b> an und teilt den Einladungscode. Mitarbeiter treten bei, der Geschäftsführer gibt sie frei. Im Tab <b>Team</b> sieht der Geschäftsführer, wer gerade eingestempelt ist, Wochenstunden und Überstundenkonten, und kann Zeiten korrigieren oder alle Mitarbeiter als Excel exportieren.'],
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
  sheet(`<div class="sheet-head"><span class="muted small">${tutPage + 1} / ${TUTORIAL.length}</span><button class="pill sm" onclick="closeSheet()">Schließen</button></div>
  <div class="tut-icon">${icon}</div><h2 class="center">${title}</h2><p class="tut-text">${text}</p>
  <div class="dots">${TUTORIAL.map((_, i) => `<span class="${i === tutPage ? 'on' : ''}" onclick="openTutorial(${i})"></span>`).join('')}</div>
  <div class="two"><button class="pill" onclick="openTutorial(${tutPage - 1})" ${tutPage ? '' : 'disabled style="opacity:.4"'}>‹ Zurück</button>
  ${tutPage < TUTORIAL.length - 1 ? `<button class="pill" onclick="openTutorial(${tutPage + 1})">Weiter ›</button>` : '<button class="pill green" onclick="openGlossary()">Begriffe ›</button>'}</div>`);
}
function openGlossary() {
  sheet(`<div class="sheet-head"><h2>Begriffe</h2><button class="pill sm" onclick="closeSheet()">Fertig</button></div>
  <div class="group">${GLOSSARY.map(([t, x]) => `<div class="row"><span><b>${t}</b><div class="muted small">${x}</div></span></div>`).join('')}</div>`);
}

// ---------- arbeitspläne & runden ----------
function planText(p) {
  return `ab ${dmy(p.from)}${p.to ? ' bis ' + dmy(p.to) : ''} · ${p.soll.reduce((a, b) => a + (+b || 0), 0).toLocaleString('de-DE')} Std./Woche`;
}
function planForm(i) {
  const p = i == null ? { name: '', from: today(), to: '', soll: data.settings.soll.slice() } : data.settings.plans[i];
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="closeSheet(); render()">Abbrechen</button><button class="pill sm green" onclick="savePlan(${i ?? -1})">Speichern</button></div>
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
  save(); closeSheet(); render();
}
function delPlan(i) { if (confirm('Arbeitsplan löschen?')) { data.settings.plans.splice(i, 1); save(); closeSheet(); render(); } }
function setRound(k, v) { data.settings.round = { ...data.settings.round, [k]: k === 'step' ? +v : v }; save(); render(); }

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
function setupHelpHtml() {
  if (viewing) return '';
  return `<div class="label">Darstellung</div>
  <div class="group">
    <button class="row" onclick="openTheme()"><span>Farben & Hintergrund</span><span class="muted">›</span></button>
    <label class="row"><span>Tipps auf der Startseite</span><input type="checkbox" ${data.settings.tips !== false ? 'checked' : ''} onchange="setS('tips', this.checked)"></label>
  </div>
  <div class="label">Hilfe</div>
  <div class="group">
    <button class="row" onclick="openTutorial()"><span>Tutorial: So funktioniert die App</span><span class="muted">›</span></button>
    <button class="row" onclick="openGlossary()"><span>Begriffe erklärt</span><span class="muted">›</span></button>
    <button class="row" onclick="onboard(0)"><span>Einführung erneut starten</span><span class="muted">›</span></button>
  </div>`;
}

// ---------- statistik ----------
let statRange = { preset: 'year', from: '', to: '' };
function statBounds() {
  const t = today(), y = +t.slice(0, 4), p = statRange.preset;
  if (p === 'year') return [y + '-01-01', y + '-12-31'];
  if (p === 'last') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
  if (p === '12m') return [addDays(t, -364), t];
  return [statRange.from || y + '-01-01', statRange.to || t];
}
function setStat(p, el) {
  if (p === 'from' || p === 'to') { statRange[p] = el.value; statRange.preset = 'custom'; }
  else { statRange.preset = p; if (p === 'custom' && !statRange.from) [statRange.from, statRange.to] = statBounds(); }
  render();
}
function chart(cols, h = 140) {
  const max = Math.max(HOUR, ...cols.map(c => Math.max(c.v, c.soll || 0)));
  return `<div class="chart">${cols.map(c => `<div class="ccol"><span class="cval">${c.v ? (c.v / HOUR).toFixed(c.v / HOUR < 10 ? 1 : 0).replace('.', ',') : ''}</span>
    <div class="ctrack" style="height:${h}px"><div class="cbar" style="height:${c.v / max * 100}%;background:${c.color || 'var(--accent)'}"></div>${c.soll ? `<div class="cmark" style="bottom:${c.soll / max * 100}%"></div>` : ''}</div>
    <span class="clab">${c.label}</span></div>`).join('')}</div>`;
}
function renderStats() {
  const c = calc(), t = today(), [from, to] = statBounds(), until = to < t ? to : t;
  const all = c.range(from, to), past = all.filter(x => x.d <= t), worked = past.filter(x => x.net > 0);
  const net = sum(past, 'net'), soll = sum(past, 'soll'), diff = net - soll, s = stats(all);
  const short = to.slice(0, 7) === from.slice(0, 7) || (parseYmd(to) - parseYmd(from)) / 86400000 <= 62;
  const buckets = [];
  for (const x of all) {
    const k = short ? 'KW ' + isoWeek(x.d) : MSHORT[+x.d.slice(5, 7) - 1] + (from.slice(0, 4) !== to.slice(0, 4) ? " '" + x.d.slice(2, 4) : '');
    let b = buckets.at(-1);
    if (!b || b.label !== k) buckets.push(b = { label: k, v: 0, soll: 0, future: true });
    b.v += x.net; if (x.d <= t) { b.soll += x.soll; b.future = false; }
  }
  buckets.forEach(b => b.color = b.future ? 'rgba(255,255,255,.15)' : progColor(b.soll ? Math.round(b.v / b.soll * 100) : 100));
  const wd = [1, 2, 3, 4, 5, 6, 0].map(i => { const ds = worked.filter(x => parseYmd(x.d).getDay() === i); return { label: WD[i].slice(0, 2), v: ds.length ? sum(ds, 'net') / ds.length : 0, color: 'var(--accent)' }; });
  const longest = worked.reduce((a, x) => !a || x.net > a.net ? x : a, null);
  const earliest = worked.reduce((a, x) => !a || minOfDay(x.sess[0].s) < minOfDay(a.sess[0].s) ? x : a, null);
  const holi = all.filter(x => x.holiday && x.planned).length;
  const row = (l, v, k = '') => `<div class="row"><span>${l}</span><span class="${k}">${v}</span></div>`;
  const pill = (p, l) => `<button class="pill sm ${statRange.preset === p ? 'sel' : ''}" onclick="setStat('${p}')">${l}</button>`;
  view.innerHTML = `<h1 class="center">Statistik</h1>
  <div class="seg">${pill('year', 'Dieses Jahr')}${pill('last', 'Letztes Jahr')}${pill('12m', '12 Monate')}${pill('custom', 'Zeitraum')}</div>
  ${statRange.preset === 'custom' ? `<div class="group"><label class="row"><span>Von</span><input type="date" value="${from}" onchange="setStat('from', this)"></label><label class="row"><span>Bis</span><input type="date" value="${to}" onchange="setStat('to', this)"></label></div>` : ''}
  <p class="center muted small">${dmy(from)} – ${dmy(to)}</p>
  <div class="kpis">
    <div class="kpi"><b>${hours(net)}</b><span>Gearbeitet</span></div>
    <div class="kpi"><b>${hours(soll)}</b><span>Soll bis ${dmy(until).slice(0, 6)}</span></div>
    <div class="kpi"><b class="${cls(diff)}">${hm(diff, true)}</b><span>Differenz im Zeitraum</span></div>
    <button class="kpi" onclick="openBalance()"><b class="${cls(c.balance(until))}">${hm(c.balance(until), true)}</b><span>Überstundenkonto ›</span></button>
    <div class="kpi"><b>${worked.length}</b><span>Tage gearbeitet</span></div>
    <div class="kpi"><b>${worked.length ? hm(net / worked.length) : '–'}</b><span>Ø pro Arbeitstag</span></div>
  </div>
  <div class="label">${short ? 'Wochen' : 'Monate'}</div>
  <div class="card">${chart(buckets)}<p class="hint" style="margin:10px 0 0">Balken = gearbeitet (Std.), Strich = Soll. Farbe zeigt, wie viel vom Soll erreicht ist.</p></div>
  <div class="label">Ø pro Wochentag</div>
  <div class="card">${chart(wd, 100)}</div>
  <div class="label">Details</div>
  <div class="group">
    ${row('Ø Start', s.start)}${row('Ø Ende', s.end)}
    ${row('Längster Tag', longest ? `${dur(longest.net)} (${dmy(longest.d)})` : '–')}
    ${row('Frühester Start', earliest ? `${tod(earliest.sess[0].s)} (${dmy(earliest.d)})` : '–')}
  </div>
  <div class="group">
    ${row('Urlaubstage', countAbs(all, 'urlaub'))}${row('Krankheitstage', countAbs(all, 'krank'))}
    ${row('Kind krank', countAbs(all, 'kindkrank'))}${row('Unbezahlter Urlaub', countAbs(all, 'unbezahlt'))}
    ${row('Feiertage (an Arbeitstagen)', holi)}
  </div>
  <button class="big" onclick="openExport('${from}', '${to}')">Exportieren</button>`;
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
    for (const mem of members.filter(x => x.status === 'active')) {
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
