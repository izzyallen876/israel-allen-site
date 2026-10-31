(function () {
"use strict";
var G = window.GX; if (!G) return;
var $ = G.$;
if (!$('#hands')) return;
var RM = G.RM, TAU = G.TAU, clamp = G.clamp, lerp = G.lerp, rad = G.rad, hash = G.hash;
var GlyphScreen = G.GlyphScreen, ramp3 = G.ramp3, dprCanvas = G.dprCanvas;
var INKP = G.INKP, GLOWP = G.GLOWP, PGD = G.PGD, PGL = G.PGL;
var DARK = G.theme.dark, GRIDC = G.theme.grid;

/* ---------- 4. reaching hands ---------- */
var HW = 1000, HH = 700;
var HD = {S:null, mc:document.createElement('canvas'), cur:{x:600,y:350}, ptr:null, lastPtr:-1e9, pulse:0};
HD.mx = HD.mc.getContext('2d', {willReadFrequently:true});
var handsEl = $('#hands'), stage = $('#stage'), burst = $('#burst');
function setPtr(e){
  var r = handsEl.getBoundingClientRect();
  HD.ptr = {x:(e.clientX-r.left)*HW/r.width, y:(e.clientY-r.top)*HH/r.height};
  HD.lastPtr = performance.now();
}
stage.addEventListener('pointermove', setPtr);
stage.addEventListener('pointerdown', function(e){ setPtr(e); HD.pulse = 1; });
stage.addEventListener('pointerleave', function(){ HD.lastPtr = performance.now() - 1200; });

function capsule(x, x1,y1,x2,y2,w){ x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(x1,y1); x.lineTo(x2,y2); x.stroke(); }
function drawHand(x, B, ang, L, human){
  x.save(); x.translate(B.x,B.y); x.rotate(ang);
  var base = human ? 'rgb(0,175,0)' : 'rgb(255,0,0)';
  var hi = human ? 'rgb(0,240,0)' : base, lo = human ? 'rgb(0,95,0)' : base;
  x.fillStyle = base; x.strokeStyle = base;
  if(human){ x.fillStyle = 'rgb(0,55,0)'; x.fillRect(-420,-70,330,140); x.fillStyle = base; x.fillRect(-100,-44,110,88); }
  else { x.fillRect(-300,-40,320,80); }
  x.beginPath(); x.ellipse(32,24,102,80,0,0,TAU); x.fill();
  x.strokeStyle = base;
  capsule(x, 80,0, 100+L,0, 34);
  capsule(x, 78,28, 150,28, 32);
  capsule(x, 66,58, 134,58, 30);
  capsule(x, 46,86, 104,86, 27);
  capsule(x, 8,70, 96,112, 34);
  if(human){
    x.strokeStyle = hi; capsule(x, 90,-9, 100+L,-9, 7);
    x.strokeStyle = lo; capsule(x, 90,10, 100+L,10, 6);
    x.strokeStyle = hi; capsule(x, 90,18, 150,18, 6);
  }
  x.restore();
}

function renderHands(t, ts){
  var S = HD.S; if(!S || !S.ready) return;
  var cols = S.cols, rows = S.rows, i, x, y, o;
  if(HD.mc.width !== cols || HD.mc.height !== rows){ HD.mc.width = cols; HD.mc.height = rows; }
  var g = HD.mx;
  g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,cols,rows);
  g.setTransform(cols/HW,0,0,rows/HH,0,0);
  var tx, ty;
  if(HD.ptr && ts - HD.lastPtr < 1800){ tx = HD.ptr.x; ty = HD.ptr.y; }
  else { tx = 560 + Math.cos(t*.7)*190; ty = 350 + Math.sin(t*.9)*150; }
  HD.cur.x += (tx - HD.cur.x)*.14; HD.cur.y += (ty - HD.cur.y)*.14;
  var cx = HD.cur.x, cy = HD.cur.y;
  var B1 = {x:130+Math.sin(t*.5)*12, y:120+Math.cos(t*.4)*12}, B2 = {x:930+Math.cos(t*.45)*12, y:650+Math.sin(t*.5)*10};
  var a1 = Math.atan2(cy-B1.y, cx-B1.x), d1 = Math.hypot(cx-B1.x, cy-B1.y);
  var a2 = Math.atan2(cy-B2.y, cx-B2.x), d2 = Math.hypot(cx-B2.x, cy-B2.y);
  drawHand(g, B1, a1, Math.max(60, d1-145), false);
  drawHand(g, B2, a2, Math.max(60, d2-145), true);
  var d = g.getImageData(0,0,cols,rows).data;
  var col = [0,0,0], gi, k, v, A, Rr, Gg, edge, rowm, colm;
  for(y=0;y<rows;y++){
    for(x=0;x<cols;x++){
      i = y*cols + x; o = i*4; A = d[o+3]; Rr = d[o]; Gg = d[o+1]; gi = 0;
      if(A > 100 && Rr < 128 && Gg > 30){
        v = Gg/255; gi = clamp(Math.round(v*14)+1, 3, 15); k = .5 + .5*v;
        col[0] = 255*k; col[1] = 207*k; col[2] = 158*k;
      } else if(A > 100 && Rr >= 128){
        edge = (x > 0 && d[o-1] <= 100) || (x < cols-1 && d[o+7] <= 100) || (y > 0 && d[o-cols*4+3] <= 100) || (y < rows-1 && d[o+cols*4+3] <= 100);
        k = .55 + .45*Math.sin(x*.18 - t*3.2 + y*.1);
        if(edge){ gi = 12; col[0] = 170; col[1] = 255; col[2] = 195; }
        else {
          rowm = (y%2 === 0); colm = (x%3 === 0);
          gi = (rowm && colm) ? 5 : (rowm ? 3 : (colm ? 16 : 0));
          col[0] = 77*k; col[1] = 255*k; col[2] = 122*k;
        }
      }
      S.I[i] = gi; S.R[i] = col[0]; S.G[i] = col[1]; S.B[i] = col[2];
    }
  }
  S.draw('#000', .55, .5);
  drawBurst(t, cx, cy);
}
function drawBurst(t, px, py){
  var o = dprCanvas(burst), g = o.g, sx = o.w/HW, sy = o.h/HH;
  g.clearRect(0,0,o.w,o.h);
  var X = px*sx, Y = py*sy;
  var held = (HD.ptr && performance.now() - HD.lastPtr < 1800) ? 1 : 0.7;
  var k = (.75 + .25*Math.sin(t*5))*held + HD.pulse*1.2;
  HD.pulse = Math.max(0, HD.pulse - .03);
  var size = Math.min(o.w, o.h*1.4)*.12*k, i;
  g.globalCompositeOperation = 'lighter';
  var rg = g.createRadialGradient(X,Y,0,X,Y,size*.55);
  rg.addColorStop(0,'rgba(255,255,255,.95)'); rg.addColorStop(.25,'rgba(255,255,255,.35)'); rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(X,Y,size*.55,0,TAU); g.fill();
  var cols3 = ['255,70,50','90,255,120','110,120,255'];
  for(i=0;i<12;i++){
    var a = i*Math.PI/6 + .3 + t*.05;
    var len = size*(.45 + .55*hash(i,3,Math.floor(t*8)))*(i%2 ? 1 : 1.6);
    var cc = cols3[i%3];
    var lg2 = g.createLinearGradient(X,Y,X+Math.cos(a)*len,Y+Math.sin(a)*len);
    lg2.addColorStop(0,'rgba('+cc+',.95)'); lg2.addColorStop(1,'rgba('+cc+',0)');
    g.strokeStyle = lg2; g.lineWidth = 1.6; g.beginPath(); g.moveTo(X,Y); g.lineTo(X+Math.cos(a)*len, Y+Math.sin(a)*len); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}


/* ---------- layout and loop ---------- */
HD.S = GlyphScreen(handsEl, {aspect:0.7, cellPx:6.5, minCols:70, maxCols:170});
function resizeAll() { HD.S.resize(); if (RM) renderHands(0, 0); }
var rzT = 0;
window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(resizeAll, 120); });
window.addEventListener('load', resizeAll);
var vis = false;
new IntersectionObserver(function (es) { es.forEach(function (e) { vis = e.isIntersecting; }); }).observe(stage);
resizeAll();
var lastH = 0;
function loop(ts) {
  if (vis && !document.hidden && ts - lastH > 33) { lastH = ts; renderHands(ts / 1000, ts); }
  requestAnimationFrame(loop);
}
if (!RM) requestAnimationFrame(loop);
})();
