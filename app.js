// UI of the Stempeluhr web app. Calculations live in logic.js, login and cloud storage in cloud.js.
// KEY: where times lived before the login existed; cloud.js moves them into the account on first login.
const KEY = 'stempeluhr-v1';
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const TYPES = { urlaub: 'Urlaub', krank: 'Krank', kindkrank: 'Kind krank', unbezahlt: 'Unbezahlter Urlaub', feiertag: 'Feiertag', reduzierung: 'Stundenreduzierung' };
const JOBTYPES = { haupt: 'Hauptjob', neben: 'Nebenjob (Klasse VI)', mini: 'Minijob' };
const PVOPT = { z: 'Kinderlos', u23: 'Kinderlos, unter 23', 1: '1 Kind', 2: '2 Kinder', 3: '3 Kinder', 4: '4 Kinder', 5: '5+ Kinder' };
const ICON = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4M12 12H3"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 14h.01M12 14h.01M16 14h.01" stroke-width="2.6" stroke-linecap="round"/></svg>',
};
const $ = s => document.querySelector(s);
const view = $('#view');
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => ymd(new Date());

let data = normalize({});
let tab = 'start';
let month = { y: new Date().getFullYear(), m: new Date().getMonth() };
let edit = null;

function normalize(d) {
  const def = { name: '', soll: [0, 8, 8, 8, 8, 8, 0], pause: 30, state: '', startBalance: 0, since: today(), vacation: 30,
    jobs: [], stkl: 1, zkf: 0, kirche: false, kvz: 2.9, pv: 'z', hourly: 0, otCap: 0,
    plans: [], round: { step: 0, mode: 'nearest' }, onboarded: true, theme: {}, tips: true, locs: [] };
  return {
    sessions: (d.sessions || []).filter(x => typeof x.s === 'number'),
    absences: d.absences || [],
    adjustments: d.adjustments || [],
    settings: { ...def, ...d.settings },
  };
}
const calc = () => makeCalc(data, Date.now());

// ---------- formatting ----------
function hm(ms, signed) {
  const m = Math.round(Math.abs(ms) / MIN);
  return (ms < 0 && m ? '-' : signed && m ? '+' : '') + pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}
function dur(ms, signed) {
  const m = Math.round(Math.abs(ms) / MIN), h = Math.floor(m / 60);
  const txt = [h && h + ' Std.', (m % 60 || !h) && (m % 60) + ' Min.'].filter(Boolean).join(' ');
  return (ms < 0 && m ? '-' : signed && m ? '+' : '') + txt;
}
const eur = v => (+v || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const eurK = (v, unit = ' €') => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : Math.round(v)) + unit;
const num = v => { let t = String(v).trim(); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isFinite(n) ? n : 0; };
const deNum = v => String(+v || 0).replace('.', ',');
const hours = ms => (ms / HOUR).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Std.';
const clockStr = ms => { const s = Math.floor(ms / 1000); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const tod = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const dmy = s => s.slice(8) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
const cls = ms => Math.round(ms / MIN) < 0 ? 'red' : Math.round(ms / MIN) > 0 ? 'green' : '';
const span = (x, dash = ' – ') => x.sess.map(s => tod(s.s) + dash + (s.e ? tod(s.e) : 'läuft')).join(', ');
const minOfDay = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const avgTime = list => { if (!list.length) return '–'; const m = Math.round(list.reduce((a, b) => a + b, 0) / list.length); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
// Offener Eintrag: „läuft“ nur, wenn er heute bzw. in den letzten 16 Stunden begonnen hat. Ältere offene Einträge
// sind vergessene Ausstempel-Vorgänge und zählen nicht als „gerade eingestempelt“.
function openState(sessions, now = Date.now()) {
  const o = sessions.filter(x => x.e == null).sort((a, b) => b.s - a.s)[0];
  if (!o) { const p = pauseRun(sessions, now); return p ? { since: p.e, pause: true, stale: false } : null; }
  return { since: o.s, stale: o.s > now + 5 * MIN || now - o.s > 16 * HOUR };
}
const openLabel = st => !st ? '' : st.pause ? '<span class="yellow">●</span> ' : st.stale ? `<span class="near" title="Offener Eintrag seit ${dmy(ymd(new Date(st.since)))}">●</span> ` : '<span class="green">●</span> ';
const openText = st => !st ? '' : st.pause ? `☕ in Pause seit ${tod(st.since)}` : st.stale ? `offen seit ${new Date(st.since).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (vergessen auszustempeln?)` : `eingestempelt seit ${tod(st.since)}`;
const countAbs = (days, type) => days.filter(x => x.absence?.type === type && x.workday).length;
const workdays = (c, from, to) => from <= to ? c.range(from, to).filter(x => x.workday).length : 0;

function note(x) {
  const a = x.absence;
  return [x.holiday, a && TYPES[a.type] + (a.type === 'reduzierung' ? ` (-${a.hours} Std.)` : '') + (a.comment ? ': ' + a.comment : '')].filter(Boolean).join(', ');
}
function stats(days) {
  const w = days.filter(x => x.sess.length);
  return { start: avgTime(w.map(x => minOfDay(x.sess[0].s))), end: avgTime(w.filter(x => x.sess.at(-1).e).map(x => minOfDay(x.sess.at(-1).e))) };
}

// ---------- navigation ----------
let swipeLock = false, renderLater = false;   // während eines Wischers nicht neu zeichnen (sonst verliert iOS den Finger)
function render() {
  if (swipeLock) { renderLater = true; return; }
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  requestAnimationFrame(moveTabInd);
  if (tab === 'login') return renderLogin();
  if (ADMIN_APP && me && !isAdmin()) return renderNoAccess();
  if (viewing && !asSelf() && (tab === 'pay' || (tab === 'start' && !viewing.preview))) tab = 'cal';
  renderPage();
  maybeOnboard();
}
function renderPage() {
  applyTheme();
  ({ start: renderStart, cal: renderCal, stats: renderStats, pay: renderPay, setup: renderSetup, admin: renderAdmin })[tab]();
  view.insertAdjacentHTML('afterbegin', adminBar() + viewBanner());
}
function go(t) { tab = t; render(); view.scrollTop = 0; }
// Gleitende Markierung in der Menüleiste (zieht sich beim Wechsel kurz in die Länge und federt nach).
// Blaue Kopie der Icons über der Leiste, nur innerhalb der Pille sichtbar: Wie bei iOS färbt die Linse
// genau das ein, was unter ihr liegt, auch halbe Icons beim Ziehen.
function tabHi() {
  const nav = $('.tabs'); if (!nav) return null;
  let hi = nav.querySelector('.tab-hi');
  const btns = [...nav.querySelectorAll('button')];
  if (!hi) {
    hi = document.createElement('div'); hi.className = 'tab-hi'; hi.setAttribute('aria-hidden', 'true');
    btns.forEach(b => { const sp = document.createElement('span'); sp.innerHTML = b.innerHTML; hi.appendChild(sp); });
    nav.appendChild(hi);
  }
  btns.forEach((b, i) => { hi.children[i].hidden = b.hidden; hi.children[i].classList.toggle('hover', b.classList.contains('hover')); });
  return hi;
}
// Pille an Position x mit Breite w, k = Vergrößerung beim Ziehen
function placeInd(x, w, k = 1) {
  const ind = $('.tab-ind'), hi = tabHi();
  ind.style.transform = `translateX(${x}px)${k !== 1 ? ` scale(${k},1)` : ''}`; ind.style.width = w + 'px';
  const g = w * (k - 1) / 2;
  if (hi) hi.style.clipPath = `inset(0 calc(100% - ${x + w + g}px) 0 ${x - g}px round 27px)`;
}
function moveTabInd() {
  const nav = $('.tabs'), ind = $('.tab-ind'), b = $('.tabs button.on');
  if (!nav || !ind) return;
  if (!b || b.hidden || nav.hidden) { ind.style.opacity = 0; const hi = tabHi(); if (hi) hi.style.clipPath = 'inset(0 100% 0 0)'; return; }
  const x = b.offsetLeft, w = b.offsetWidth, from = parseFloat(ind.dataset.x);
  ind.style.opacity = 1;
  placeInd(x, w);
  if (!isNaN(from) && from !== x && ind.animate) {
    const k = Math.min(1.45, 1 + Math.abs(x - from) / 500);
    const a = ind.animate([{ scale: '1 1' }, { scale: `${k} .86`, offset: .35 }, { scale: '.96 1.04', offset: .7 }, { scale: '1 1' }], { duration: 500, easing: 'ease-out' });
    setTimeout(() => a.finish(), 650);
    nav.classList.add('press'); setTimeout(() => nav.classList.remove('press'), 180);
  }
  ind.dataset.x = x;
}
// Leichtes Antippen-Gefühl (Haptik). Android: Vibration. iPhone (ab iOS 18): Ein verstecktes Schalter-Feld
// wird umgelegt, das löst das System-Feedback aus. Ist Haptik in den iPhone-Einstellungen aus, passiert nichts.
const haptic = (() => {
  let lab;
  return () => {
    try {
      if (navigator.vibrate) return navigator.vibrate(8);
      if (!lab) {
        lab = document.createElement('label');
        lab.setAttribute('aria-hidden', 'true');
        lab.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px';
        const inp = document.createElement('input');
        inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.tabIndex = -1;
        lab.appendChild(inp); document.body.appendChild(lab);
      }
      lab.click();
    } catch (e) { }
  };
})();
// Wischen über die Menüleiste: Die Pille folgt dem Finger, beim Loslassen öffnet sich das Feld darunter.
// Ein schneller kurzer Wisch springt ein Feld weiter. Auf dem iPhone über Touch-Events, am Computer mit der Maus.
(function tabSwipe() {
  const nav = $('.tabs'), ind = $('.tab-ind');
  if (!nav || !ind) return;
  let start = null, dragging = false, eatClick = false, hoverBtn = null, lastTouch = -1e9;
  const btns = () => [...nav.querySelectorAll('button')].filter(b => !b.hidden);
  const under = x => btns().reduce((best, b) => {
    const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - x);
    return !best || d < best.d ? { b, d } : best;
  }, null)?.b;
  // Finger auf dem aktiven Feld: Die Linse wächst sofort, wie bei iOS
  // Fingerposition in Leisten-Koordinaten, auch wenn die Leiste beim Halten geschrumpft ist
  const local = x => { const r = nav.getBoundingClientRect(); return (x - r.left) * nav.offsetWidth / r.width; };
  const down = (x, t) => { start = { x, t }; dragging = false; hoverBtn = null; if (under(local(x))?.dataset.tab === tab) nav.classList.add('press'); };
  const move = x => {
    if (!start) return false;
    if (!dragging && Math.abs(x - start.x) < 8) return false;
    if (!dragging) { dragging = true; nav.classList.add('press', 'drag'); ind.style.transition = 'width .2s,top .25s,bottom .25s,background .25s,box-shadow .25s'; }
    const w = ind.offsetWidth, rx = local(x);
    const left = Math.max(5, Math.min(nav.offsetWidth - 5 - w, rx - w / 2));
    const u = under(rx);
    if (u !== hoverBtn) { if (hoverBtn) haptic(); hoverBtn = u; }
    btns().forEach(b => b.classList.toggle('hover', b === u));
    placeInd(left, w, 1.1);
    ind.dataset.x = left;
    return true;
  };
  const up = (x, t, cancel) => {
    const s = start; start = null;
    if (!s || !dragging) { nav.classList.remove('press'); return; }
    dragging = false; eatClick = true; setTimeout(() => { eatClick = false; }, 400);
    nav.classList.remove('press', 'drag'); ind.style.transition = '';
    btns().forEach(b => b.classList.remove('hover')); tabHi();
    const list = btns(), cur = list.findIndex(b => b.dataset.tab === tab);
    let target = under(local(x));
    const dx = x - s.x, v = Math.abs(dx) / Math.max(1, t - s.t);
    if (!cancel && target === list[cur] && v > 0.5) target = list[Math.max(0, Math.min(list.length - 1, cur + Math.sign(dx)))];
    if (cancel || !target || target.dataset.tab === tab) { moveTabInd(); return; }
    haptic(); target.click();
  };
  nav.addEventListener('touchstart', e => { lastTouch = e.timeStamp; down(e.touches[0].clientX, e.timeStamp); }, { passive: true });
  nav.addEventListener('touchmove', e => { if (move(e.touches[0].clientX)) e.preventDefault(); }, { passive: false });
  nav.addEventListener('touchend', e => up(e.changedTouches[0].clientX, e.timeStamp, false));
  nav.addEventListener('touchcancel', e => up(e.changedTouches[0]?.clientX ?? 0, e.timeStamp, true));
  // Hängengebliebene Linse aufräumen, wenn die App in den Hintergrund geht
  document.addEventListener('visibilitychange', () => { if (start) up(0, 0, true); nav.classList.remove('press', 'drag'); });
  // Maus (Computer). iOS schickt nach jedem Tippen nachgemachte Maus-Ereignisse, oft ohne mouseup:
  // die würden die Linse groß stehen lassen, deshalb kurz nach einer Berührung ignorieren.
  nav.addEventListener('mousedown', e => { if (e.button === 0 && e.timeStamp - lastTouch > 1000) down(e.clientX, e.timeStamp); });
  addEventListener('mousemove', e => { if (start) move(e.clientX); });
  addEventListener('mouseup', e => { if (start) up(e.clientX, e.timeStamp, false); });
  nav.addEventListener('click', e => { if (eatClick && e.isTrusted) { e.stopPropagation(); e.preventDefault(); } }, true);
})();
// Wischen nach links/rechts irgendwo auf dem Bildschirm: Alle Menüfelder liegen wie eine lange Seite nebeneinander.
// Beim Wischen schiebt sich die Nachbarseite mit ihren Kacheln herein, die Pille in der Menüleiste wandert mit.
(function pageSwipe() {
  const nav = $('.tabs'), ind = $('.tab-ind');
  const peek = document.createElement('main');
  peek.id = 'peek'; peek.setAttribute('aria-hidden', 'true'); view.after(peek);
  let s = null, raf = 0, busy = false;
  const tabsList = () => [...nav.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.dataset.tab);
  const blocked = el => el.closest('input,select,textarea,.tabs,[data-noswipe]') || [...(function* () { for (let e = el; e && e !== view; e = e.parentElement) yield e; })()]
    .some(e => e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX));
  const W = () => view.clientWidth;
  // Nachbarseite in die Vorschau zeichnen, ohne die aktuelle Seite anzufassen
  function fillPeek(t) {
    const keep = document.createDocumentFragment(), st = view.scrollTop, old = tab;
    while (view.firstChild) keep.appendChild(view.firstChild);
    tab = t;
    try { renderPage(); } finally { tab = old; }
    peek.replaceChildren(...view.childNodes);
    view.replaceChildren(keep);
    view.scrollTop = st; peek.scrollTop = 0;
  }
  const unlock = () => { swipeLock = false; if (renderLater) { renderLater = false; render(); } };
    function place(x) {
    view.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    peek.style.transform = s && s.pd ? `translate3d(${x + s.pd * W()}px,0,0)` : '';
  }
  function settle(ms, then) {
    const tr = `transform ${ms}ms cubic-bezier(.22,1,.36,1)`;
    view.style.transition = peek.style.transition = tr;
    setTimeout(() => { view.style.transition = peek.style.transition = 'none'; then(); }, ms + 20);
  }
  view.addEventListener('touchstart', e => {
    if (busy) return;
    if (swipeLock) { view.style.transform = peek.style.transform = ''; peek.classList.remove('on'); document.body.classList.remove('swiping'); moveTabInd(); unlock(); }   // hängengebliebenen Wischer aufräumen
    s = null;
    if (e.touches.length !== 1 || nav.hidden || !$('#sheet').hidden || blocked(e.target)) return;
    const t = e.touches[0];
    s = { x: t.clientX, y: t.clientY, dir: 0, dx: 0, hist: [], pd: 0, nb: null };
  }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (!s || busy) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
      if (s.dir === 'h') {
        swipeLock = true;
        s.hist = [];
        document.body.classList.add('swiping');
        s.x = t.clientX;
        view.style.transition = peek.style.transition = ind.style.transition = 'none';
        view.style.willChange = peek.style.willChange = 'transform';
      }
    }
    if (s.dir !== 'h') return;
    e.preventDefault();
    // Schwung aus den letzten 100 ms der Bewegung
    s.hist.push([e.timeStamp, t.clientX]);
    while (s.hist.length > 2 && e.timeStamp - s.hist[0][0] > 100) s.hist.shift();
    s.dx = t.clientX - s.x;
    const list = tabsList(), i = list.indexOf(tab), side = s.dx < 0 ? 1 : -1, nb = list[i + side];
    if (i >= 0 && nb && s.pd !== side) { fillPeek(nb); s.pd = side; s.nb = nb; peek.classList.add('on'); }
    if (!nb || i < 0) { s.pd = 0; s.nb = null; peek.classList.remove('on'); }
    const x = s.pd ? s.dx : s.dx / (1 + Math.abs(s.dx) / 60);   // ohne Nachbar: Gummiband
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (s) place(x); });
  }, { passive: false });
  const done = e => {
    if (!s) return;
    const st = s;
    cancelAnimationFrame(raf); raf = 0;
    if (st.dir !== 'h') { s = null; return; }
    view.style.willChange = peek.style.willChange = '';
    ind.style.transition = '';
    const h = st.hist || [], last = h[h.length - 1], first = h[0];
    const v = last && first && last[0] > first[0] && e.timeStamp - last[0] < 80 ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
    const flick = Math.abs(v) > 0.4 && Math.sign(v) === Math.sign(st.dx);
    const commit = e.type !== 'touchcancel' && st.pd && (Math.abs(st.dx) > W() * 0.3 || flick);
    busy = true;
    place(st.dx === 0 ? 0 : (st.pd ? st.dx : st.dx / (1 + Math.abs(st.dx) / 60)));
    view.offsetWidth;   // aktuelle Position festhalten, damit der Übergang von hier startet
    if (commit) {
      const target = st.nb, rest = 1 - Math.abs(st.dx) / W();
      haptic();
      nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === target));
      moveTabInd();
      settle(Math.round(180 + 200 * rest), () => {
        s = null;
        view.style.transform = ''; peek.style.transform = '';
        swipeLock = false; renderLater = false;
        document.body.classList.remove('swiping');
        go(target);
        peek.classList.remove('on'); peek.replaceChildren();
        busy = false; unlock();
      });
      view.style.transform = `translate3d(${-st.pd * W()}px,0,0)`;
      peek.style.transform = 'translate3d(0,0,0)';
    } else {
      moveTabInd();
      settle(320, () => {
        s = null;
        view.style.transform = ''; peek.style.transform = '';
        document.body.classList.remove('swiping');
        peek.classList.remove('on'); peek.replaceChildren();
        busy = false; unlock();
      });
      view.style.transform = 'translate3d(0,0,0)';
      if (st.pd) peek.style.transform = `translate3d(${st.pd * W()}px,0,0)`;
    }
  };
  view.addEventListener('touchend', done);
  view.addEventListener('touchcancel', done);
})();
// iOS-Web-App: Der Layout-Bereich endet manchmal über der Home-Leiste, obwohl der Bildschirm weiter geht.
// Dann wird die App auf die echte Bildschirmhöhe gezogen, damit nichts unten abgeschnitten wird.
function fixGap() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const h = standalone && innerHeight > innerWidth ? screen.height : 0;
  if (h > innerHeight && h - innerHeight < 120) document.documentElement.style.setProperty('--appH', h + 'px');
  else document.documentElement.style.removeProperty('--appH');
}
fixGap();
addEventListener('resize', () => { fixGap(); const i = $('.tab-ind'); if (i) { i.style.transition = 'none'; moveTabInd(); i.offsetWidth; i.style.transition = ''; } });
// iOS: nach dem Schließen der Tastatur bleibt die Seite manchmal verschoben, die Menüleiste rutscht dann nach oben.
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) window.scrollTo(0, 0);
}, 60));
function sheet(html) {
  $('#sheet').classList.remove('preview', 'chatsheet');
  $('#sheet').innerHTML = `<div class="backdrop" onclick="closeSheet()"></div><div class="panel"><div class="grab"></div>${html}</div>`;
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; $('#sheet').classList.remove('preview', 'chatsheet'); currentTopic = null; fbUnsub?.(); fbUnsub = null; }

// ---------- start ----------
// Startseite: feste Seite ohne Scrollen. Oben Fortschritt, Differenz und Pause, darunter der Tagesverlauf,
// unten die Uhr mit Start/Stop. Die Uhr nimmt den restlichen Platz ein, so passt alles auf jedes Handy.
function renderStart() {
  view.innerHTML = `<div class="startfix">
  <div class="shead"><h1>Heute</h1></div>
  <div class="sgrid">
    <div class="card sbig"><span class="muted small">Vom Soll</span><b id="pct">0 %</b><span class="small" id="finish"></span>
      <div class="bar thin"><div class="fill" id="fill"></div></div></div>
    <div class="scol">
      <div class="card ssm"><span class="muted small">Differenz</span><b id="tdiff"></b></div>
      <div class="card ssm"><span class="muted small">Pause</span><b id="tpause"></b></div>
    </div>
  </div>
  <div class="two"><button class="pill" onclick="openOverview()">${ICON.list} Übersicht</button><button class="pill" onclick="openAbsences()">${ICON.cal} Abwesenheiten</button></div>
  ${tipHtml()}
  <div class="card sclock">
    <div class="dial" id="dial"><span class="caps" id="caps"></span>
      <span class="hticks"></span><div><span class="muted small" id="dlabel">Arbeitszeit</span><b id="clock">00:00:00</b></div></div>
    <p class="shint" id="shint"></p>
    <div class="acts" id="acts"></div>
  </div></div>`;
  updateStart();
}
// Ring um die Uhr: eine Umdrehung = Sollzeit. Erste Runde rot → orange (¼) → gelb (½) → grün (voll).
// Überstunden: Ring bleibt grün, eine zweite Runde startet hellblau (nah am Grün) → dunkelblau → lila.
const RING1 = [[0, '#e8455a'], [.25, '#f0883c'], [.5, '#f2c94c'], [.75, '#a8d14a'], [1, '#8cc63f']];
const RING2 = [[0, '#5fd6b8'], [.3, '#4fb3ff'], [.6, '#2f6bff'], [.8, '#3a3fd8'], [1, '#8e44ff']];
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const ringColor = (st, f) => { for (let i = 1; i < st.length; i++) if (f <= st[i][0]) return mixHex(st[i - 1][1], st[i][1], (f - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); return st.at(-1)[1]; };
// Ein einziger Verlauf (keine übereinanderliegenden Schichten, sonst schimmert am Rand eine dünne Farblinie durch).
// Die Farbe hängt am Winkel (¼ immer orange), der Bogen endet bei f, danach kommt der Rest-Ring.
const ringArc = (st, f, rest) => `conic-gradient(${[...st.filter(x => x[0] < f).map(x => `${x[1]} ${x[0] * 100}%`), `${ringColor(st, f)} ${f * 100}%`, `${rest} ${f * 100}%`].join(', ')})`;
const RINGP = [[0, '#7d8aa0'], [.5, '#c9a24a'], [1, '#f2c94c']];   // Pause: ruhig, wird zur Pflichtpause hin gelb
function pauseRing(f) {
  if (f <= 0.001) return { bg: 'var(--ringtrack)', caps: [] };
  const g = Math.min(1, f);
  return { bg: ringArc(RINGP, g, 'var(--ringtrack)'), caps: g < 1 ? [[0, RINGP[0][1]], [g, ringColor(RINGP, g)]] : [] };
}
function dialRing(f) {
  const track = 'var(--ringtrack)';
  if (f <= 0.001) return { bg: track, caps: [] };
  if (f <= 1) return { bg: ringArc(RING1, f, track), caps: f < 1 ? [[0, RING1[0][1]], [f, ringColor(RING1, f)]] : [] };
  const q = Math.min(1, f - 1);   // Überstunden: zweite Runde über dem vollen grünen Ring
  return { bg: ringArc(RING2, q, RING1.at(-1)[1]), caps: q < 1 ? [[0, RING2[0][1]], [q, ringColor(RING2, q)]] : [] };
}
function updateStart() {
  if (!$('#clock')) return;
  const now = Date.now(), t = calc().day(today());
  const P = data.settings.pause * MIN, pct = t.soll ? Math.floor(t.net / t.soll * 100) : 0;
  const done = t.soll && t.net >= t.soll;
  const left = data.settings.pauseRule === 'fix' || t.soll > 6 * HOUR ? Math.max(0, P - t.brk - t.pause) : 0;   // Pause, die noch abgezogen wird
  const finish = now + Math.max(0, t.soll - t.net + left), first = t.sess[0]?.s ?? now;
  const running = data.sessions.some(x => x.e == null);
  $('#clock').textContent = clockStr(t.gross);
  $('#pct').textContent = pct + ' %';
  $('#fill').style.width = Math.min(100, pct) + '%';
  $('#fill').style.background = progColor(pct);
  const pz = pauseRun(data.sessions, now), state = running ? 'work' : pz ? 'pause' : 'idle';
  let ring = dialRing(t.soll ? t.net / t.soll : 0), hint = '', hcls = '';
  if (state === 'pause') {
    // Pausen-Uhr: Ring füllt sich bis zur Pflichtpause, die Pause zählt erst ab 15 Min.
    const req = data.settings.pauseRule === 'fix' ? P : t.gross > 9 * HOUR ? Math.max(P, 45 * MIN) : (t.gross > 6 * HOUR || t.soll > 6 * HOUR) ? P : 15 * MIN;
    const pe = now - pz.e, need = Math.max(15 * MIN, req - t.brk);   // t.brk = schon gemachte Pausen ab 15 Min.
    ring = pauseRing(pe / need);
    $('#clock').textContent = clockStr(pe);
    hint = pe < 15 * MIN ? `Noch ${Math.ceil((15 * MIN - pe) / MIN)} Min., dann zählt die Pause` : pe < need ? `Noch ${Math.ceil((need - pe) / MIN)} Min. bis zur Pflichtpause` : '✓ Pflichtpause erreicht';
    hcls = pe >= need ? 'green' : '';
  } else if (state === 'work') {
    const blk = workBlock(t.sess, now);
    if (blk >= 6 * HOUR) { hint = '⚠️ Über 6 Std. ohne Pause – bitte jetzt Pause machen'; hcls = 'red'; }
    else if (blk >= 5.75 * HOUR) { hint = `In ${Math.ceil((6 * HOUR - blk) / MIN)} Min. brauchst du eine Pause`; hcls = 'near'; }
  }
  $('#dlabel').textContent = state === 'pause' ? '☕ Pause' : 'Arbeitszeit';
  $('#tpause').textContent = hm(t.breakTotal + (state === 'pause' ? now - pz.e : 0));   // laufende Pause zählt gleich mit
  $('#shint').textContent = hint; $('#shint').className = 'shint ' + hcls;
  const acts = $('#acts');
  if (acts.dataset.state !== state) {
    acts.dataset.state = state;
    acts.innerHTML = state === 'work' ? '<button class="big pause" onclick="doPause()">Pause</button><button class="big stop" onclick="doEnd()">Feierabend</button>'
      : state === 'pause' ? '<button class="big" onclick="doResume()">Weiter</button><button class="big stop" onclick="doEnd()">Feierabend</button>'
      : '<button class="big" id="toggle" onclick="toggle()">Start</button>';
  }
  $('#dial').style.background = ring.bg;
  // runde Enden am farbigen Bogen
  $('#caps').innerHTML = ring.caps.map(([f, c]) => `<i style="transform:rotate(${f * 360}deg);--c:${c}"></i>`).join('');
  $('#finish').textContent = !t.soll ? 'Heute frei' : done ? 'Ziel erreicht ✓' : `fertig um ${tod(finish)}`;
  $('#tdiff').textContent = hm(t.diff, true);
  $('#tdiff').className = t.sess.length ? cls(t.diff) : '';


}
// ---------- Pause ----------
// „Pause“ beendet den laufenden Abschnitt und merkt sich das (p: 1), „Weiter“ startet einen neuen.
// Die Lücke zählt wie jede ausgestempelte Lücke: ab 15 Min. als Pause (§ 4 ArbZG).
function pauseRun(sess = data.sessions, now = Date.now()) {
  if (sess.some(x => x.e == null)) return null;
  const last = sess.reduce((a, x) => !a || x.s > a.s ? x : a, null);
  return last?.p && last.e && now - last.e < 16 * HOUR && ymd(new Date(last.e)) === ymd(new Date(now)) ? last : null;
}
function stampGuard() { if (viewing) { alert('Das ist eine Vorschau. Für andere kannst du nicht stempeln. Zeiten korrigierst du im Kalender.'); return true; } }
function newSession() { const defLoc = (data.settings.locs || []).find(l => l.def && !l.arch); data.sessions.push({ s: Date.now(), e: null, ...(defLoc ? { loc: defLoc.id } : {}) }); }
function doPause() {
  if (stampGuard()) return;
  const run = data.sessions.find(x => x.e == null); if (!run) return;
  run.e = Date.now(); run.p = 1; save(); haptic(); updateStart();
}
function doResume() {
  if (stampGuard()) return;
  const p = pauseRun();
  if (p && Date.now() - p.e < 15 * MIN && !confirm('Die Pause ist kürzer als 15 Min. und zählt nicht als gesetzliche Pause. Trotzdem weiterarbeiten?')) return;
  newSession(); save(); haptic(); updateStart();
}
function doEnd() {
  if (stampGuard()) return;
  const run = data.sessions.find(x => x.e == null), p = pauseRun();
  if (run) run.e = Date.now();
  if (p) delete p.p;   // Feierabend aus der Pause: die Pause war das Ende des Tages
  save(); haptic(); updateStart();
}
// Wie lange schon am Stück gearbeitet (Unterbrechungen unter 15 Min. zählen nicht als Pause)
function workBlock(sess, now) {
  const list = sess.slice().sort((a, b) => a.s - b.s);
  let i = list.length - 1; if (i < 0 || list[i].e != null) return 0;
  let start = list[i].s;
  while (i > 0 && list[i - 1].e != null && start - list[i - 1].e < 15 * MIN) start = list[--i].s;
  return now - start;
}
function toggle() {
  if (stampGuard()) return;
  const run = data.sessions.find(x => x.e == null);
  if (run) run.e = Date.now(); else newSession();
  save(); updateStart();
}

// Tagesverlauf von heute: Zeitleiste (Lücken = Pausen) und alle Stempel-Abschnitte
function dayTimelineHtml(t) {
  if (!t.sess.length) return '<div class="card sday"><b>Tagesverlauf</b><p class="muted small center" style="margin:8px 0 0">Heute noch nicht gestempelt</p></div>';
  const now = Date.now(), first = t.sess[0].s, running = t.sess.at(-1).e == null;
  const end = Math.max(t.sess.at(-1).e ?? now, running ? now : 0, first + HOUR);
  const pos = ms => ((ms - first) / (end - first) * 100).toFixed(2) + '%';
  return `<div class="card sday">
    <div class="sdh"><b>Tagesverlauf${note(t) ? ` <span class="muted small">${esc(note(t))}</span>` : ''}</b><span><span class="muted small">netto</span> <b>${dur(t.net)}</b></span></div>
    <div class="tl">${t.sess.map((x, i) => `<i class="${i % 2 ? 'alt' : ''}" style="left:${pos(x.s)};width:calc(${pos(x.e ?? now)} - ${pos(x.s)})"></i>`).join('')}</div>
    <div class="barlabels"><span>${tod(first)}</span><span>${tod((first + end) / 2)}</span><span>${running ? 'jetzt' : tod(end)}</span></div>
    <div class="tsess">${t.sess.map((x, i) => `<div><i class="${i % 2 ? 'alt' : ''}"></i><span>${tod(x.s)} – ${x.e ? tod(x.e) : 'läuft'}</span><span class="muted">${dur((x.e ?? now) - x.s)}</span></div>`).join('')}</div>
    ${t.breakTotal ? `<div class="tsess"><div><i class="brk"></i><span class="muted">Pause gesamt</span><span class="muted">${dur(t.breakTotal)}</span></div></div>` : ''}
  </div>`;
}
function openOverview() {
  const c = calc(), t = today(), st = data.settings, y = t.slice(0, 4);
  const all = c.range(st.since, t), s = stats(all);
  const gestern = c.balance(addDays(t, -1)), aktuell = c.balance(t);
  sheet(`${dayTimelineHtml(c.day(t))}
  <div class="ot-grid">
    <button class="ot ${cls(gestern)}" onclick="openBalance()"><b>${hm(gestern, true)}</b><span>Überstunden gestern</span></button>
    <button class="ot ${cls(aktuell)}" onclick="openBalance()"><b>${hm(aktuell, true)}</b><span>Überstunden aktuell ›</span></button>
    <div class="ot"><b>${s.start}</b><span>Ø Startzeit</span></div>
    <div class="ot"><b>${s.end}</b><span>Ø Endzeit</span></div>
  </div>
  <p class="hint">Tippe auf das Konto, um die Rechnung Tag für Tag zu sehen. „Aktuell“ rechnet die volle Sollzeit von heute schon mit ein.${+st.otCap ? ` Das Konto geht höchstens bis ${st.otCap} Std., alles darüber wird ausgezahlt.` : ''}</p>
  <p class="center">Seit Beginn der Aufzeichnung hast du ${dur(sum(all, 'net'))} gearbeitet (nach Abzug der Pausen).</p>
  <div class="group">
    <div class="row"><span>Urlaub ${y}</span><span>${countAbs(c.range(y + '-01-01', y + '-12-31'), 'urlaub')} von ${st.vacation} Tagen</span></div>
    <div class="row"><span>Krankheitstage ${y}</span><span>${countAbs(c.range(y + '-01-01', t), 'krank')}</span></div>
    <div class="row"><span>Aufzeichnung seit</span><span>${dmy(st.since)}</span></div>
  </div>
  <div class="center"><button class="round" onclick="closeSheet()" aria-label="Schließen">✕</button></div>`);
}

// ---------- absences ----------
function openAbsences() {
  const c = calc(), list = data.absences.slice().sort((a, b) => b.from.localeCompare(a.from));
  sheet(`<div class="sheet-head"><h2>Abwesenheiten</h2><button class="pill sm" onclick="closeSheet()">Fertig</button></div>
  <button class="pill wide" onclick="absenceForm()">+ Abwesenheit hinzufügen</button>
  <div class="two" style="margin:0 0 14px"><button class="pill" onclick="openPlanner()">🏖 Urlaubsplaner</button><button class="pill" onclick="openFerien()">🎒 Schulferien</button></div>
  ${list.length ? `<div class="group">${list.map(a => `<div class="row"><div><b>${TYPES[a.type]}</b>${a.type === 'reduzierung' ? ` -${a.hours} Std./Tag` : ''}
    <div class="muted small">${dmy(a.from)}${a.to !== a.from ? ' – ' + dmy(a.to) : ''} · ${workdays(c, a.from, a.to)} Arbeitstage${a.comment ? ' · ' + esc(a.comment) : ''}</div></div>
    <button class="del" onclick="delAbsence('${a.id}')">Löschen</button></div>`).join('')}</div>`
    : '<p class="muted center">Noch keine Abwesenheiten eingetragen.</p>'}`);
}
function absenceForm(from = today()) {
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="openAbsences()">Abbrechen</button><button class="pill sm green" onclick="saveAbsence()">Speichern</button></div>
  <h2 id="atitle"></h2>
  <div class="label">Abwesenheitstyp</div>
  <div class="group">
    <label class="row"><span>Typ</span><select id="atype" onchange="absUpdate()">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="row" id="ahrow" hidden><span>Stunden weniger pro Tag</span><input id="ahours" type="number" inputmode="decimal" step="0.25" min="0" value="4"></label>
  </div>
  <div class="label">Zeitraum</div>
  <div class="group">
    <label class="row"><span>Start</span><input id="afrom" type="date" value="${from}" onchange="absUpdate(true)"></label>
    <label class="row"><span>Ende</span><input id="ato" type="date" value="${from}" onchange="absUpdate()"></label>
  </div>
  <div class="hint" id="acount"></div>
  <div class="label">Kommentar</div>
  <div class="group"><div class="row"><input id="acomment" class="full" placeholder="Kommentar hinzufügen"></div></div>`);
  absUpdate();
}
function absUpdate(fromChanged) {
  const t = $('#atype').value, f = $('#afrom'), to = $('#ato');
  if (fromChanged && to.value < f.value) to.value = f.value;
  $('#atitle').textContent = TYPES[t] + ' hinzufügen';
  $('#ahrow').hidden = t !== 'reduzierung';
  $('#acount').textContent = 'Arbeitstage: ' + (f.value && to.value ? workdays(calc(), f.value, to.value) : 0);
}
function saveAbsence() {
  const from = $('#afrom').value, to = $('#ato').value, type = $('#atype').value, hours = +$('#ahours').value;
  if (!from || !to || to < from) return alert('Bitte einen gültigen Zeitraum wählen.');
  if (type === 'reduzierung' && !(hours > 0)) return alert('Bitte die Stunden angeben.');
  data.absences.push({ id: Date.now().toString(36), type, from, to, hours: type === 'reduzierung' ? hours : 0, comment: $('#acomment').value.trim() });
  save(); render(); openAbsences();
}
function delAbsence(id) {
  if (!confirm('Abwesenheit löschen?')) return;
  data.absences = data.absences.filter(a => a.id !== id);
  save(); render(); openAbsences();
}

// ---------- day editor ----------
function openDay(d) {
  const x = calc().day(d);
  edit = { d, rows: x.sess.map(s => ({ s: tod(s.s), e: s.e ? tod(s.e) : '' })) };
  if (!edit.rows.length) edit.rows.push({ s: '', e: '' });
  renderDay();
}
function renderDay() {
  const x = calc().day(edit.d);
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="closeSheet()">Abbrechen</button><button class="pill sm green" onclick="saveDay()">Speichern</button></div>
  <h2>${WD[parseYmd(edit.d).getDay()]}, ${dmy(edit.d)}</h2>
  ${note(x) ? `<p class="badge">${esc(note(x))}</p>` : ''}
  ${edit.d < data.settings.since ? `<p class="badge">Vor deinem Startdatum (${dmy(data.settings.since)}): keine Sollstunden. Änderbar unter Setup → Aufzeichnung seit.</p>` : ''}
  <div class="label">Arbeitszeiten (von – bis)</div>
  <div class="group">${edit.rows.map((r, i) => `<div class="row erow"><input type="time" class="es" value="${r.s}"><span class="muted">bis</span><input type="time" class="ee" value="${r.e}"><button class="del" onclick="delRow(${i})" aria-label="Zeile löschen">✕</button></div>`).join('')}</div>
  <p class="hint">Endzeit leer lassen heißt: läuft noch (nur für heute).</p>
  <button class="pill wide" onclick="addRow()">+ Zeit hinzufügen</button>
  <div class="group">
    <div class="row"><span>Brutto</span><span>${dur(x.gross)}</span></div>
    <div class="row"><span>Pause gesamt</span><span>${dur(x.breakTotal)}</span></div>
    ${x.pause ? `<div class="row"><span class="muted small">davon pauschal abgezogen</span><span class="muted small">${dur(x.pause)}</span></div>` : ''}
    <div class="row"><span>Netto</span><span>${dur(x.net)}</span></div>
    <div class="row"><span>Soll</span><span>${dur(x.soll)}</span></div>
    <div class="row"><span>Differenz</span><span class="${cls(x.diff)}">${dur(x.diff, true)}</span></div>
  </div>
  <button class="pill wide" onclick="absenceForm('${edit.d}')">Urlaub / Krank / Feiertag eintragen</button>`);
}
function readRows() {
  edit.rows = [...document.querySelectorAll('.erow')].map(r => ({ s: r.querySelector('.es').value, e: r.querySelector('.ee').value }));
}
function addRow() { readRows(); edit.rows.push({ s: '', e: '' }); renderDay(); }
function delRow(i) { readRows(); edit.rows.splice(i, 1); renderDay(); }
function at(d, hhmm) { const [h, m] = hhmm.split(':').map(Number), x = parseYmd(d); x.setHours(h, m, 0, 0); return x.getTime(); }
function saveDay() {
  readRows();
  const out = [];
  for (const r of edit.rows) {
    if (!r.s) continue;
    const s = at(edit.d, r.s);
    if (!r.e) {
      if (edit.d !== today()) return alert('Bitte für jede Zeit eine Endzeit eintragen.');
      out.push({ s, e: null }); continue;
    }
    const e = at(edit.d, r.e);
    if (e <= s) return alert('Die Endzeit muss nach der Startzeit liegen.');
    out.push({ s, e });
  }
  const others = data.sessions.filter(x => ymd(new Date(x.s)) !== edit.d);
  if (out.filter(x => x.e == null).length + others.filter(x => x.e == null).length > 1) return alert('Es kann nur eine laufende Zeit geben.');
  data.sessions = others.concat(out);
  const since = data.settings.since;
  if (out.length && edit.d < since && confirm(`Der ${dmy(edit.d)} liegt vor deinem Startdatum (${dmy(since)}), dafür zählen noch keine Sollstunden.\n\nSoll die Aufzeichnung schon am ${dmy(edit.d)} beginnen?`)) data.settings.since = edit.d;
  save(); closeSheet(); render();
}

// ---------- kalender (Tag / Woche / Monat) ----------
// Ein Anker-Datum calDay für alle drei Ansichten: Woche zeigt die Woche von calDay, Monat den Monat von calDay.
// Tippen auf einen Tag in Woche oder Monat öffnet die Tagesansicht, dort wird bearbeitet.
let calView = 'week', calDay = today();
function ring(p) {
  return `<svg viewBox="0 0 100 100" class="ring"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--track)" stroke-width="10"/>
  <circle cx="50" cy="50" r="42" fill="none" stroke="${progColor(p)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${Math.min(p, 100) * 2.639} 264" transform="rotate(-90 50 50)"/>
  <text x="50" y="57" text-anchor="middle" font-size="20" fill="#eee">${p}%</text></svg>`;
}
function dayState(x, t) {
  const future = x.d > t;
  return x.absence || x.holiday ? 'abs' : x.soll && x.net >= x.soll ? 'ok' : x.soll && !future && x.d < t ? 'miss' : x.net ? 'ok' : '';
}
function setCal(v, d) { calView = v; if (d) calDay = d; render(); view.scrollTop = 0; }
function moveCal(n) {
  calDay = calView === 'day' ? addDays(calDay, n) : calView === 'week' ? addDays(calDay, 7 * n)
    : ymd(new Date(+calDay.slice(0, 4), +calDay.slice(5, 7) - 1 + n, 1));
  render();
}
function renderCal() {
  const seg = (v, l) => `<button class="${calView === v ? 'on' : ''}" onclick="setCal('${v}')">${l}</button>`;
  const head = `<div class="segctl">${seg('day', 'Tag')}${seg('week', 'Woche')}${seg('month', 'Monat')}</div>`;
  const nav = title => `<div class="mhead"><button class="nav" onclick="moveCal(-1)" aria-label="Zurück">‹</button><div class="center">${title}</div><button class="nav" onclick="moveCal(1)" aria-label="Weiter">›</button></div>`;
  const todayBtn = `<button class="pill sm todaybtn" onclick="setCal(calView, today())">Heute</button>`;
  ({ day: calDayView, week: calWeekView, month: calMonthView })[calView](head, nav, todayBtn);
}
function calDayView(head, nav, todayBtn) {
  const c = calc(), t = today(), d = calDay, x = c.day(d), past = d <= t;
  const p = x.soll ? Math.floor(x.net / x.soll * 100) : 0;
  view.innerHTML = head + nav(`<h1 style="font-size:26px">${WD[parseYmd(d).getDay()]}</h1><div class="muted">${dmy(d)}${d === t ? ' · heute' : ''}</div>`) +
  (d !== t ? todayBtn : '') + `
  ${note(x) ? `<p class="badge center">${esc(note(x))}</p>` : ''}
  <div class="card">
    <div class="today-top">
      <div><div class="pct">${p} %</div><div class="muted">vom Soll</div></div>
      <div class="barwrap"><div class="bar"><div class="fill" style="width:${Math.min(100, p)}%;background:${progColor(p)}"></div></div>
        <div class="barlabels"><span>${x.sess[0] ? tod(x.sess[0].s) : '–'}</span><span>${x.sess.at(-1)?.e ? tod(x.sess.at(-1).e) : x.sess.length ? 'läuft' : '–'}</span></div></div>
    </div>
    <div class="tiles">
      <div class="tile"><b>${hm(x.net)}</b><span>Netto</span></div>
      <div class="tile"><b>${hm(x.soll)}</b><span>Soll</span></div>
      <div class="tile"><b class="${past ? cls(x.diff) : ''}">${past || x.net ? hm(x.diff, true) : '–'}</b><span>Differenz</span></div>
    </div>
  </div>
  <div class="label">Zeiten</div>
  ${x.sess.length ? `<div class="group">${x.sess.map(s => `<div class="row"><span>${tod(s.s)} – ${s.e ? tod(s.e) : 'läuft'}</span><span>${dur((s.e ?? Date.now()) - s.s)}</span></div>`).join('')}
    ${x.brkAll ? `<div class="row"><span class="muted">Pause (ausgestempelt)</span><span class="muted">${dur(x.brkAll)}</span></div>` : ''}
    ${x.pause ? `<div class="row"><span class="muted">Pause (pauschal)</span><span class="muted">− ${dur(x.pause)}</span></div>` : ''}</div>`
    : `<p class="muted center">${d > t ? 'Dieser Tag liegt in der Zukunft.' : 'An diesem Tag ist keine Zeit erfasst.'}</p>`}
  <div class="two"><button class="pill" onclick="openDay(calDay)">✏️ ${x.sess.length ? 'Bearbeiten' : 'Eintragen'}</button><button class="pill" onclick="absenceForm(calDay)">🏖 Abwesenheit</button></div>
  ${d >= data.settings.since ? `<div class="group"><div class="row"><span>Überstundenkonto am ${dmy(d < t ? d : t).slice(0, 6)}</span><span class="${cls(c.balance(d < t ? d : t))}">${hm(c.balance(d < t ? d : t), true)}</span></div></div>`
    : `<p class="hint">Vor deinem Startdatum (${dmy(data.settings.since)}) zählen keine Sollstunden.</p>`}`;
}
function calWeekView(head, nav, todayBtn) {
  const c = calc(), t = today(), ws = monday(calDay), days = c.range(ws, addDays(ws, 6));
  const net = sum(days, 'net'), soll = sum(days, 'soll'), diff = sum(days.filter(x => x.d <= t), 'diff');
  view.innerHTML = head + nav(`<h1 style="font-size:26px">Woche ${isoWeek(ws)}</h1><div class="muted">${dmy(ws).slice(0, 6)} – ${dmy(addDays(ws, 6))}</div>`) +
  (ws !== monday(t) ? todayBtn : '') + `
  <div class="whead">${ring(soll ? Math.round(net / soll * 100) : 0)}
    <div class="wtitle"><b>${dur(net)}</b><div class="muted small">von ${dur(soll)} Soll</div></div>
    <div class="wsum"><b class="${cls(diff)}">${dur(diff, true)}</b><div class="muted small">bis heute</div></div>
  </div>
  ${days.map(x => dayRow(x, t)).join('')}`;
}
function dayRow(x, t) {
  const future = x.d > t;
  return `<button class="day ${x.d === t ? 'is-today' : ''} ${x.soll || x.net || note(x) ? '' : 'off'}" onclick="setCal('day', '${x.d}')">
    <span class="dot ${x.d === t ? 'today' : dayState(x, t)}"></span>
    <span class="dl"><b>${WD[parseYmd(x.d).getDay()]}</b><span class="muted">${dmy(x.d).slice(0, 6)}${x.sess.length ? ' · ' + span(x) : ''}</span>${note(x) ? `<span class="tag">${esc(note(x))}</span>` : ''}</span>
    <span class="dr"><b>${x.sess.length || (!future && x.soll) ? dur(x.net) : ''}</b>${!future && (x.soll || x.net) ? `<span class="${cls(x.diff)} small">${dur(x.diff, true)}</span>` : ''}</span>
  </button>`;
}
const monthBounds = (y, m) => [`${y}-${pad(m + 1)}-01`, ymd(new Date(y, m + 1, 0))];
function calMonthView(head, nav, todayBtn) {
  const c = calc(), t = today(), y = +calDay.slice(0, 4), m = +calDay.slice(5, 7) - 1, [first, last] = monthBounds(y, m);
  const days = c.range(first, last), past = days.filter(x => x.d <= t), stand = last < t ? last : t, bal = c.balance(stand);
  const lead = (parseYmd(first).getDay() + 6) % 7;
  const row = (label, val, k = '') => `<div class="row"><span>${label}</span><span class="${k}">${val}</span></div>`;
  view.innerHTML = head + nav(`<h1 style="font-size:26px">${MONTHS[m]} ${y}</h1>`) + (first.slice(0, 7) !== t.slice(0, 7) ? todayBtn : '') + `
  <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<span class="wd">${w}</span>`).join('')}
    ${'<span></span>'.repeat(lead)}${days.map(x => `<button class="cell ${x.d === t ? 'today' : ''} ${x.soll || x.net || note(x) ? '' : 'off'}" onclick="setCal('day', '${x.d}')">
      <span>${+x.d.slice(8)}</span><i class="cd ${dayState(x, t)}"></i><small>${x.net ? (x.net / HOUR).toFixed(1).replace('.', ',') : ''}</small></button>`).join('')}</div>
  <p class="hint center"><span class="green">●</span> Soll erreicht · <span class="red">●</span> zu wenig · <span style="color:var(--accent)">●</span> frei / abwesend · Zahl = Stunden</p>
  <div class="label">Bis heute</div>
  <div class="group">${row('Gearbeitet', dur(sum(past, 'net')))}${row('Soll', dur(sum(past, 'soll')))}${row('Differenz', dur(sum(past, 'diff'), true), cls(sum(past, 'diff')))}</div>
  <div class="label">Ganzer Monat</div>
  <div class="group">${row('Gearbeitet', dur(sum(days, 'net')))}${row('Soll', dur(sum(days, 'soll')))}${row('Urlaubstage', countAbs(days, 'urlaub'))}${row('Krankheitstage', countAbs(days, 'krank'))}${row(`Überstundenkonto (${dmy(stand).slice(0, 6)})`, hm(bal, true), cls(bal))}</div>
  <button class="big" onclick="exportPdf(${y}, ${m})">PDF exportieren</button>`;
}
function moveMonth(n) { const d = new Date(month.y, month.m + n, 1); month = { y: d.getFullYear(), m: d.getMonth() }; render(); }

// ---------- verdienst ----------
const MSHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function renderPay() {
  const st = data.settings, c = calc(), t = today(), { y, m } = month;
  const head = `<div class="mhead"><button class="nav" onclick="moveMonth(-1)" aria-label="Vorheriger Monat">‹</button><h1>${MONTHS[m]} ${y}</h1><button class="nav" onclick="moveMonth(1)" aria-label="Nächster Monat">›</button></div>`;
  if (!st.jobs.length) {
    view.innerHTML = head + `<div class="card center"><p>Trag ein, welche Jobs du hast und was du dort brutto verdienst. Dann rechnet die App hier Brutto, Abzüge und Netto aus.</p>
      <button class="big" onclick="jobForm()">Job hinzufügen</button><p class="hint">Steuerklasse und Krankenkasse stellst du unter Setup ein.</p></div>`;
    return;
  }
  const otH = (yy, mm) => (c.payouts()[`${yy}-${pad(mm + 1)}`] || 0) / HOUR, cap = +st.otCap || 0;
  const p = payMonth(data, y, m, otH(y, m)), [first, last] = monthBounds(y, m), stand = last < t ? last : t;
  const days = c.range(first, last), past = days.filter(x => x.d <= stand);
  const rate = hourlyRate(st), ratio = p.brutto ? p.netto / p.brutto : 0;
  const worked = sum(past, 'net'), sollMonth = sum(days, 'soll'), overtime = sum(past, 'diff');
  const value = worked / HOUR * rate, pct = sollMonth ? Math.floor(worked / sollMonth * 100) : 0;
  const row = (label, val, k = '') => `<div class="row"><span>${label}</span><span class="${k}">${val}</span></div>`;
  const minus = v => v ? '-' + eur(v) : eur(0);

  // Diese Woche bis heute: Sollzeit anteilig netto, Mehrarbeit genau wie eine Auszahlung über den Hauptjob
  let weekCard = '';
  if (first <= t && t <= last) {
    const ws = monday(t), wd = c.range(ws, t), wSoll = sum(wd, 'soll'), wNet = sum(wd, 'net'), wDiff = wNet - wSoll;
    const base = payMonth(data, y, m), wr = base.brutto ? base.netto / base.brutto : 0;
    // Mit Grenze zählt Mehrarbeit erst als Geld, wenn das Konto darüber liegt (ab der 41. Stunde bei 40).
    const capMs = cap * HOUR, konto = c.balance(t), above = c.payouts()[t.slice(0, 7)] || 0;
    const moneyMs = !cap ? wDiff : wDiff > 0 ? Math.min(wDiff, above) : 0;
    const moreBr = moneyMs / HOUR * rate, moreNet = moneyMs ? payMonth(data, y, m, moneyMs / HOUR).netto - base.netto : 0;
    const sollBr = wSoll / HOUR * rate, sollNet = sollBr * wr;
    const signed = v => (v > 0 ? '+' : v < 0 ? '-' : '+') + (v ? eur(Math.abs(v)) : '0 €');
    const tr = (label, ms, br, ne, k = '', sign) => `<div class="row trow ${k}"><span>${label}</span><span>${hm(ms, sign)}</span><span>${sign ? signed(br) : eur(br)}</span><span>${sign ? signed(ne) : eur(ne)}</span></div>`;
    const sub = !cap ? '' : konto < capMs ? `Noch ${hm(capMs - konto)} Std. bis zur Auszahlung`
      : moneyMs > 0 ? `Konto voll: ${hm(moneyMs)} Std. davon werden ausgezahlt` : 'Konto voll: jede weitere Stunde wird ausgezahlt';
    weekCard = `<div class="label">Woche ${isoWeek(ws)} bis heute</div>
    <div class="group">
      <div class="row trow head muted small"><span></span><span>Std.</span><span>Brutto</span><span>Netto</span></div>
      ${tr('Sollzeit', wSoll, sollBr, sollNet)}
      ${tr(wDiff < 0 ? 'Minusstunden' : 'Mehrarbeit', wDiff, moreBr, moreNet, sub ? 'nb' : '', true)}
      ${sub ? `<div class="row subrow">${sub}</div>` : ''}
      ${tr('<b>Gesamt</b>', wNet, sollBr + moreBr, sollNet + moreNet, 'sum')}
    </div>
    <p class="hint">Netto der Sollzeit anteilig (${Math.round(wr * 100)} % vom Brutto). ${cap
      ? `Mehrarbeit sammelt sich bis ${cap} Std. auf dem Überstundenkonto und zählt erst darüber als Geld, dann genau gerechnet wie eine Auszahlung über den Hauptjob. Konto jetzt: ${hm(konto, true)} Std.`
      : 'Mehrarbeit genau gerechnet wie eine Auszahlung über den Hauptjob.'}</p>`;
  }

  const jobGroups = p.jobs.map(x => `<div class="group">
    <div class="row head"><span>${esc(x.job.name || JOBTYPES[x.job.type])}</span><span class="muted small">${JOBTYPES[x.job.type]}${x.midi ? ' · Midijob' : ''}</span></div>
    ${row('Gehalt', eur(x.base))}
    ${x.cut ? row(`Unbezahlt (${x.days} ${x.days === 1 ? 'Kalendertag' : 'Kalendertage'})`, minus(x.cut), 'red') : ''}
    ${x.ot ? row(`Überstunden (${hm(x.ot * HOUR)} Std.)`, '+' + eur(x.otPay), 'green') : ''}
    ${x.job.type === 'mini' ? (x.rv ? row('Rentenversicherung', minus(x.rv)) : row('Abzüge', 'keine')) : `
    ${row('Krankenversicherung', minus(x.kv))}${row('Rentenversicherung', minus(x.rv))}${row('Arbeitslosenversicherung', minus(x.av))}${row('Pflegeversicherung', minus(x.pv))}
    ${row('Lohnsteuer', minus(x.lst))}${x.soli ? row('Solidaritätszuschlag', minus(x.soli)) : ''}${st.kirche ? row('Kirchensteuer', minus(x.kist)) : ''}`}
    ${row('<b>Netto</b>', `<b>${eur(x.netto)}</b>`)}
    ${x.sach ? row('Sachbezug (Gutschein)', '+' + eur(x.sach)) : ''}
  </div>`).join('');

  // Jahresstatistik: Vertragsnetto je Monat und gestempelte Stunden
  const curY = +t.slice(0, 4), curM = +t.slice(5, 7) - 1;
  const months = MONTHS.map((_, i) => {
    const pm = payMonth(data, y, i, otH(y, i)), [f, l] = monthBounds(y, i), hrs = l < st.since || f > t ? 0 : sum(c.range(f > st.since ? f : st.since, l < t ? l : t), 'net');
    return { i, pm, hrs, done: y < curY || (y === curY && i <= curM), full: f >= st.since && l < t };
  });
  const done = months.filter(x => x.done), ysum = k => done.reduce((a, x) => a + x.pm[k], 0);
  const yHours = done.reduce((a, x) => a + x.hrs, 0), max = Math.max(1, ...months.map(x => x.pm.netto));
  const full = months.filter(x => x.full && x.hrs), fullHours = full.reduce((a, x) => a + x.hrs, 0), fullNet = full.reduce((a, x) => a + x.pm.netto, 0);

  view.innerHTML = head + `
  <div class="card">
    <div class="muted center">Auszahlung laut Vertrag</div>
    <div class="money">${eur(p.netto)}</div>
    <div class="tiles">
      <div class="tile"><b>${eurK(p.brutto)}</b><span>Brutto</span></div>
      <div class="tile"><b>${eurK(p.abz)}</b><span>Abzüge</span></div>
      <div class="tile"><b>${p.brutto ? Math.round(p.abz / p.brutto * 100) : 0} %</b><span>Abgabenquote</span></div>
    </div>
    ${p.unpaid ? `<div class="sessions"><span class="tag">${p.unpaid} unbezahlte Kalendertage: -${eur(p.cut)} brutto</span></div>` : ''}
    ${p.otPay ? `<div class="sessions"><span class="green">Inklusive ${hm(p.ot * HOUR)} Std. Überstunden: +${eur(p.otPay)} brutto${stand < last ? ' (bisher)' : ''}</span></div>` : ''}
    ${p.sach ? `<div class="sessions">Dazu ${eur(p.sach)} Sachbezug als Gutschein</div>` : ''}
  </div>
  <div class="label">Nach gestempelten Stunden</div>
  <div class="card">
    <div class="phead"><span class="pct sm">${pct} %</span><span class="muted">der Sollzeit</span></div>
    <div class="bar thin"><div class="fill" style="width:${Math.min(100, pct)}%"></div></div>
    <div class="barlabels"><span>${hours(worked)}</span><span>von ${hours(sollMonth)}</span></div>
    <div class="tiles">
      <div class="tile"><b>${eurK(value)}</b><span>erarbeitet brutto</span></div>
      <div class="tile"><b>${eurK(value * ratio)}</b><span>≈ netto</span></div>
      ${cap ? `<div class="tile"><b class="${cls(c.balance(stand))}">${hm(c.balance(stand), true)}</b><span>Konto (max. ${cap} Std.)</span></div>`
        : `<div class="tile"><b class="${cls(overtime)}">${overtime < 0 ? '-' : '+'}${eurK(Math.abs(overtime / HOUR * rate))}</b><span>Überstunden</span></div>`}
    </div>
    <div class="sessions">${eur(rate)} pro Stunde${st.hourly ? '' : ' (aus Gehalt und Sollstunden)'} · Stand ${dmy(stand)}</div>
  </div>
  <p class="hint">Erarbeitet = gestempelte Nettozeit mal Stundenlohn. ${cap ? `Überstunden sammeln sich bis ${cap} Std. auf dem Konto, alles darüber wird am Monatsende mit ${eur(rate)} pro Stunde über den Hauptjob ausgezahlt.` : 'Überstunden = Differenz zur Sollzeit bis heute in Euro. Ausgezahlt wird das Festgehalt oben.'}</p>
  ${weekCard}
  <div class="label">Abrechnung je Job</div>
  ${jobGroups}
  <div class="label">Statistik ${y}</div>
  <div class="bars y12">${months.map(x => `<div class="bcol ${x.done ? '' : 'future'}"><span class="bval">${x.pm.netto ? eurK(x.pm.netto, '') : ''}</span><div class="btrack"><div class="b" style="height:${x.pm.netto / max * 100}%"></div></div><span class="muted small">${MSHORT[x.i].slice(0, 1)}</span></div>`).join('')}</div>
  <div class="group">
    ${row(done.length ? `Netto ${MSHORT[0]} – ${MSHORT[done.at(-1).i]}` : 'Netto bisher', eur(ysum('netto')))}
    ${row('Brutto', eur(ysum('brutto')))}
    ${row('Steuern und Abgaben', eur(ysum('abz')))}
    ${ysum('sach') ? row('Sachbezüge', eur(ysum('sach'))) : ''}
    ${row('Gearbeitete Stunden', hours(yHours))}
    ${row('Netto pro gearbeiteter Stunde', fullHours ? eur(fullNet / (fullHours / HOUR)) : '–')}
    ${row(`Netto ganzes Jahr ${y} (Prognose)`, eur(months.reduce((a, x) => a + x.pm.netto, 0)))}
  </div>
  <p class="hint">Rechnung nach dem amtlichen Lohnsteuer-Programmablaufplan 2026 und den Sozialversicherungswerten 2026. Netto pro Stunde zählt nur abgeschlossene Monate seit Beginn der Aufzeichnung. Einmalzahlungen wie Boni fehlen. Verbindlich ist deine Lohnabrechnung.</p>`;
}

// ---------- setup: Themenliste, jedes Thema öffnet ein eigenes Fenster ----------
let currentTopic = null;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
function setupTopics() {
  const st = data.settings, week = st.soll.reduce((a, b) => a + (+b || 0), 0), own = !viewing, mine = own || asSelf();   // mine: eigene Sicht (auch Entwickler „als Nutzer“)
  const firm = !(asSelf() ? company : cid) ? 'Keine Firma' : isOwner() ? 'Geschäftsführer von ' + (company?.name || '…') : membership?.status === 'active' ? 'Mitarbeiter bei ' + (company?.name || membership.companyName)
    : membership?.status === 'pending' ? 'Anfrage an ' + membership.companyName + ' offen' : 'Firma';
  const act = (typeof teamPeople === 'function' ? teamPeople().filter(p => !p.self).length : 0), pend = members.filter(m => m.status === 'pending').length;
  return [
    [
      mine && me && ['account', '👤', 'Konto & Firma', `${asSelf() ? asUser.email || asUser.name : me.email || me.displayName || ''} · ${firm}`],
      mine && isOwner() && ['team', '👥', 'Team', `${company?.name || ''} · ${act} ${act === 1 ? 'Person' : 'Personen'}${pend ? ` · <span class="red">${pend} Anfrage${pend > 1 ? 'n' : ''}</span>` : ''}${payDue() ? ' · <span class="red">Lohn-Export fällig</span>' : ''}`],
    ],
    [
      ['work', '🕘', 'Arbeitszeit', `${STATES[st.state] || 'Bundesweite Feiertage'} · ${week.toLocaleString('de-DE')} Std./Woche · ${st.pause} Min. Pause`],
      ['balance', '⚖️', 'Überstunden & Urlaub', `seit ${dmy(st.since)} · ${st.vacation} Urlaubstage`],
      mine && ['loc', '📍', 'Standort', (st.locs || []).filter(l => !l.arch).length ? (st.locs || []).filter(l => !l.arch).map(l => esc(l.name)).join(', ') + ' · automatisch starten/stoppen' : 'Orte für automatischen Start und Stopp'],
      mine && ['pay', '💶', 'Verdienst & Steuern', `${st.jobs.length ? st.jobs.length + (st.jobs.length === 1 ? ' Job' : ' Jobs') : 'Kein Job'} · Steuerklasse ${ROMAN[st.stkl - 1]}`],
    ],
    [
      ['export', '📤', 'Export & Sicherung', 'PDF, Excel, CSV, Kalender, Backup'],
      mine && ['look', '🎨', 'Darstellung', `${(BGS[st.theme?.bg] || BGS.kaffee)[0]} · Tipps ${st.tips !== false ? 'an' : 'aus'}`],
      mine && ['help', '❓', 'Hilfe', 'Tutorial, Begriffe, Einführung'],
    ],
  ].map(g => g.filter(Boolean)).filter(g => g.length);
}
function renderSetup() {
  view.innerHTML = `<h1 class="center">Setup</h1>
  ${viewing && !asSelf() ? `<p class="hint center">Einstellungen von ${esc(viewing.name)}. Gehalt und Steuerdaten sind privat.</p>` : ''}
  ${setupTopics().map(g => `<div class="group">${g.map(([id, icon, title, sub]) => `<button class="row topic" onclick="openTopic('${id}')">
    <span class="ti">${icon}</span><span class="tt"><b>${title}</b><span class="muted small">${sub}</span></span><span class="muted">›</span></button>`).join('')}</div>`).join('')}
  ${viewing && !viewing.preview && viewing.uid !== company?.owner ? (() => { const m = members.find(x => x.uid === viewing.uid), boss = m?.role === 'boss';
    return `<div class="label">Rolle in der Firma</div><div class="group"><div class="row"><span>${boss ? 'Geschäftsführer' : 'Mitarbeiter'}<div class="muted small">${boss ? 'Gleiche Rechte wie du' : 'Sieht nur die eigenen Zeiten'}</div></span>
      <button class="pill sm" onclick="setBoss('${viewing.uid}', ${!boss})">${boss ? 'Rechte entziehen' : 'Zum Geschäftsführer machen'}</button></div></div>
      <button class="pill wide red" onclick="removeMember('${viewing.uid}')">${esc(viewing.name)} aus der Firma entfernen</button>`; })() : ''}
  ${viewing && !viewing.preview && viewing.uid === company?.owner ? '<p class="hint center">Gründer der Firma. Geschäftsführer-Rechte und Mitgliedschaft lassen sich hier nicht ändern.</p>' : ''}`;
}
const TOPIC_TITLE = { account: 'Konto & Firma', team: 'Team', loc: 'Standort', work: 'Arbeitszeit', balance: 'Überstunden & Urlaub', pay: 'Verdienst & Steuern', export: 'Export & Sicherung', look: 'Darstellung', help: 'Hilfe' };
function openTopic(id, keepStats) {
  const st = data.settings, now = new Date();
  const body = {
    account: () => accountHtml(),
    team: () => teamHtml(),
    loc: () => locListHtml(),
    work: () => `<div class="group">
        <label class="row"><span>Name (für PDF)</span><input value="${esc(st.name)}" placeholder="Dein Name" onchange="setS('name', this.value.trim())"></label>
        <label class="row"><span>Bundesland</span><select onchange="setS('state', this.value)"><option value="">Nur bundesweite Feiertage</option>${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${st.state === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="row"><span>Pause pauschal (Min.)</span><input type="number" inputmode="numeric" min="0" value="${st.pause}" onchange="setS('pause', Math.max(0, +this.value || 0))"></label>
        <label class="row"><span>Pausenregel</span><select onchange="setS('pauseRule', this.value); openTopic('work')"><option value="law">Gesetzlich</option><option value="fix" ${st.pauseRule === 'fix' ? 'selected' : ''}>Immer pauschal</option></select></label>
      </div>
      <p class="hint">Das Bundesland bestimmt Feiertage und Schulferien. Stempelst du für die Pause aus, zählt jede Lücke ab 15 Min. als Pause. ${st.pauseRule === 'fix'
        ? `<b>Immer pauschal:</b> An jedem Arbeitstag werden ${st.pause} Min. abgezogen, egal wie lange du arbeitest (Regel deines Arbeitgebers). Gestempelte Pausen werden angerechnet.`
        : `<b>Gesetzlich:</b> Fehlt bei mehr als 6 Std. Arbeit noch etwas bis zur Pause oben (ab 9 Std. mind. 45 Min.), wird nur der Rest abgezogen. Bis 6 Std. wird nichts abgezogen.`}</p>
      <div class="label">Sollstunden pro Tag</div>
      <div class="group">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label class="row"><span>${WD[i]}</span><input type="number" inputmode="decimal" step="0.25" min="0" max="24" value="${st.soll[i]}" onchange="setSoll(${i}, this)"></label>`).join('')}</div>
      ${setupExtrasHtml()}`,
    balance: () => `<div class="group">
        <label class="row"><span>Aufzeichnung seit</span><input type="date" value="${st.since}" onchange="this.value && setS('since', this.value)"></label>
        <label class="row"><span>Startsaldo</span><input value="${hm(st.startBalance * MIN, true)}" onchange="setBalance(this)"></label>
        <label class="row"><span>Auszahlen ab (Std.)</span><input type="number" inputmode="numeric" min="0" placeholder="nie" value="${st.otCap || ''}" onchange="setS('otCap', Math.max(0, num(this.value)))"></label>
      </div>
      <p class="hint">Startsaldo = Stand vor dem Startdatum, z. B. -26:01 aus einer alten App. Auszahlen ab: Überstunden über dieser Grenze werden am Monatsende ausgezahlt, das Konto bleibt bei der Grenze. Leer = nie.</p>
      <button class="pill wide" onclick="openBalance()">Überstunden Tag für Tag & Korrekturen ›</button>
      <div class="label">Urlaub</div>
      <div class="group"><label class="row"><span>Urlaubstage pro Jahr</span><input type="number" inputmode="numeric" min="0" value="${st.vacation}" onchange="setS('vacation', Math.max(0, +this.value || 0))"></label></div>
      <button class="pill wide" onclick="openAbsences()">Abwesenheiten, Urlaubsplaner, Schulferien ›</button>`,
    pay: () => `<div class="label">Jobs</div>
      ${st.jobs.length ? `<div class="group">${st.jobs.map((j, i) => `<button class="row" onclick="jobForm(${i})"><span>${esc(j.name || JOBTYPES[j.type])}<div class="muted small">${JOBTYPES[j.type]}${j.since ? ' · seit ' + dmy(j.since) : ''}</div></span><span>${eur(j.brutto)} ›</span></button>`).join('')}</div>` : ''}
      <button class="pill wide" onclick="jobForm()">+ Job hinzufügen</button>
      <button class="pill wide" onclick="pickPayslip()">📄 Lohnabrechnung einlesen (PDF)</button>
      <div class="group" style="margin-top:14px"><button class="row" onclick="openSlips()"><span>🗂 Meine Lohnabrechnungen<div class="muted small">Von deinem Arbeitgeber bereitgestellt</div></span><span class="muted">›</span></button></div>
      <p class="hint">Brutto pro Monat laut Vertrag. Damit rechnet der Tab Verdienst Brutto und Netto aus.</p>
      <div class="label">Steuer und Sozialversicherung</div>
      <div class="group">
        <label class="row"><span>Steuerklasse</span><select onchange="setS('stkl', +this.value)">${[1, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${st.stkl === k ? 'selected' : ''}>${ROMAN[k - 1]}</option>`).join('')}</select></label>
        <label class="row"><span>Kinderfreibeträge</span><input type="number" inputmode="decimal" step="0.5" min="0" max="10" value="${st.zkf}" onchange="setS('zkf', Math.max(0, Math.round(num(this.value) * 2) / 2)); this.value = data.settings.zkf"></label>
        <label class="row"><span>Kirchensteuer</span><select onchange="setS('kirche', this.value === '1')"><option value="0">Nein</option><option value="1" ${st.kirche ? 'selected' : ''}>Ja</option></select></label>
        <label class="row"><span>Pflegeversicherung</span><select onchange="setS('pv', this.value)">${Object.entries(PVOPT).map(([k, v]) => `<option value="${k}" ${String(st.pv) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="row"><span>KV-Zusatzbeitrag (%)</span><input class="short" inputmode="decimal" value="${deNum(st.kvz)}" onchange="setS('kvz', Math.max(0, num(this.value))); this.value = deNum(data.settings.kvz)"></label>
        <label class="row"><span>Stundenlohn (€)</span><input class="short" inputmode="decimal" placeholder="automatisch" value="${st.hourly ? deNum(st.hourly) : ''}" onchange="setS('hourly', Math.max(0, num(this.value)))"></label>
      </div>
      <p class="hint">Steuerklasse und Kinderfreibeträge stehen oben auf deiner Lohnabrechnung. Bei der Pflegeversicherung zählen Kinder unter 25. Den Zusatzbeitrag nennt deine Krankenkasse. Stundenlohn leer lassen, dann wird er aus Gehalt und Sollstunden berechnet. Kirchensteuer ${['BY', 'BW'].includes(st.state) ? '8' : '9'} % laut Bundesland. Diese Daten sieht nur du, dein Geschäftsführer nicht. Bei Problemen kann der App-Support sie zur Hilfe einsehen, aber nicht ändern.</p>`,
    export: () => `<div class="label">PDF-Arbeitszeitnachweis</div>
      <div class="group"><label class="row"><span>Monat</span><input type="month" id="pdfmonth" value="${now.getFullYear()}-${pad(now.getMonth() + 1)}"></label></div>
      <button class="big" onclick="pdfFromSetup()">PDF exportieren</button>
      <div class="label">Tabelle & Kalender</div>
      <button class="pill wide" onclick="openExport()">Excel, CSV oder Kalender (.ics) ›</button>
      <div class="label">Sicherung</div>
      <div class="group">
        <button class="row" onclick="backup()"><span>Backup speichern</span><span class="muted">›</span></button>
        <label class="row"><span>Backup oder Einstellungen laden</span><input type="file" class="file" onchange="restore(this)"></label>
      </div>
      <p class="hint">${viewing ? 'Backup laden ersetzt die Zeiten dieses Mitarbeiters.' : 'Deine Zeiten liegen in deinem Konto und sind auf allen Geräten gleich. Ein Backup ist trotzdem eine gute Absicherung.'}</p>`,
    look: () => `<div class="group">
        <button class="row" onclick="openTheme()"><span>Farben & Hintergrund</span><span class="muted">›</span></button>
        <label class="row"><span>Tipps auf der Startseite</span><input type="checkbox" ${st.tips !== false ? 'checked' : ''} onchange="setS('tips', this.checked)"></label>
      </div>`,
    help: () => `<div class="group">
        <button class="row" onclick="openTutorial()"><span>Tutorial: So funktioniert die App</span><span class="muted">›</span></button>
        <button class="row" onclick="openGlossary()"><span>Begriffe erklärt</span><span class="muted">›</span></button>
        <button class="row" onclick="onboard(0)"><span>Einführung erneut starten</span><span class="muted">›</span></button>
      </div>
      <div class="group">
        <a class="row" href="${WEB}datenschutz.html" target="_blank" rel="noopener"><span>Datenschutzerklärung</span><span class="muted">↗</span></a>
        <a class="row" href="${WEB}impressum.html" target="_blank" rel="noopener"><span>Impressum</span><span class="muted">↗</span></a>
      </div>`,
  }[id];
  if (!body) return;
  sheet(`<div class="sheet-head"><button class="pill sm" onclick="closeSheet(); render()">‹ Setup</button><h2>${TOPIC_TITLE[id]}</h2></div><div style="height:12px"></div>${body()}`);
  currentTopic = id;
  if (id === 'team' && !keepStats) loadTeamStats();
}
// Unterfenster (Job, Arbeitsplan, Farben …) kehren zum Thema zurück, aus dem sie geöffnet wurden.
function backToTopic() { const t = currentTopic; if (t) openTopic(t); else { closeSheet(); render(); } }
function jobForm(i) {
  const j = i == null ? { name: '', type: 'haupt', brutto: '', since: '', sach: 0, cut: true, rvFrei: true } : data.settings.jobs[i];
  sheet(`<div class="sheet-head"><button class="pill sm red" onclick="backToTopic()">Abbrechen</button><button class="pill sm green" onclick="saveJob(${i ?? -1})">Speichern</button></div>
  <h2>${i == null ? 'Job hinzufügen' : 'Job bearbeiten'}</h2>
  <div class="group">
    <label class="row"><span>Name</span><input id="jname" value="${esc(j.name)}" placeholder="z. B. Firma"></label>
    <label class="row"><span>Art</span><select id="jtype" onchange="jobUpdate(true)">${Object.entries(JOBTYPES).map(([k, v]) => `<option value="${k}" ${j.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="row"><span>Brutto pro Monat (€)</span><input id="jbrutto" class="short" inputmode="decimal" value="${j.brutto === '' ? '' : deNum(j.brutto)}" placeholder="0,00" oninput="jobUpdate()"></label>
    <label class="row"><span>Seit</span><input id="jsince" type="date" value="${j.since || ''}"></label>
    <label class="row"><span>Sachbezug steuerfrei (€)</span><input id="jsach" class="short" inputmode="decimal" value="${j.sach ? deNum(j.sach) : ''}" placeholder="0"></label>
  </div>
  <div class="group">
    <label class="row"><span>Unbezahlte Tage kürzen das Gehalt</span><input id="jcut" type="checkbox" ${j.cut ? 'checked' : ''}></label>
    <label class="row" id="jrvrow"><span>Von der Rentenversicherung befreit</span><input id="jrv" type="checkbox" ${j.rvFrei ? 'checked' : ''}></label>
  </div>
  <p class="hint" id="jhint"></p>
  ${i == null ? '' : `<button class="pill wide red" onclick="delJob(${i})">Job löschen</button>`}`);
  jobUpdate();
}
function jobUpdate(typeChanged) {
  const t = $('#jtype').value, b = num($('#jbrutto').value);
  if (typeChanged) $('#jcut').checked = t !== 'mini';
  $('#jrvrow').hidden = t !== 'mini';
  $('#jhint').textContent = t === 'mini'
    ? `Minijob bis ${eur(603)} im Monat. Steuern zahlt der Arbeitgeber pauschal. Ohne Befreiung gehen 3,6 % Rentenversicherung ab.`
    : t === 'neben' ? 'Zweiter Job auf Lohnsteuerkarte, versteuert mit Steuerklasse VI.'
    : b > 603 && b <= 2000 ? 'Midijob (Übergangsbereich 603,01 bis 2.000 €): geringere Sozialabgaben, wird automatisch berücksichtigt.'
    : 'Sozialversicherungspflichtig, versteuert mit deiner Steuerklasse.';
  if (t === 'mini' && b > 603) $('#jhint').textContent += ` Achtung: ${eur(b)} liegt über der Minijob-Grenze.`;
}
function saveJob(i) {
  if (supportReadOnly()) return;
  const j = { name: $('#jname').value.trim(), type: $('#jtype').value, brutto: num($('#jbrutto').value), since: $('#jsince').value,
    sach: num($('#jsach').value), cut: $('#jcut').checked, rvFrei: $('#jrv').checked };
  if (!(j.brutto > 0)) return alert('Bitte das Brutto pro Monat eintragen.');
  if (i < 0) data.settings.jobs.push(j); else data.settings.jobs[i] = j;
  save(); render(); backToTopic();
}
function delJob(i) {
  if (supportReadOnly()) return;
  if (!confirm('Job löschen?')) return;
  data.settings.jobs.splice(i, 1); save(); render(); backToTopic();
}
function setS(k, v) {
  if (supportReadOnly(k)) return;
  data.settings[k] = v; save(); if ($('#sheet').hidden) render();
}
// Support-Ansicht: private Einstellungen nur lesen
function supportReadOnly(k) {
  if (!asSelf() || (k && !PRIVATE.includes(k))) return false;
  toast('Nur lesen: private Einstellungen kann nur der Nutzer selbst ändern.'); render(); if (currentTopic) openTopic(currentTopic); return true;
}
function setSoll(i, el) { data.settings.soll[i] = Math.min(24, Math.max(0, +el.value || 0)); el.value = data.settings.soll[i]; save(); }
function setBalance(el) {
  const r = el.value.trim().replace('−', '-').match(/^([+-]?)(\d+)(?::(\d{1,2}))?$/);
  if (r) setS('startBalance', (r[1] === '-' ? -1 : 1) * (+r[2] * 60 + +(r[3] || 0)));
  else alert('Bitte im Format -26:01 oder 12:30 eingeben.');
  el.value = hm(data.settings.startBalance * MIN, true);
}
function pdfFromSetup() {
  const [y, m] = $('#pdfmonth').value.split('-').map(Number);
  if (y && m) exportPdf(y, m - 1);
}

// ---------- files ----------
async function deliver(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia('(pointer:coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') alert('Teilen fehlgeschlagen: ' + e.message); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function backup() {
  deliver(new Blob([JSON.stringify(data)], { type: 'application/json' }), `stempeluhr-backup-${today()}.json`);
}
function restore(el) {
  const f = el.files[0];
  if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt);
    if (d.app === 'stempeluhr-einstellungen' && d.settings && typeof d.settings === 'object') { // nur Einstellungen, Zeiten bleiben
      if (!confirm('Einstellungen übernehmen? Deine gestempelten Zeiten und Abwesenheiten bleiben erhalten.')) return;
      data = normalize({ ...data, settings: { ...data.settings, ...d.settings } }); save(); render(); alert('Einstellungen übernommen.');
      return;
    }
    if (!Array.isArray(d.sessions) || !Array.isArray(d.absences) || typeof d.settings !== 'object') throw new Error('keine Stempeluhr-Sicherung');
    if (!confirm('Backup laden? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
    data = normalize(d); save(); render(); alert('Backup geladen.');
  }).catch(e => alert('Datei konnte nicht geladen werden: ' + (e instanceof SyntaxError ? 'keine Stempeluhr-Datei' : e.message))).finally(() => { el.value = ''; });
}

function exportPdf(y, m) {
  if (!window.jspdf) return alert('Das PDF-Modul ist nicht geladen. Öffne die App einmal mit Internetverbindung.');
  const c = calc(), t = today(), st = data.settings, [first, last] = monthBounds(y, m);
  const days = c.range(first, last), stand = last < t ? last : t, past = days.filter(x => x.d <= stand);
  const doc = new jspdf.jsPDF();
  doc.setFontSize(16);
  doc.text(`Arbeitszeitnachweis ${MONTHS[m]} ${y}`, 14, 18);
  doc.setFontSize(10);
  if (st.name) doc.text(`Name: ${st.name}`, 14, 25);
  doc.autoTable({
    startY: st.name ? 30 : 24,
    head: [['Datum', 'Tag', 'Beginn', 'Ende', 'Pause', 'Arbeitszeit', 'Soll', 'Diff.', 'Bemerkung']],
    body: days.map(x => [
      dmy(x.d), WD[parseYmd(x.d).getDay()].slice(0, 2), x.sess[0] ? tod(x.sess[0].s) : '', x.sess.length ? (x.sess.at(-1).e ? tod(x.sess.at(-1).e) : 'läuft') : '',
      x.gross ? hm(x.breakTotal) : '', x.gross ? hm(x.net) : '', x.soll ? hm(x.soll) : '',
      x.d <= stand && (x.soll || x.gross) ? hm(x.diff, true) : '', note(x),
    ]),
    styles: { fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: [70, 45, 30] },
    didParseCell: h => { if (h.section === 'body' && !days[h.row.index].soll && !days[h.row.index].gross) h.cell.styles.textColor = [150, 150, 150]; },
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, theme: 'plain', tableWidth: 120,
    styles: { fontSize: 10, cellPadding: 1 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    body: [
      ['Sollstunden (Monat)', hm(sum(days, 'soll'))],
      ['Geleistet (netto)', hm(sum(days, 'net'))],
      [`Differenz bis ${dmy(stand)}`, hm(sum(past, 'diff'), true)],
      [`Überstundenkonto (Stand ${dmy(stand)})`, hm(c.balance(stand), true)],
      ...(c.payouts()[`${y}-${pad(m + 1)}`] ? [['Ausgezahlte Überstunden', hm(c.payouts()[`${y}-${pad(m + 1)}`])]] : []),
      ['Urlaubstage', String(countAbs(days, 'urlaub'))],
      ['Krankheitstage', String(countAbs(days, 'krank'))],
    ],
  });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(doc.splitTextToSize(`Pause = alle Unterbrechungen zwischen Beginn und Ende. ${st.pauseRule === 'fix' ? `Pause pauschal ${st.pause} Min. pro Arbeitstag (Firmenregel); fehlt etwas, wird es zusätzlich abgezogen.` : `Fehlt bis zur Mindestpause (${st.pause} Min. ab 6 Std., ${Math.max(st.pause, 45)} Min. ab 9 Std.) etwas, wird es zusätzlich abgezogen.`} Erstellt am ${dmy(t)}.`, 180), 14, doc.lastAutoTable.finalY + 6);
  deliver(doc.output('blob'), `Arbeitszeit_${y}-${pad(m + 1)}.pdf`);
}

// ---------- boot ----------
startCloud();
setInterval(() => tab === 'start' && $('#sheet').hidden && updateStart(), 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden && me) render(); });
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register(window.ADMIN_APP ? '../sw.js' : 'sw.js', { scope: window.ADMIN_APP ? '../' : './' });
