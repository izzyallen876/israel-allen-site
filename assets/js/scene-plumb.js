(function () {
"use strict";
var G = window.GX; if (!G) return;
var $ = G.$;
if (!$('#plumb')) return;
var RM = G.RM, TAU = G.TAU, clamp = G.clamp, lerp = G.lerp, rad = G.rad, hash = G.hash;
var GlyphScreen = G.GlyphScreen, ramp3 = G.ramp3, dprCanvas = G.dprCanvas;
var INKP = G.INKP, GLOWP = G.GLOWP, PGD = G.PGD, PGL = G.PGL;
var DARK = G.theme.dark, GRIDC = G.theme.grid;

/* ---------- 1. retro grid ---------- */
var gridC = $('#grid');
function drawGrid(t){
  var o = dprCanvas(gridC), g = o.g, w = o.w, h = o.h, i, k;
  g.clearRect(0,0,w,h);
  var hy = h*0.6;
  g.strokeStyle = GRIDC; g.lineWidth = 1; g.globalAlpha = .5;
  var off = (t*0.25)%1;
  for(i=0;i<16;i++){
    var p = (i+off)/16, y = hy + (h-hy)*p*p*p;
    g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke();
  }
  for(k=-24;k<=24;k++){
    g.beginPath(); g.moveTo(w/2 + k*w*0.012, hy); g.lineTo(w/2 + k*w*0.14, h); g.stroke();
  }
  g.globalAlpha = .9;
  g.beginPath(); g.moveTo(0,hy); g.lineTo(w,hy); g.stroke();
  g.globalAlpha = 1;
}

/* ---------- 2. plumbob ---------- */
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
        if(DARK){ gi = Math.round(Math.pow(v,.9)*14)+1; ramp3(PGD, v, col); }
        else { gi = Math.round((.3 + .7*(1-v))*14)+1; ramp3(PGL, v, col); }
        gi = clamp(gi,1,15);
      } else {
        q = hash(c, r, tq + (c>>3));
        if(q > .994) gi = 5; else if(q > .985) gi = 1;
        if(gi){ col[0] = DARK?90:12; col[1] = DARK?255:120; col[2] = DARK?140:40; }
      }
      S.I[i] = gi; S.R[i] = col[0]; S.G[i] = col[1]; S.B[i] = col[2];
    }
  }
  S.draw(null, DARK ? .55 : 0, DARK ? .5 : 0);
}


/* ---------- layout and loop ---------- */
PL.S = GlyphScreen($('#plumb'), {aspect:1.0, cellPx:6.2, minCols:56, maxCols:120});
function renderAllStatic() { drawGrid(0); renderPlumb(0); }
function resizeAll() { PL.S.resize(); if (RM) renderAllStatic(); }
G.onTheme(function (t) { DARK = t.dark; GRIDC = t.grid; if (RM) renderAllStatic(); });
var rzT = 0;
window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(resizeAll, 120); });
window.addEventListener('load', resizeAll);
var heroVisible = true;
new IntersectionObserver(function (es) { es.forEach(function (e) { heroVisible = e.isIntersecting; }); }).observe($('.hero'));
resizeAll();
var lastP = 0;
function loop(ts) {
  var t = ts / 1000;
  if (heroVisible && !document.hidden) { drawGrid(t); if (ts - lastP > 33) { lastP = ts; renderPlumb(t); } }
  requestAnimationFrame(loop);
}
if (!RM) requestAnimationFrame(loop);
})();
