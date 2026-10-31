/* work.js: scrub a timeline from December 2024 to now and see which roles were active. */
(function () {
"use strict";
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var body = $('#tl-body'); if (!body) return;

var DAY = 86400000;
function utc(y, m, d) { return Date.UTC(y, m - 1, d); }
var now = new Date(); var TODAY = utc(now.getFullYear(), now.getMonth() + 1, now.getDate());
var MIN = utc(2024, 12, 1);
var endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
var MAX = Math.max(utc(2026, 12, 31), utc(endOfMonth.getFullYear(), endOfMonth.getMonth() + 1, endOfMonth.getDate()));

/* the roles; "to: null" means still going */
var ROLES = [
  { id: 'chuter',    name: 'Chuter Lab',       from: utc(2026, 8, 1),  to: null },
  { id: 'evergreen', name: 'Evergreen AI',     from: utc(2026, 5, 1),  to: null },
  { id: 'hasrp',     name: 'Historical Accountability', from: utc(2026, 5, 1),  to: utc(2026, 8, 31) },
  { id: 'fieldlab',  name: 'Political Violence FieldLab', from: utc(2024, 12, 1), to: utc(2025, 12, 31) }
];
function pct(t) { return Math.max(0, Math.min(1, (t - MIN) / (MAX - MIN))); }

/* build rows */
var axis = $('#tl-axis-track'), rowsHost = $('#tl-rows');
ROLES.forEach(function (r) {
  var end = r.to === null ? Math.min(TODAY, MAX) : r.to;
  var row = document.createElement('div'); row.className = 'tl-row'; row.setAttribute('data-role', r.id);
  row.innerHTML = '<span class="tl-name"></span><div class="tl-track"><i class="tl-bar"></i></div>';
  $('.tl-name', row).textContent = r.name;
  var bar = $('.tl-bar', row);
  bar.style.left = (pct(r.from) * 100).toFixed(2) + '%';
  bar.style.width = Math.max(.8, (pct(end) - pct(r.from)) * 100).toFixed(2) + '%';
  rowsHost.appendChild(row);
});
/* year ticks */
[2025, 2026, 2027].forEach(function (y) {
  var t = utc(y, 1, 1); if (t <= MIN || t >= MAX) return;
  var i = document.createElement('i'); i.textContent = y; i.style.left = (pct(t) * 100).toFixed(2) + '%'; axis.appendChild(i);
});

var read = $('#tl-read'), range = $('#tl-range'), cards = $$('.role');
var fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
var p = pct(Math.min(TODAY, MAX)), anim = 0, touched = false;   /* roles only dim once someone uses the timeline */
range.min = 0; range.max = 1000;

function activeAt(t) {
  return ROLES.filter(function (r) { var end = r.to === null ? Infinity : r.to; return t >= r.from && t <= end; });
}
function apply(np, announce) {
  p = Math.max(0, Math.min(1, np));
  var t = MIN + p * (MAX - MIN);
  body.style.setProperty('--p', p.toFixed(4));
  range.value = Math.round(p * 1000);
  var act = activeAt(t), ids = act.map(function (r) { return r.id; });
  $$('.tl-row').forEach(function (row) { row.classList.toggle('on', ids.indexOf(row.getAttribute('data-role')) > -1); });
  cards.forEach(function (c) { c.classList.toggle('dim', touched && ids.length > 0 && ids.indexOf(c.getAttribute('data-role')) === -1); });
  var d = fmt.format(new Date(t));
  var txt = act.length ? act.map(function (r) { return r.name; }).join(' and ') : 'No role on this date. This is before the first one starts.';
  read.innerHTML = '<b></b> <span></span>';
  $('b', read).textContent = d + (Math.abs(t - TODAY) < DAY ? ' (today)' : '');
  $('span', read).textContent = act.length ? 'Active: ' + txt : txt;
  range.setAttribute('aria-valuetext', d + '. ' + (act.length ? 'Active: ' + txt : 'No role'));
}
function fromPointer(e) {
  var r = $('.tl-track', body).getBoundingClientRect();
  return (e.clientX - r.left) / r.width;
}
var dragging = false;
body.addEventListener('pointerdown', function (e) { touched = true; dragging = true; cancelAnimationFrame(anim); body.setPointerCapture(e.pointerId); apply(fromPointer(e)); });
body.addEventListener('pointermove', function (e) { if (dragging) apply(fromPointer(e)); });
body.addEventListener('pointerup', function () { dragging = false; });
body.addEventListener('pointercancel', function () { dragging = false; });
range.addEventListener('input', function () { touched = true; cancelAnimationFrame(anim); apply(range.value / 1000); });
range.addEventListener('focus', function () { body.classList.add('focus'); });

function sweep() {
  touched = true;
  if (RM) { apply(pct(Math.min(TODAY, MAX))); return; }
  cancelAnimationFrame(anim);
  var from = 0, to = pct(Math.min(TODAY, MAX)), t0 = performance.now(), dur = 7000;
  (function f(n) {
    var k = Math.min(1, (n - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    apply(from + (to - from) * e);
    if (k < 1) anim = requestAnimationFrame(f);
  })(t0);
}
$('#tl-play').addEventListener('click', sweep);
$('#tl-now').addEventListener('click', function () { touched = true; cancelAnimationFrame(anim); apply(pct(Math.min(TODAY, MAX))); });

/* click a role to jump to the middle of its run */
cards.forEach(function (c) {
  c.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    touched = true;
    var r = ROLES.filter(function (x) { return x.id === c.getAttribute('data-role'); })[0];
    var end = r.to === null ? Math.min(TODAY, MAX) : r.to;
    cancelAnimationFrame(anim); apply(pct((r.from + end) / 2));
  });
});
apply(p);
})();
