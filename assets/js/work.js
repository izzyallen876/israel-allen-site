/* work.js: the experience timeline.
   Three lanes (research, athletics, education), coloured bars, topic filters, a zoom
   between the research years and the whole span, milestone diamonds, hover details
   and a marker you can drag. Every date comes from the resume. */
(function () {
"use strict";
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var body = $('#tl-body'); if (!body) return;

var DAY = 86400000, WEEK = 7 * DAY, MONTH = 30.44 * DAY;
function utc(y, m, d) { return Date.UTC(y, m - 1, d); }
var now = new Date(); var TODAY = utc(now.getFullYear(), now.getMonth() + 1, now.getDate());
var eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
var EOM = utc(eom.getFullYear(), eom.getMonth() + 1, eom.getDate());

/* two views of the same data */
var RANGES = {
  research: { min: utc(2024, 12, 1), max: Math.max(utc(2026, 12, 31), EOM), grid: 3 * MONTH },
  all:      { min: utc(2017, 1, 1),  max: Math.max(utc(2028, 6, 30), EOM),  grid: 365.25 * DAY }
};
var view = 'research', RNG = RANGES[view];

/* lanes and items; "to: null" means still going. Milestones only know the year. */
var LANES = ['Research and machine learning', 'Athletics', 'Education'];
var CHAMP = 'Jamaica National Triathlon Champion, and RJR Gleaner Sportsman of the Year in Triathlon';
var ITEMS = [
  { id: 'chuter', lane: 0, name: 'Chuter Lab', label: 'Research Assistant', tag: 'ml', tags: ['ml', 'data'], from: utc(2026, 8, 1), to: null, when: 'August 2026 to now', card: true },
  { id: 'evergreen', lane: 0, name: 'Evergreen AI', label: 'AI Project Assistant', tag: 'ml', tags: ['ml'], from: utc(2026, 5, 1), to: null, when: 'May 2026 to now', card: true },
  { id: 'hasrp', lane: 0, name: 'Historical Accountability', label: 'Research Associate', tag: 'history', tags: ['history'], from: utc(2026, 5, 1), to: utc(2026, 8, 31), when: 'May to August 2026', card: true },
  { id: 'fieldlab', lane: 0, name: 'Political Violence FieldLab', label: 'Research Associate', tag: 'data', tags: ['data'], from: utc(2024, 12, 1), to: utc(2025, 12, 31), when: 'December 2024 to December 2025', card: true },
  { id: 'tri', lane: 1, name: 'National triathlete', label: 'Athlete, Jamaica Olympic Association', tag: 'sport', tags: ['sport'], from: utc(2017, 1, 1), to: null, when: '2017 to now',
    ms: [ { at: utc(2022, 7, 1), year: 2022, text: CHAMP }, { at: utc(2023, 7, 1), year: 2023, text: CHAMP } ] },
  { id: 'dartmouth', lane: 2, name: 'Dartmouth College', tags: ['edu'], ms: [ { at: utc(2028, 6, 1), year: 2028, text: 'Expected graduation, June 2028. Bachelor of Arts, Quantitative Social Science', note: 'expected graduation, June 2028 ›' } ] }
];
var FILTERS = { all: null, ml: 'ml', data: 'data', history: 'history', sport: 'sport' };
var filter = 'all';

function pct(t) { return Math.max(0, Math.min(1, (t - RNG.min) / (RNG.max - RNG.min))); }
function endOf(it) { return it.to === null ? Math.min(TODAY, RNG.max) : it.to; }
function dur(a, b) { var m = Math.max(1, Math.round((b - a) / MONTH)); return m < 24 ? m + (m === 1 ? ' month' : ' months') : (Math.round(m / 12 * 10) / 10) + ' years'; }

/* ---------- build the rows once ---------- */
var rowsHost = $('#tl-rows'), axis = $('#tl-axis-track'), tip = $('#tl-tip');
var rowEls = {};
LANES.forEach(function (ln, li) {
  var h = document.createElement('p'); h.className = 'tl-lane'; h.textContent = ln; rowsHost.appendChild(h);
  ITEMS.filter(function (it) { return it.lane === li; }).forEach(function (it) {
    var row = document.createElement('div'); row.className = 'tl-row'; row.setAttribute('data-role', it.id);
    row.innerHTML = '<span class="tl-name"></span><div class="tl-track"></div>';
    $('.tl-name', row).textContent = it.name;
    var track = $('.tl-track', row), el = { row: row, bar: null, ms: [] };
    if (it.from) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tl-bar'; b.setAttribute('data-tag', it.tag);
      b.setAttribute('aria-label', it.name + ', ' + it.label + ', ' + it.when);
      b.textContent = it.label; track.appendChild(b); el.bar = b;
    }
    (it.ms || []).forEach(function (m) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'tl-ms';
      d.setAttribute('aria-label', m.year + ': ' + m.text); track.appendChild(d);
      var note = null;
      if (m.note) { note = document.createElement('span'); note.className = 'tl-note'; note.textContent = m.note; note.setAttribute('aria-hidden', 'true'); track.appendChild(note); }
      el.ms.push({ el: d, m: m, note: note });
    });
    rowEls[it.id] = el; rowsHost.appendChild(row);
  });
});

/* ---------- place everything for the current view ---------- */
function layout() {
  RNG = RANGES[view];
  ITEMS.forEach(function (it) {
    var el = rowEls[it.id];
    if (el.bar) {
      var end = endOf(it), a = Math.max(it.from, RNG.min), b = Math.min(end, RNG.max), hidden = b <= a;
      el.bar.style.left = (pct(a) * 100).toFixed(2) + '%';
      el.bar.style.width = hidden ? '0' : Math.max(1, (pct(b) - pct(a)) * 100).toFixed(2) + '%';
      el.bar.style.opacity = hidden ? 0 : 1; el.bar.style.pointerEvents = hidden ? 'none' : '';
      el.bar.tabIndex = hidden ? -1 : 0;
      /* only print the role title when the bar is wide enough to hold it */
      var room = $('.tl-track', el.row).clientWidth * (pct(b) - pct(a));
      var marked = el.ms.some(function (o) { return o.m.at >= RNG.min && o.m.at <= RNG.max; });
      el.bar.textContent = room > 120 && !marked ? (it.from < RNG.min ? '‹ ' : '') + it.label : '';
    }
    el.ms.forEach(function (o) {
      var out = o.m.at < RNG.min || o.m.at > RNG.max;
      o.el.style.left = (pct(o.m.at) * 100).toFixed(2) + '%';
      o.el.style.opacity = out ? 0 : 1; o.el.style.pointerEvents = out ? 'none' : ''; o.el.tabIndex = out ? -1 : 0;
      if (o.note) o.note.hidden = !out;
    });
  });
  /* year ticks, thinned on narrow screens */
  axis.innerHTML = '';
  var y0 = new Date(RNG.min).getUTCFullYear(), y1 = new Date(RNG.max).getUTCFullYear();
  var span = y1 - y0, step = span > 6 && axis.clientWidth < 560 ? 2 : 1;
  for (var y = y0; y <= y1; y++) {
    var t = utc(y, 1, 1); if (t < RNG.min || t > RNG.max) continue;
    if (span > 6 && step === 2 && (y - y0) % 2) continue;
    var i = document.createElement('i'); i.textContent = y; i.style.left = (pct(t) * 100).toFixed(2) + '%'; axis.appendChild(i);
  }
  body.style.setProperty('--mstep', (RNG.grid / (RNG.max - RNG.min) * 100).toFixed(3) + '%');
  body.style.setProperty('--t', pct(TODAY).toFixed(4));
  range.max = Math.max(1, Math.round((RNG.max - RNG.min) / WEEK));
}

/* ---------- state: marker, filter, read-out ---------- */
var read = $('#tl-read'), range = $('#tl-range'), cards = $$('.role');
var fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
var p = 1, anim = 0, touched = false;
range.min = 0;

function matches(tags) { var f = FILTERS[filter]; return !f || (tags && tags.indexOf(f) > -1); }
function activeAt(t) { return ITEMS.filter(function (it) { return it.from && t >= it.from && t <= (it.to === null ? Infinity : it.to); }); }

function paint() {
  var t = RNG.min + p * (RNG.max - RNG.min), act = activeAt(t), ids = act.map(function (r) { return r.id; });
  body.style.setProperty('--p', p.toFixed(4));
  range.value = Math.round(p * range.max);
  ITEMS.forEach(function (it) {
    var r = rowEls[it.id].row;
    r.classList.toggle('on', ids.indexOf(it.id) > -1);
    r.classList.toggle('off', !matches(it.tags));
  });
  cards.forEach(function (c) {
    var tags = (c.getAttribute('data-tags') || '').split(' '), id = c.getAttribute('data-role');
    var scrubbed = touched && ids.length > 0 && ids.indexOf(id) === -1;
    c.classList.toggle('dim', scrubbed || !matches(tags));
  });
  var d = fmt.format(new Date(t)), isToday = Math.abs(t - TODAY) < DAY;
  var yr = new Date(t).getUTCFullYear();
  var marks = [];
  ITEMS.forEach(function (it) { (it.ms || []).forEach(function (m) { if (m.year === yr) marks.push(m.text); }); });
  var txt = act.length ? 'Active: ' + act.map(function (r) { return r.name; }).join(' and ') + '.' : 'Nothing active on this date.';
  read.innerHTML = '<b></b> <span></span>';
  $('b', read).textContent = d + (isToday ? ' (today)' : '');
  $('span', read).textContent = txt + (marks.length ? ' In ' + yr + ': ' + marks.filter(function (v, i, a) { return a.indexOf(v) === i; }).join('; ') + '.' : '');
  range.setAttribute('aria-valuetext', d + '. ' + txt);
}
function apply(np) { p = Math.max(0, Math.min(1, np)); paint(); }

/* ---------- pointer: drag the marker from empty track space ---------- */
function fromPointer(e) { var r = $('.tl-track', body).getBoundingClientRect(); return (e.clientX - r.left) / r.width; }
var dragging = false;
body.addEventListener('pointerdown', function (e) {
  if (e.target.closest('.tl-bar, .tl-ms')) return;
  touched = true; dragging = true; cancelAnimationFrame(anim); body.setPointerCapture(e.pointerId); apply(fromPointer(e));
});
body.addEventListener('pointermove', function (e) { if (dragging) apply(fromPointer(e)); });
body.addEventListener('pointerup', function () { dragging = false; });
body.addEventListener('pointercancel', function () { dragging = false; });
range.addEventListener('input', function () { touched = true; cancelAnimationFrame(anim); apply(range.value / range.max); });
range.addEventListener('focus', function () { body.classList.add('focus'); });

/* ---------- details on hover and focus ---------- */
function showTip(target, html) {
  tip.innerHTML = html; tip.hidden = false;
  var r = target.getBoundingClientRect(), w = tip.offsetWidth;
  var x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, r.left + r.width / 2));
  tip.style.left = x + 'px'; tip.style.top = r.top + 'px';
}
function hideTip() { tip.hidden = true; }
function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
ITEMS.forEach(function (it) {
  var el = rowEls[it.id];
  if (el.bar) {
    var open = function () { showTip(el.bar, '<b>' + esc(it.name) + '</b>' + esc(it.label) + '<br>' + esc(it.when) + ' &middot; ' + dur(it.from, it.to === null ? TODAY : it.to)); };
    el.bar.addEventListener('pointerenter', open); el.bar.addEventListener('focus', open);
    el.bar.addEventListener('pointerleave', hideTip); el.bar.addEventListener('blur', hideTip);
    el.bar.addEventListener('click', function () {
      touched = true; cancelAnimationFrame(anim);
      var end = endOf(it), a = Math.max(it.from, RNG.min), b = Math.min(end, RNG.max);
      apply(pct((a + b) / 2));
      var card = $('.role[data-role="' + it.id + '"]');
      if (card) {
        card.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
        card.classList.add('pop'); setTimeout(function () { card.classList.remove('pop'); }, 1400);
      }
    });
  }
  el.ms.forEach(function (o) {
    var open = function () { showTip(o.el, '<b>' + o.m.year + '</b>' + esc(o.m.text)); };
    o.el.addEventListener('pointerenter', open); o.el.addEventListener('focus', open);
    o.el.addEventListener('pointerleave', hideTip); o.el.addEventListener('blur', hideTip);
    o.el.addEventListener('click', function () { touched = true; cancelAnimationFrame(anim); apply(pct(o.m.at)); });
  });
});
addEventListener('scroll', hideTip, { passive: true });

/* ---------- filters and zoom ---------- */
function toggleGroup(sel, attr, onPick) {
  $$(sel + ' button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$(sel + ' button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      onPick(b.getAttribute(attr));
    });
  });
}
toggleGroup('#tl-filters', 'data-f', function (v) { filter = v; paint(); });
toggleGroup('#tl-zoom', 'data-z', function (v) {
  var tNow = RNG.min + p * (RNG.max - RNG.min);
  view = v; layout();
  p = Math.max(0, Math.min(1, (tNow - RNG.min) / (RNG.max - RNG.min))); paint();
});

/* ---------- play it through, jump to today ---------- */
function sweep() {
  touched = true;
  if (RM) { apply(pct(Math.min(TODAY, RNG.max))); return; }
  cancelAnimationFrame(anim);
  var from = 0, to = pct(Math.min(TODAY, RNG.max)), t0 = performance.now(), dur2 = 7000;
  (function f(n) {
    var k = Math.min(1, (n - t0) / dur2), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    apply(from + (to - from) * e);
    if (k < 1) anim = requestAnimationFrame(f);
  })(t0);
}
$('#tl-play').addEventListener('click', sweep);
$('#tl-now').addEventListener('click', function () { touched = true; cancelAnimationFrame(anim); apply(pct(Math.min(TODAY, RNG.max))); });

/* click a role card to jump to the middle of its run */
cards.forEach(function (c) {
  c.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    touched = true;
    var it = ITEMS.filter(function (x) { return x.id === c.getAttribute('data-role'); })[0];
    var end = endOf(it), a = Math.max(it.from, RNG.min), b = Math.min(end, RNG.max);
    cancelAnimationFrame(anim); apply(pct((a + b) / 2));
  });
});

var rz = 0; addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(layout, 120); });
layout(); p = pct(Math.min(TODAY, RNG.max)); paint();
})();
