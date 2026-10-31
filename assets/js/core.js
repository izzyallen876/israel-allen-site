/* core.js: behaviour shared by every page except the film.
   No network requests, no cookies, no analytics. The only thing stored on your
   device is your light/dark choice ("ia-theme" in localStorage). */
(function () {
"use strict";
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var root = document.documentElement;
var EMAIL = 'israel.l.allen.28@dartmouth.edu';
var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

/* ---------- theme ---------- */
var themeBtn = $('#theme');
function isDark() {
  var th = root.getAttribute('data-theme');
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function setTheme(v) {
  root.setAttribute('data-theme', v);
  try { localStorage.setItem('ia-theme', v); } catch (e) {}
  document.dispatchEvent(new Event('themechange'));
}
if (themeBtn) themeBtn.addEventListener('click', function () { setTheme(isDark() ? 'light' : 'dark'); });

/* ---------- menu (small screens) ---------- */
var menuBtn = $('#menu'), nav = $('#nav');
if (menuBtn && nav) {
  menuBtn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); }
  });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });
}

/* ---------- text scramble (titles and numbers) ---------- */
var GLYPHS = '▓▒░#@%&*+=<>/\\|', DIGITS = '0123456789#%&+';
function scramble(el, final, dur, set) {
  set = set || GLYPHS;
  if (RM) { el.textContent = final; return; }
  var start = performance.now();
  (function f(n) {
    var p = Math.min(1, (n - start) / dur), s = '', i, ch;
    for (i = 0; i < final.length; i++) {
      ch = final.charAt(i);
      s += (ch === ' ' || ch === '\n' || ch === ',') ? ch : (i / final.length < p ? ch : set.charAt(Math.random() * set.length | 0));
    }
    el.textContent = s;
    if (p < 1) requestAnimationFrame(f);
  })(start);
}
$$('[data-scramble]').forEach(function (el) {
  var text = el.textContent;
  scramble(el, text, 1100);
  el.addEventListener('pointerenter', function () { scramble(el, text, 600); });
});
var counters = $$('[data-count]');
if (counters.length && 'IntersectionObserver' in window) {
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      scramble(e.target, e.target.getAttribute('data-final') || e.target.textContent, 1200, DIGITS);
    });
  }, { threshold: .6 });
  counters.forEach(function (el) { cio.observe(el); });
}

/* ---------- boxes that lock on when they scroll into view ---------- */
var locks = $$('.lock');
if (locks.length) {
  if (!('IntersectionObserver' in window) || RM) { locks.forEach(function (el) { el.classList.add('in'); }); }
  else {
    var lio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); lio.unobserve(e.target); } });
    }, { threshold: .15 });
    locks.forEach(function (el) { lio.observe(el); });
  }
}

/* ---------- tilt cards (mouse only) ---------- */
if (!RM && matchMedia('(hover: hover)').matches) {
  $$('[data-tilt]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      el.style.transform = 'rotateX(' + (-py * 9).toFixed(2) + 'deg) rotateY(' + (px * 11).toFixed(2) + 'deg) translateZ(8px)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  });
}

/* ---------- copy email ---------- */
var copyBtn = $('#copy');
if (copyBtn) {
  copyBtn.addEventListener('click', function () {
    var label = copyBtn.textContent;
    function done() { copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = label; }, 1600); }
    function fallback() { window.prompt('Copy my email address:', EMAIL); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(EMAIL).then(done, fallback);
    else fallback();
  });
}

/* ---------- mail composer: builds a draft in your own email app ---------- */
var comp = $('#composer');
if (comp) {
  var note = $('#composer-note');
  comp.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = comp.elements.yourname.value.trim(), from = comp.elements.from.value.trim(), msg = comp.elements.msg.value.trim();
    if (!msg) { comp.elements.msg.focus(); return; }
    var body = 'Hi Israel,\n\n' + msg + '\n\n' + (name || '') + (from ? '\n' + from : '');
    var url = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Hello from lukeanthony.co') + '&body=' + encodeURIComponent(body);
    if (url.length > 1900) {
      note.textContent = 'That message is long for a link. Copy it, then paste it into an email to ' + EMAIL + '.';
      return;
    }
    note.textContent = 'Opening a draft in your email app. If nothing opens, email ' + EMAIL + ' directly.';
    window.location.href = url;
  });
}

/* ---------- command console ---------- */
var PAGES = { home: 'index.html', about: 'about.html', work: 'work.html', projects: 'projects.html', resume: 'resume.html', lab: 'lab.html', film: 'film.html', contact: 'contact.html', privacy: 'privacy.html', terms: 'terms.html', accessibility: 'accessibility.html', credits: 'credits.html' };
var term = document.createElement('div');
term.id = 'term'; term.hidden = true;
term.innerHTML = '<div class="term-box" role="dialog" aria-modal="true" aria-label="Command console">' +
  '<div class="term-out" id="term-out" aria-live="polite"></div>' +
  '<label class="term-line"><span aria-hidden="true">&gt;</span><input id="term-in" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type a command, then press Enter"></label></div>';
document.body.appendChild(term);
var tout = $('#term-out'), tin = $('#term-in'), lastFocus = null, hist = [], hi = 0;
function say(text, cls) {
  var d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text; tout.appendChild(d); tout.scrollTop = tout.scrollHeight;
}
function openTerm() {
  if (!term.hidden) return;
  lastFocus = document.activeElement; term.hidden = false;
  if (!tout.childNodes.length) { say('ghost in the grid, console. type help.', 'd'); }
  tin.value = ''; tin.focus();
}
function closeTerm() { term.hidden = true; tin.blur(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
function go(page) { say('opening ' + page + '...', 'd'); setTimeout(function () { window.location.href = PAGES[page]; }, 220); }
function ext(url) { window.open(url, '_blank', 'noopener'); }
var CMDS = {
  help: function () { say('about  work  projects  resume  lab  film  contact  home\nprivacy  terms  accessibility  credits\nemail  github  linkedin  theme  whoami  ls  clear  exit\ntry: open lab', 'e'); },
  ls: function () { say(Object.keys(PAGES).join('   '), 'e'); },
  whoami: function () { say('israel allen. quantitative social science, dartmouth class of 2028. national triathlete, jamaica.', 'e'); },
  email: function () { say('opening your email app...', 'd'); window.location.href = 'mailto:' + EMAIL; },
  github: function () { ext('https://github.com/izzyallen876'); say('opening github...', 'd'); },
  linkedin: function () { ext('https://www.linkedin.com/in/israel-allen'); say('opening linkedin...', 'd'); },
  theme: function (a) {
    var v = a === 'light' || a === 'dark' ? a : (isDark() ? 'light' : 'dark');
    setTheme(v); say('theme: ' + v, 'e');
  },
  clear: function () { tout.innerHTML = ''; },
  exit: closeTerm,
  ghost: function () { say('boo.', 'e'); document.body.classList.add('glitch'); setTimeout(function () { document.body.classList.remove('glitch'); }, 1500); },
  sudo: function () { say('nice try. nothing here needs a password.', 'e'); }
};
function run(line) {
  var parts = line.trim().toLowerCase().split(/\s+/), cmd = parts[0], arg = parts[1];
  if (!cmd) return;
  say('> ' + line, 'd'); hist.push(line); hi = hist.length;
  if ((cmd === 'open' || cmd === 'cd' || cmd === 'go') && arg) { if (PAGES[arg]) go(arg); else say('no such page: ' + arg + '. try ls.', 'e'); return; }
  if (PAGES[cmd]) { go(cmd); return; }
  if (CMDS[cmd]) { CMDS[cmd](arg); return; }
  say('command not found: ' + cmd + '. try help.', 'e');
}
tin.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { run(tin.value); tin.value = ''; }
  else if (e.key === 'ArrowUp' && hist.length) { hi = Math.max(0, hi - 1); tin.value = hist[hi] || ''; e.preventDefault(); }
  else if (e.key === 'ArrowDown' && hist.length) { hi = Math.min(hist.length, hi + 1); tin.value = hist[hi] || ''; e.preventDefault(); }
  else if (e.key === 'Tab') { e.preventDefault(); }
});
term.addEventListener('pointerdown', function (e) { if (e.target === term) closeTerm(); });
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !term.hidden) { closeTerm(); return; }
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/' || e.key === '`') { e.preventDefault(); openTerm(); }
});
var tb = $('#term-btn'); if (tb) tb.addEventListener('click', openTerm);

/* ---------- print button (resume page) ---------- */
var pb = $('#print'); if (pb) pb.addEventListener('click', function () { window.print(); });
})();
