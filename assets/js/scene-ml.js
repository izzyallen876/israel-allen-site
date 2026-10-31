/* scene-ml.js: a tiny neural network that trains in the page.
   Two inputs, one hidden layer of tanh units, one sigmoid output, trained on the points
   you place with full-batch Adam. Written from scratch; no libraries, no network requests. */
(function () {
"use strict";
var cv = document.getElementById('ml-canvas'); if (!cv) return;
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s) { return document.querySelector(s); };
var ctx = cv.getContext('2d');
var BLUE = [53, 80, 232], RED = [232, 52, 28], BASE = [13, 18, 54];

/* ---------- data ---------- */
var pts = [];                  /* {x, y, c}  x,y in -1..1, c 0 = blue, 1 = red */
var addClass = 0;
var seed = 7;
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); }
var SETS = {
  blobs: function () { var a = []; for (var i = 0; i < 40; i++) { a.push({ x: -.5 + gauss() * .2, y: -.4 + gauss() * .2, c: 0 }); a.push({ x: .5 + gauss() * .2, y: .45 + gauss() * .2, c: 1 }); } return a; },
  moons: function () { var a = []; for (var i = 0; i < 60; i++) { var t = Math.PI * i / 59; a.push({ x: (Math.cos(t) - .5) * .62 + gauss() * .045, y: (Math.sin(t) - .25) * 1.1 + gauss() * .045, c: 0 }); a.push({ x: (1 - Math.cos(t) - .5) * .62 + gauss() * .045, y: (.5 - Math.sin(t) - .25) * 1.1 + gauss() * .045, c: 1 }); } return a; },
  circles: function () { var a = []; for (var i = 0; i < 60; i++) { var t = 2 * Math.PI * rnd(); a.push({ x: Math.cos(t) * .28 + gauss() * .05, y: Math.sin(t) * .28 + gauss() * .05, c: 0 }); t = 2 * Math.PI * rnd(); a.push({ x: Math.cos(t) * .75 + gauss() * .05, y: Math.sin(t) * .75 + gauss() * .05, c: 1 }); } return a; },
  spiral: function () { var a = []; for (var i = 0; i < 70; i++) { var r = .08 + .85 * i / 69, t = 3.4 * i / 69 * Math.PI; a.push({ x: r * Math.cos(t) + gauss() * .03, y: r * Math.sin(t) + gauss() * .03, c: 0 }); a.push({ x: -r * Math.cos(t) + gauss() * .03, y: -r * Math.sin(t) + gauss() * .03, c: 1 }); } return a; },
  xor: function () { var a = []; for (var i = 0; i < 30; i++) { [[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]].forEach(function (q) { a.push({ x: q[0] * (.15 + .6 * rnd()), y: q[1] * (.15 + .6 * rnd()), c: q[2] }); }); } return a; }
};

/* ---------- the network ---------- */
var H = 8, lr = .04, P, M, V, T, epoch = 0, loss = 0, acc = 0;
function sig(z) { return 1 / (1 + Math.exp(-z)); }
function initNet() {
  H = +$('#ml-h').value; P = new Float64Array(4 * H + 1); M = new Float64Array(P.length); V = new Float64Array(P.length); T = 0; epoch = 0;
  for (var h = 0; h < H; h++) { P[4 * h] = gauss() * .9; P[4 * h + 1] = gauss() * .9; P[4 * h + 2] = gauss() * .2; P[4 * h + 3] = gauss() * .5; }
  loss = 0; acc = 0;
}
function predict(x, y) {
  var s = P[4 * H], h, z;
  for (h = 0; h < H; h++) { z = P[4 * h] * x + P[4 * h + 1] * y + P[4 * h + 2]; s += P[4 * h + 3] * Math.tanh(z); }
  return sig(s);
}
var G = new Float64Array(1), A = new Float64Array(1);
function step() {
  var n = pts.length; if (!n) return;
  if (G.length !== P.length) { G = new Float64Array(P.length); A = new Float64Array(H); }
  G.fill(0); loss = 0; var ok = 0, i, h, p, a, z, err, dz, pt;
  for (i = 0; i < n; i++) {
    pt = pts[i]; var s = P[4 * H];
    for (h = 0; h < H; h++) { z = P[4 * h] * pt.x + P[4 * h + 1] * pt.y + P[4 * h + 2]; A[h] = Math.tanh(z); s += P[4 * h + 3] * A[h]; }
    p = sig(s); err = p - pt.c;
    loss += -(pt.c ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9)); if ((p > .5) === (pt.c === 1)) ok++;
    G[4 * H] += err;
    for (h = 0; h < H; h++) {
      G[4 * h + 3] += err * A[h]; dz = err * P[4 * h + 3] * (1 - A[h] * A[h]);
      G[4 * h] += dz * pt.x; G[4 * h + 1] += dz * pt.y; G[4 * h + 2] += dz;
    }
  }
  T++; var b1 = .9, b2 = .999, c1 = 1 - Math.pow(b1, T), c2 = 1 - Math.pow(b2, T), g;
  for (i = 0; i < P.length; i++) {
    g = G[i] / n; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g;
    P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
  }
  loss /= n; acc = ok / n; epoch++;
}

/* ---------- drawing ---------- */
var N = 44, field = document.createElement('canvas'); field.width = field.height = N;
var fctx = field.getContext('2d'), fimg = fctx.createImageData(N, N), S = 300, dpr = 1;
function size() {
  var host = cv.parentElement, w = host.clientWidth; if (!w) return;
  dpr = Math.min(2, window.devicePixelRatio || 1); S = w;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr); cv.style.width = cv.style.height = w + 'px';
}
function toPx(v) { return (v + 1) / 2 * S; }
function draw() {
  var i, j, k = 0, p, conf, a, d = fimg.data, c;
  for (j = 0; j < N; j++) for (i = 0; i < N; i++, k += 4) {
    p = pts.length ? predict((i + .5) / N * 2 - 1, (j + .5) / N * 2 - 1) : .5;
    conf = Math.abs(2 * p - 1); a = .18 + .62 * conf;
    for (c = 0; c < 3; c++) d[k + c] = Math.round(BASE[c] * (1 - a) + (BLUE[c] + (RED[c] - BLUE[c]) * p) * a);
    d[k + 3] = 255;
  }
  fctx.putImageData(fimg, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(field, 0, 0, S, S);
  /* axes */
  ctx.strokeStyle = 'rgba(246,239,214,.14)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  /* points */
  for (i = 0; i < pts.length; i++) {
    ctx.beginPath(); ctx.arc(toPx(pts[i].x), toPx(pts[i].y), Math.max(4, S / 70), 0, Math.PI * 2);
    ctx.fillStyle = pts[i].c ? '#ff5a3a' : '#6f87ff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#f6efd6'; ctx.stroke();
  }
}
var statsEl = $('#ml-stats'), liveEl = $('#ml-live');
function stats() {
  statsEl.textContent = pts.length
    ? 'points ' + pts.length + '\nsteps ' + epoch + '\nloss ' + loss.toFixed(3) + '\naccuracy ' + Math.round(acc * 100) + '%'
    : 'Load a shape or click the board to add points.';
  statsEl.style.whiteSpace = 'pre-line';
}

/* ---------- loop ---------- */
var running = false, raf = 0;
function frame() {
  if (running) { for (var k = 0; k < (RM ? 2 : 6); k++) step(); stats(); }
  draw();
  if (running) raf = requestAnimationFrame(frame);
}
function setRunning(v) {
  running = v; var b = $('#ml-train'); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.textContent = v ? 'Pause' : 'Train';
  cancelAnimationFrame(raf);
  if (v) { if (!pts.length) { setRunning(false); return; } raf = requestAnimationFrame(frame); }
  else { frame(); liveEl.textContent = 'Paused after ' + epoch + ' steps. Accuracy ' + Math.round(acc * 100) + ' percent on ' + pts.length + ' points.'; }
}
function redraw() { stats(); draw(); }

/* ---------- controls ---------- */
function load(name) { seed = 11; pts = SETS[name](); pts = pts.filter(function (p) { return Math.abs(p.x) < .98 && Math.abs(p.y) < .98; }); initNet(); setRunning(false); liveEl.textContent = 'Loaded ' + name + ' with ' + pts.length + ' points. Press Train.'; redraw(); }
Array.prototype.forEach.call(document.querySelectorAll('[data-set]'), function (b) { b.addEventListener('click', function () { load(b.getAttribute('data-set')); }); });
function pick(c) { addClass = c; $('#ml-a').setAttribute('aria-pressed', c === 0 ? 'true' : 'false'); $('#ml-b').setAttribute('aria-pressed', c === 1 ? 'true' : 'false'); }
$('#ml-a').addEventListener('click', function () { pick(0); });
$('#ml-b').addEventListener('click', function () { pick(1); });
$('#ml-rand').addEventListener('click', function () { for (var i = 0; i < 10; i++) pts.push({ x: rnd() * 1.8 - .9, y: rnd() * 1.8 - .9, c: addClass }); redraw(); });
$('#ml-train').addEventListener('click', function () { setRunning(!running); });
$('#ml-reset').addEventListener('click', function () { initNet(); redraw(); liveEl.textContent = 'Network reset.'; });
$('#ml-clear').addEventListener('click', function () { pts = []; setRunning(false); initNet(); redraw(); liveEl.textContent = 'All points cleared.'; });
$('#ml-h').addEventListener('input', function () { $('#ml-h-out').textContent = this.value; initNet(); redraw(); });
$('#ml-lr').addEventListener('input', function () { lr = +this.value / 200; $('#ml-lr-out').textContent = lr.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0'); });
cv.addEventListener('pointerdown', function (e) {
  if (pts.length >= 400) return;
  var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
  pts.push({ x: x, y: y, c: e.shiftKey ? 1 - addClass : addClass });
  if (!running) redraw();
});
var rz = 0; addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { size(); draw(); }, 100); });

size(); initNet(); lr = +$('#ml-lr').value / 200; load('moons');
})();
