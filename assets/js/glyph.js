/* glyph.js: shared engine for the text-drawn art.
   Scenes write one character and one colour per cell; GlyphScreen paints them
   as coloured text with a soft bloom underneath. Exposes window.GX. */
(function () {
"use strict";
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var root = document.documentElement;
var $ = function (s) { return document.querySelector(s); };
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rad(d) { return d * Math.PI / 180; }
function hash(x, y, z) {
  var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* theme state, shared by every scene */
var T = { dark: true, grid: '#2fe05f' }, subs = [];
function readTheme() {
  var th = root.getAttribute('data-theme');
  T.dark = th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  T.grid = getComputedStyle(root).getPropertyValue('--grid').trim() || T.grid;
}
function onTheme(fn) { subs.push(fn); }
function themeChanged() { readTheme(); subs.forEach(function (f) { f(T); }); }
document.addEventListener('themechange', themeChanged);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
readTheme();

/* ---------- glyph engine ----------
   Scenes write one glyph + colour per character cell. The engine draws them
   as coloured text with a soft bloom of the same image underneath. */
var RAMP = ' .:-=+*cxoaX#%&@|/\\';
var FONT = '"SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

function GlyphScreen(canvas, o){
  var ctx = canvas.getContext('2d');
  var tint = document.createElement('canvas'), tx = tint.getContext('2d');
  var wide = document.createElement('canvas'), wx = wide.getContext('2d');
  var cache = {};
  var S = {ready:false, canvas:canvas, cols:0, rows:0, cw:0, ch:0, fs:0, dpr:1, n:0, I:null, R:null, G:null, B:null, timg:null};
  S.resize = function(){
    var host = canvas.parentElement, W = host ? host.clientWidth : 0;
    if(!W) return false;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cols = clamp(Math.round(W/o.cellPx), o.minCols, o.maxCols);
    var cw = W/cols;
    ctx.font = '700 100px ' + FONT;
    var adv = ctx.measureText('M').width/100;
    if(!(adv>0.3 && adv<1)) adv = 0.6;
    var fs = cw/adv, ch = fs;
    var rows = Math.max(8, Math.round(W*o.aspect/ch));
    S.cols = cols; S.rows = rows; S.cw = cw; S.ch = ch; S.fs = fs; S.dpr = dpr; S.n = cols*rows;
    canvas.style.width = W+'px'; canvas.style.height = (rows*ch)+'px';
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(rows*ch*dpr);
    tint.width = cols; tint.height = rows;
    wide.width = Math.max(2, Math.ceil(cols/3)); wide.height = Math.max(2, Math.ceil(rows/3));
    S.I = new Uint8Array(S.n); S.R = new Uint8Array(S.n); S.G = new Uint8Array(S.n); S.B = new Uint8Array(S.n);
    S.timg = tx.createImageData(cols, rows);
    S.ready = true;
    return true;
  };
  S.draw = function(bg, bloom, wbloom){
    var cols = S.cols, rows = S.rows, cw = S.cw, ch = S.ch, n = S.n, I = S.I, R = S.R, G = S.G, B = S.B;
    var PW = cols*cw, PH = rows*ch, i, j, x, y, py, c, key, st, last = '';
    ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if(bg){ ctx.fillStyle = bg; ctx.fillRect(0,0,PW,PH); } else { ctx.clearRect(0,0,PW,PH); }
    if(bloom > 0 || wbloom > 0){
      var d = S.timg.data;
      for(i=0;i<n;i++){
        j = i*4;
        if(I[i]){ d[j] = R[i]; d[j+1] = G[i]; d[j+2] = B[i]; d[j+3] = 255; }
        else { d[j] = 0; d[j+1] = 0; d[j+2] = 0; d[j+3] = 0; }
      }
      tx.putImageData(S.timg, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
      if(bloom > 0){ ctx.globalAlpha = bloom; ctx.drawImage(tint, 0, 0, PW, PH); }
      if(wbloom > 0){
        wx.clearRect(0,0,wide.width,wide.height); wx.drawImage(tint, 0, 0, wide.width, wide.height);
        ctx.globalAlpha = wbloom; ctx.drawImage(wide, 0, 0, PW, PH);
      }
      ctx.restore();
    }
    ctx.font = '700 ' + S.fs.toFixed(2) + 'px ' + FONT;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    i = 0;
    for(y=0;y<rows;y++){
      py = y*ch;
      for(x=0;x<cols;x++,i++){
        c = I[i]; if(!c) continue;
        key = ((R[i]>>3)<<10) | ((G[i]>>3)<<5) | (B[i]>>3);
        st = cache[key];
        if(st === undefined){ st = cache[key] = 'rgb(' + (R[i]&248) + ',' + (G[i]&248) + ',' + (B[i]&248) + ')'; }
        if(st !== last){ ctx.fillStyle = st; last = st; }
        ctx.fillText(RAMP.charAt(c), x*cw, py);
      }
    }
  };
  return S;
}

function ramp3(st, v, o){
  v = clamp(v,0,1);
  var i = 1;
  while(i < st.length-1 && v > st[i][0]) i++;
  var a = st[i-1], b = st[i], t = (v-a[0])/((b[0]-a[0])||1);
  o[0] = a[1]+(b[1]-a[1])*t; o[1] = a[2]+(b[2]-a[2])*t; o[2] = a[3]+(b[3]-a[3])*t;
}
var INKP  = [[0,2,2,40],[.3,6,8,150],[.65,22,24,236],[.9,80,96,255],[1,170,190,255]];
var GLOWP = [[0,8,12,52],[.3,10,34,180],[.6,40,104,255],[.85,126,196,255],[1,232,246,255]];
var PGD   = [[0,4,40,14],[.35,16,150,46],[.65,84,236,92],[.85,196,255,126],[1,246,255,236]];
var PGL   = [[0,2,42,16],[.5,12,120,44],[1,70,170,60]];

function dprCanvas(c){
  var d = Math.min(2, window.devicePixelRatio||1);
  var w = c.clientWidth, h = c.clientHeight;
  if(c.width !== Math.round(w*d) || c.height !== Math.round(h*d)){ c.width = Math.round(w*d); c.height = Math.round(h*d); }
  var g = c.getContext('2d'); g.setTransform(d,0,0,d,0,0);
  return {g:g,w:w,h:h};
}


window.GX = {
  RM: RM, $: $, TAU: TAU, clamp: clamp, lerp: lerp, rad: rad, hash: hash,
  theme: T, onTheme: onTheme, readTheme: readTheme,
  GlyphScreen: GlyphScreen, ramp3: ramp3, dprCanvas: dprCanvas,
  INKP: INKP, GLOWP: GLOWP, PGD: PGD, PGL: PGL
};
})();
