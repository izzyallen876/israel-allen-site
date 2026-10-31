/* scene-plumb.js: the home hero.
   A cobalt sky, one red sun, a road that runs to a tower, and the text-drawn crystal
   floating in front of the sun. Everything is drawn in code. */
(function () {
"use strict";
var G = window.GX; if (!G) return;
var $ = G.$;
if (!$('#plumb')) return;
var RM = G.RM, clamp = G.clamp, lerp = G.lerp, hash = G.hash;
var GlyphScreen = G.GlyphScreen, ramp3 = G.ramp3, dprCanvas = G.dprCanvas;
var PGD = G.PGD;
var DARK = G.theme.dark;

/* ---------- 1. the scene (sky, sun, dunes, road, tower) ---------- */
var sceneC = $('#grid'), hero = $('.hero'), wrap = $('.plumbwrap');
var layer = document.createElement('canvas'), built = '', geo = null;

var PAL = {
  night: { sky: ['#02030f', '#08165a', '#2563d9'], star: 230, dune1: '#0b1030', dune2: '#060a22', road: '#0a0c1c', edge: 'rgba(246,239,214,.35)', tower: '#02030a', glow: 'rgba(120,190,255,.55)' },
  day:   { sky: ['#0a14a0', '#1f46d8', '#86b6f2'], star: 70,  dune1: '#a07038', dune2: '#5f4122', road: '#23253a', edge: 'rgba(246,239,214,.55)', tower: '#0a1150', glow: 'rgba(255,246,214,.6)' }
};

function buildScene(o) {
  var w = o.w, h = o.h, d = Math.min(2, window.devicePixelRatio || 1), P = DARK ? PAL.night : PAL.day;
  var key = [w, h, DARK].join('|'); if (key === built) return; built = key;
  layer.width = Math.round(w * d); layer.height = Math.round(h * d);
  var g = layer.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);

  var hr = hero.getBoundingClientRect(), pr = wrap.getBoundingClientRect();
  var cx = pr.width ? pr.left - hr.left + pr.width / 2 : w / 2;
  var cy = pr.height ? pr.top - hr.top + pr.height / 2 : h * 0.34;
  var R = Math.max(60, (pr.width || w * .5) * 0.36);
  var hy = Math.min(h * 0.78, Math.max(h * 0.62, cy + R * 0.6)), curve = h * 0.022, vx = w / 2, vy = hy - curve, i, x, y;
  geo = { hy: hy, vy: vy, vx: vx, w: w, h: h, cx: cx, cy: cy, R: R };

  /* sky */
  var sg = g.createLinearGradient(0, 0, 0, hy);
  sg.addColorStop(0, P.sky[0]); sg.addColorStop(.55, P.sky[1]); sg.addColorStop(1, P.sky[2]);
  g.fillStyle = sg; g.fillRect(0, 0, w, hy + 2);

  /* stars */
  for (i = 0; i < P.star; i++) {
    x = hash(i, 1, 7) * w; y = Math.pow(hash(i, 2, 7), 1.5) * hy * .96;
    g.globalAlpha = .35 + hash(i, 3, 7) * .65; g.fillStyle = '#f6efd6';
    g.beginPath(); g.arc(x, y, .5 + hash(i, 4, 7) * 1.1, 0, G.TAU); g.fill();
  }
  g.globalAlpha = 1;

  /* sun: glow, halftone ring, disc */
  var gl = g.createRadialGradient(cx, cy, R * .6, cx, cy, R * 3.2);
  gl.addColorStop(0, 'rgba(255,110,60,.60)'); gl.addColorStop(1, 'rgba(255,110,60,0)');
  g.fillStyle = gl; g.fillRect(0, 0, w, hy);
  var s = Math.max(7, R * .075), r1 = R * 1.04, r2 = R * 2.2, dx, dy, dist, k;
  g.fillStyle = 'rgba(255,170,90,.8)';
  for (y = cy - r2; y <= cy + r2; y += s) {
    for (x = cx - r2 + ((Math.round((y - cy) / s) & 1) ? s / 2 : 0); x <= cx + r2; x += s) {
      dx = x - cx; dy = y - cy; dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r1 || dist > r2 || y > hy) continue;
      k = 1 - (dist - r1) / (r2 - r1);
      g.beginPath(); g.arc(x, y, s * .46 * Math.pow(k, 1.15), 0, G.TAU); g.fill();
    }
  }
  var sd = g.createRadialGradient(cx - R * .25, cy - R * .3, R * .1, cx, cy, R);
  sd.addColorStop(0, '#ff8a4a'); sd.addColorStop(.6, '#ff4a24'); sd.addColorStop(1, '#d92a14');
  g.fillStyle = sd; g.beginPath(); g.arc(cx, cy, R, 0, G.TAU); g.fill();

  /* horizon glow and land */
  var hg = g.createLinearGradient(0, hy - h * .09, 0, hy);
  hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, P.glow);
  g.fillStyle = hg; g.fillRect(0, hy - h * .09, w, h * .09 + curve);
  g.fillStyle = P.dune2;
  g.beginPath(); g.moveTo(0, hy + curve); g.quadraticCurveTo(w / 2, hy - curve * 1.4, w, hy + curve); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();

  /* far dunes then near dunes, either side of the road */
  function dune(base, amp, freq, ph, col, side) {
    g.fillStyle = col; g.beginPath(); g.moveTo(side < 0 ? 0 : w, h);
    var steps = 40, t, px, py;
    for (i = 0; i <= steps; i++) {
      t = i / steps; px = side < 0 ? t * w * .5 : w - t * w * .5;
      py = base - Math.sin(t * freq + ph) * amp - t * amp * .6 * (1 - t) - (1 - t) * amp * 1.4;
      g.lineTo(px, py);
    }
    g.lineTo(w / 2, h); g.closePath(); g.fill();
  }
  dune(hy + h * .05, h * .028, 5.2, 0.4, P.dune1, -1); dune(hy + h * .05, h * .028, 5.2, 1.7, P.dune1, 1);
  dune(hy + h * .17, h * .05, 3.4, 1.1, P.dune2, -1); dune(hy + h * .17, h * .05, 3.4, 2.6, P.dune2, 1);

  /* road */
  var hw = w * .46;
  g.fillStyle = P.road; g.beginPath(); g.moveTo(vx - 2, vy); g.lineTo(vx + 2, vy); g.lineTo(vx + hw, h); g.lineTo(vx - hw, h); g.closePath(); g.fill();
  g.strokeStyle = P.edge; g.lineWidth = 2;
  g.beginPath(); g.moveTo(vx - 2, vy); g.lineTo(vx - hw * .96, h); g.moveTo(vx + 2, vy); g.lineTo(vx + hw * .96, h); g.stroke();

  /* tower at the end of the road, with a warm doorway */
  var tw = Math.max(16, w * .03), th = Math.max(46, Math.min(h * .15, w * .42)), tx = vx - tw / 2, ty = vy - th + 2;
  g.fillStyle = P.tower;
  g.fillRect(tx, ty, tw, th);
  for (i = 0; i < 4; i++) g.fillRect(tx + i * (tw / 3.4), ty - th * .05, tw / 7, th * .05);
  var aw = tw * .5, ah = th * .58, ax = vx - aw / 2, ay = vy - ah;
  var dg = g.createLinearGradient(0, ay, 0, vy); dg.addColorStop(0, '#ffd27a'); dg.addColorStop(1, '#ff6a3a');
  g.fillStyle = dg; g.beginPath(); g.moveTo(ax, vy); g.lineTo(ax, ay + aw / 2); g.arc(vx, ay + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, vy); g.closePath(); g.fill();
}

function drawScene(t) {
  var o = dprCanvas(sceneC), g = o.g, w = o.w, h = o.h;
  if (!w || !h) return;
  buildScene(o);
  g.clearRect(0, 0, w, h);
  g.drawImage(layer, 0, 0, w, h);
  if (!geo) return;
  /* road dashes run toward you */
  var N = 11, off = (t * .22) % 1, i, p0, p1, y0, y1, w0, w1, vx = geo.vx, vy = geo.vy, H = h - vy;
  g.fillStyle = '#ffc61a';
  for (i = 0; i < N; i++) {
    p0 = (i + off) / N; p1 = p0 + .5 / N;
    y0 = vy + H * Math.pow(p0, 2.6); y1 = vy + H * Math.pow(Math.min(1, p1), 2.6);
    w0 = .6 + 11 * Math.pow(p0, 2.6); w1 = .6 + 11 * Math.pow(Math.min(1, p1), 2.6);
    g.beginPath(); g.moveTo(vx - w0 / 2, y0); g.lineTo(vx + w0 / 2, y0); g.lineTo(vx + w1 / 2, y1); g.lineTo(vx - w1 / 2, y1); g.closePath(); g.fill();
  }
  /* a few stars twinkle */
  g.fillStyle = '#fff6e0';
  for (i = 0; i < 18; i++) {
    var sx = hash(i, 9, 3) * w, sy = Math.pow(hash(i, 8, 3), 1.5) * geo.hy * .9, a = .5 + .5 * Math.sin(t * (1 + hash(i, 7, 3) * 2) + i * 2);
    g.globalAlpha = a * .9;
    g.fillRect(sx - 4, sy - .5, 8, 1); g.fillRect(sx - .5, sy - 4, 1, 8);
  }
  g.globalAlpha = 1;
}

/* ---------- 2. the crystal ---------- */
var PL = {S:null};
var mx = 0, my = 0;
window.addEventListener('pointermove', function(e){ mx = e.clientX/innerWidth - .5; my = e.clientY/innerHeight - .5; });
function norm3(v){ var l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l,v[1]/l,v[2]/l]; }
function cross3(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
var LIGHT = norm3([-0.5,-0.7,0.8]), HALFV = norm3([LIGHT[0],LIGHT[1],LIGHT[2]+1]);

function renderPlumb(t){
  var S = PL.S; if(!S || !S.ready) return;
  var cols = S.cols, rows = S.rows, half = cols*S.cw/2, midY = rows*S.ch/2;
  var Hh = 0.80, Rr = 0.44, bob = Math.sin(t*1.3)*0.035;
  var rot = t*0.9 + mx*2.2, tilt = Math.sin(t*.7)*.1 + mx*.22, ct = Math.cos(tilt), st = Math.sin(tilt);
  function tf(x,y,z){ return [x*ct - y*st, x*st + y*ct + bob, z]; }
  var T = tf(0,-Hh,0), Bm = tf(0,Hh,0), E = [], k;
  for(k=0;k<4;k++){ var a = rot + k*Math.PI/2; E.push(tf(Rr*Math.cos(a), 0, Rr*Math.sin(a))); }
  var faces = [];
  for(k=0;k<4;k++){ faces.push([T,E[k],E[(k+1)%4]]); faces.push([Bm,E[(k+1)%4],E[k]]); }
  var F = faces.map(function(f){
    var a = f[0], b = f[1], c = f[2];
    var nn = norm3(cross3([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    if(nn[2] < 0) nn = [-nn[0],-nn[1],-nn[2]];
    var dif = Math.max(0, nn[0]*LIGHT[0]+nn[1]*LIGHT[1]+nn[2]*LIGHT[2]);
    var spc = Math.pow(Math.max(0, nn[0]*HALFV[0]+nn[1]*HALFV[1]+nn[2]*HALFV[2]), 18);
    var rim = (1 - Math.abs(nn[2]))*.35;
    var den = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
    return {a:a,b:b,c:c,den:den,shade:Math.min(1, .18 + dif*.7 + spc*.6 + rim)};
  });
  var r, c, x, y, j, fc, l1, l2, l3, z, m, zF, sF, zB, sB, edge, hit, v, gi, q, i = 0, col = [0,0,0];
  var tq = Math.floor(t*1.6);
  for(r=0;r<rows;r++){
    y = ((r+.5)*S.ch - midY)/half;
    for(c=0;c<cols;c++,i++){
      x = ((c+.5)*S.cw - half)/half;
      zF = -1e9; sF = 0; zB = -1e9; sB = 0; edge = 0; hit = 0; gi = 0;
      for(j=0;j<8;j++){
        fc = F[j]; if(Math.abs(fc.den) < 1e-9) continue;
        l1 = ((fc.b[1]-fc.c[1])*(x-fc.c[0]) + (fc.c[0]-fc.b[0])*(y-fc.c[1]))/fc.den;
        l2 = ((fc.c[1]-fc.a[1])*(x-fc.c[0]) + (fc.a[0]-fc.c[0])*(y-fc.c[1]))/fc.den;
        l3 = 1 - l1 - l2;
        if(l1 >= 0 && l2 >= 0 && l3 >= 0){
          z = l1*fc.a[2] + l2*fc.b[2] + l3*fc.c[2]; hit++;
          m = Math.min(l1,l2,l3);
          if(z > zF){ zB = zF; sB = sF; zF = z; sF = fc.shade; edge = m < .035 ? 1 : 0; }
          else if(z > zB){ zB = z; sB = fc.shade; }
        }
      }
      if(hit){
        v = Math.min(1, sF*.78 + (zB > -1e8 ? sB*.28 : 0) + edge*.28);
        gi = clamp(Math.round(Math.pow(v,.9)*14)+1, 1, 15);
        ramp3(PGD, v, col);
      } else {
        q = hash(c, r, tq + (c>>3));
        if(q > .994) gi = 5; else if(q > .985) gi = 1;
        if(gi){ col[0] = 255; col[1] = 226; col[2] = 170; }
      }
      S.I[i] = gi; S.R[i] = col[0]; S.G[i] = col[1]; S.B[i] = col[2];
    }
  }
  S.draw(null, .55, .5);
}

/* ---------- layout and loop ---------- */
PL.S = GlyphScreen($('#plumb'), {aspect:1.0, cellPx:6.2, minCols:56, maxCols:120});
function renderAllStatic() { built = ''; drawScene(0); renderPlumb(0); }
function resizeAll() { PL.S.resize(); built = ''; if (RM) renderAllStatic(); }
G.onTheme(function (t) { DARK = t.dark; built = ''; if (RM) renderAllStatic(); });
var rzT = 0;
window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(resizeAll, 120); });
window.addEventListener('load', resizeAll);
var heroVisible = true;
new IntersectionObserver(function (es) { es.forEach(function (e) { heroVisible = e.isIntersecting; }); }).observe(hero);
resizeAll();
var lastP = 0;
function loop(ts) {
  var t = ts / 1000;
  if (heroVisible && !document.hidden) { drawScene(t); if (ts - lastP > 33) { lastP = ts; renderPlumb(t); } }
  requestAnimationFrame(loop);
}
if (!RM) requestAnimationFrame(loop);
})();
