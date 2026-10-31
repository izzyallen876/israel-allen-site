/* film.js: the film. Every frame is drawn from code, and the sound is synthesised in the browser. Nothing is downloaded. */

'use strict';
/* ============ a_core: math, palette, glyph pipeline ============ */
const DUR = 38.6, PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return x < a ? a : x > b ? b : x; };
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const ramp = (T, a, b) => clamp((T - a) / (b - a));
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eout = x => 1 - Math.pow(1 - x, 3);
const fract = x => x - Math.floor(x);
const hash = (a, b, c) => { const x = Math.sin(a * 127.1 + (b || 0) * 311.7 + (c || 0) * 74.7) * 43758.5453; return x - Math.floor(x); };
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
              lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

/* ---- palette: 2 modes (night / paper) x 9 hue families x 8 levels ---- */
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono","Courier New",monospace';
const F = { neu: 0, blu: 1, grn: 2, mag: 3, skn: 4, red: 5, yel: 6, cyn: 7, vio: 8 };
const NF = 9, NL = 8, NPAL = 2 * NF * NL;
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const DHI = [[236, 242, 255], [150, 176, 255], [150, 255, 172], [255, 122, 232], [255, 214, 168], [255, 112, 92], [255, 244, 150], [132, 245, 255], [196, 152, 255]];
const DLO = [[58, 70, 122], [18, 38, 140], [8, 74, 36], [88, 10, 68], [86, 44, 22], [86, 10, 10], [86, 78, 10], [8, 68, 90], [48, 20, 106]];
const PLO = [[124, 138, 255], [124, 138, 255], [72, 208, 112], [242, 92, 218], [232, 152, 92], [242, 84, 74], [222, 192, 44], [44, 192, 212], [152, 112, 255]];
const PHI = [[0, 0, 62], [0, 0, 62], [0, 98, 42], [132, 0, 106], [122, 52, 12], [132, 12, 12], [132, 102, 0], [0, 102, 132], [62, 12, 142]];
const PMID = [24, 44, 238];
const PAL = [];
for (let m = 0; m < 2; m++) for (let f = 0; f < NF; f++) for (let l = 0; l < NL; l++) {
  const t = l / (NL - 1); let c;
  if (m === 0) c = mix3(DLO[f], DHI[f], Math.pow(t, .8));
  else if (f < 2) c = t < .5 ? mix3(PLO[f], PMID, t * 2) : mix3(PMID, PHI[f], (t - .5) * 2);
  else c = mix3(PLO[f], PHI[f], t);
  PAL.push('rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')');
}
const palId = (m, f, l) => (m * NF + f) * NL + (l < 0 ? 0 : l > NL - 1 ? NL - 1 : l | 0);

const RAMP = ' .:-=+*#%@';
const GL = Array.from(new Set((RAMP + '/\\|_oO~^0.+*#@=-:;,').split('')));
const GI = {}; GL.forEach((c, i) => GI[c] = i);
const NG = GL.length, NRAMP = RAMP.length;

/* ---- surfaces ---- */
const stage = document.getElementById('stage'), sctx = stage.getContext('2d');
const paintC = document.createElement('canvas'), pctx = paintC.getContext('2d', { willReadFrequently: true });
const wireC = document.createElement('canvas'), wctx = wireC.getContext('2d', { willReadFrequently: true });
const atlas = document.createElement('canvas'), actx = atlas.getContext('2d');
let CHB = new Uint8Array(0), COB = new Uint16Array(0), atlasFlag = new Uint8Array(0);
let VAL = new Float32Array(0), FAMB = new Uint8Array(0), SOL = new Uint8Array(0), WM = new Uint8Array(0);
const V = { camX: 0, W: 0, H: 0, dpr: 1, cpw: 8, cph: 16, cw: 8, ch: 16, cols: 0, rows: 0, K: 1, SS: 2, OX: 0, OY: 0, uw: 1, vh: .5 };
let targetCw = 0;

function layout() {
  const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!targetCw) targetCw = clamp(W / 190, 5.2, 11);
  V.W = W; V.H = H; V.dpr = dpr;
  const cpw = Math.max(3, Math.round(targetCw * dpr));
  V.cpw = cpw; V.cph = cpw * 2; V.cw = cpw / dpr; V.ch = V.cph / dpr;
  V.cols = Math.max(40, Math.floor(W / V.cw)); V.rows = Math.max(20, Math.floor(H / V.ch));
  V.OX = (W - V.cols * V.cw) / 2; V.OY = (H - V.rows * V.ch) / 2;
  V.K = Math.min(H, W * 1.35);
  V.uw = W / V.K / 2; V.vh = H / V.K / 2;
  stage.width = Math.round(W * dpr); stage.height = Math.round(H * dpr);
  paintC.width = V.cols * V.SS; paintC.height = V.rows * V.SS;
  wireC.width = V.cols; wireC.height = V.rows;
  CHB = new Uint8Array(V.cols * V.rows); COB = new Uint16Array(V.cols * V.rows);
  VAL = new Float32Array(V.cols * V.rows); FAMB = new Uint8Array(V.cols * V.rows); SOL = new Uint8Array(V.cols * V.rows); WM = new Uint8Array(V.cols * V.rows);
  atlas.width = NG * cpw; atlas.height = NPAL * V.cph; atlasFlag = new Uint8Array(NG * NPAL);
  actx.font = '100px ' + MONO; const adv = actx.measureText('M').width / 100 || .6;
  actx.font = (Math.round(cpw / adv * 10) / 10) + 'px ' + MONO;
  actx.textAlign = 'center'; actx.textBaseline = 'middle';
  for (let ci = 0; ci < NPAL; ci++) for (let gi = 1; gi < NG; gi++) ensureGlyph(ci, gi);   /* pre-warm: no texture uploads mid-film */
  buildBackdropAssets();
}
function ensureGlyph(ci, gi) {
  atlasFlag[ci * NG + gi] = 1;
  actx.fillStyle = PAL[ci];
  actx.fillText(GL[gi], gi * V.cpw + V.cpw / 2, ci * V.cph + V.cph / 2 + V.cph * .02);
}

/* scene units (K) <-> cell / css coordinates */
const toC = u => V.cols / 2 + (u - V.camX) * V.K / V.cw;
const toR = v => V.rows / 2 + v * V.K / V.ch;
const toX = u => V.W / 2 + (u - V.camX) * V.K;
const toY = v => V.H / 2 + v * V.K;
function setPaintTransform() {
  const SS = V.SS;
  const m = [SS * V.K / V.cw, 0, 0, SS * V.K / V.ch, SS * V.cols / 2 - V.camX * SS * V.K / V.cw, SS * V.rows / 2];
  pctx.setTransform(m[0], 0, 0, m[3], m[4], m[5]);
  wctx.setTransform(m[0] / SS, 0, 0, m[3] / SS, m[4] / SS, m[5] / SS);
}

/* ---- paint -> glyph conversion ---- */
let FRAME = 0;
const REV = { on: false, row: 0, band: 3 };
const WIRE = { c0: 0, r0: 0 };
function famOf(R, G, B) {
  const M = Math.max(R, G, B), m = Math.min(R, G, B), C = M - m;
  if (C < .22 * M + 4) return 0;
  let h;
  if (M === R) h = 60 * (((G - B) / C + 6) % 6); else if (M === G) h = 60 * ((B - R) / C + 2); else h = 60 * ((R - G) / C + 4);
  if (h < 12 || h >= 345) return 5;
  if (h < 42) return 4;
  if (h < 75) return 6;
  if (h < 165) return 2;
  if (h < 205) return 7;
  if (h < 262) return 1;
  if (h < 295) return 8;
  return 3;
}
const EDGE = { thr: .3 };
function convert(mode) {
  const cols = V.cols, rows = V.rows, SS = V.SS, pw = cols * SS, n = SS * SS;
  const img = pctx.getImageData(0, 0, pw, rows * SS).data;
  const wi = wctx.getImageData(0, 0, cols, rows).data;
  CHB.fill(0); VAL.fill(0); SOL.fill(0); WM.fill(0);
  const fr = FRAME >> 1;
  const isOut = (cc, rr) => cc >= 0 && rr >= 0 && cc < cols && rr < rows && wi[(rr * cols + cc) * 4 + 3] > 110 && wi[(rr * cols + cc) * 4] > wi[(rr * cols + cc) * 4 + 2];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, wa = wi[i * 4 + 3] > 110;
      if (wa && wi[i * 4] > wi[i * 4 + 2]) {            /* cable: bright line cells */
        const h = isOut(c - 1, r) || isOut(c + 1, r), v = isOut(c, r - 1) || isOut(c, r + 1);
        CHB[i] = h && !v ? GI['-'] : (v && !h ? GI['|'] : GI['+']); COB[i] = palId(mode, F.neu, 7); SOL[i] = 1;
        continue;
      }
      let R = 0, G = 0, B = 0;
      for (let sy = 0; sy < SS; sy++) {
        let p = ((r * SS + sy) * pw + c * SS) * 4;
        for (let sx = 0; sx < SS; sx++) { R += img[p]; G += img[p + 1]; B += img[p + 2]; p += 4; }
      }
      R /= n; G /= n; B /= n;
      let v = Math.max(R, G, B) / 255;
      if (wa) { WM[i] = 1; SOL[i] = 1; VAL[i] = v > .05 ? v : 0; FAMB[i] = 0; continue; }
      if (v < .05) continue;
      const fam = famOf(R, G, B);
      if (REV.on && fam <= 1) {
        const d = REV.row - r;
        if (d < 0) continue;
        if (d < REV.band) v *= .35 + 1.1 * hash(c, r, FRAME);
      }
      v += (hash(c, r, fr) - .5) * .03;
      if (v < .05) continue;
      VAL[i] = v; FAMB[i] = fam;
      if (v > .26) SOL[i] = 1;
    }
  }
  const vv = (cc, rr) => (cc < 0 || rr < 0 || cc >= cols || rr >= rows) ? 0 : VAL[rr * cols + cc];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, v = VAL[i];
      if (WM[i]) {
        let edge = false, gx = 0, gy = 0;
        if (v > .12) {
          gx = (vv(c + 1, r - 1) + 2 * vv(c + 1, r) + vv(c + 1, r + 1)) - (vv(c - 1, r - 1) + 2 * vv(c - 1, r) + vv(c - 1, r + 1));
          gy = (vv(c - 1, r + 1) + 2 * vv(c, r + 1) + vv(c + 1, r + 1)) - (vv(c - 1, r - 1) + 2 * vv(c, r - 1) + vv(c + 1, r - 1));
          edge = Math.hypot(gx, gy) / 4 > EDGE.thr * .85;
        }
        if (edge) { CHB[i] = dirGlyph(-gy, gx); COB[i] = palId(mode, F.neu, 7); continue; }
        const lc = c - WIRE.c0, lr = r - WIRE.r0;
        const onV = ((lc % 3) + 3) % 3 === 0, onH = ((lr % 2) + 2) % 2 === 0;
        let g, l = 3 + Math.round(clamp(v) * 3);
        if (onV && onH) g = GI['+']; else if (onH) g = GI['-']; else if (onV) g = GI['|']; else continue;
        if (hash(c, r, FRAME >> 2) > .985) l = 7;
        CHB[i] = g; COB[i] = palId(mode, F.grn, l);
        continue;
      }
      if (v < .05) continue;
      const fam = FAMB[i];
      let gi = Math.floor(Math.pow(clamp((v - .04) / .96), .8) * (NRAMP - 1) + .5);
      if (gi < 1) gi = 1; else if (gi > NRAMP - 1) gi = NRAMP - 1;
      let lvl = Math.min(NL - 1, Math.floor(v * NL)), g = GI[RAMP[gi]];
      if ((fam === 0 || fam === 2 || fam === 4 || (mode && fam === 1)) && v > .12) {
        const gx = (vv(c + 1, r - 1) + 2 * vv(c + 1, r) + vv(c + 1, r + 1)) - (vv(c - 1, r - 1) + 2 * vv(c - 1, r) + vv(c - 1, r + 1));
        const gy = (vv(c - 1, r + 1) + 2 * vv(c, r + 1) + vv(c + 1, r + 1)) - (vv(c - 1, r - 1) + 2 * vv(c, r - 1) + vv(c + 1, r - 1));
        if (Math.hypot(gx, gy) / 4 > EDGE.thr) { g = dirGlyph(-gy, gx); lvl = Math.min(NL - 1, lvl + 2); }
      }
      CHB[i] = g; COB[i] = palId(mode, fam, lvl);
    }
  }
}

/* ---- ink overlay: crisp characters written straight into the buffers ---- */
const INK = { mode: 0 };
function put(c, r, g, col, behind) {
  c = Math.round(c); r = Math.round(r);
  if (c < 0 || r < 0 || c >= V.cols || r >= V.rows) return;
  const i = r * V.cols + c;
  if (behind) { const w = V.cols; if (SOL[i] || (c > 0 && SOL[i - 1]) || (c < w - 1 && SOL[i + 1]) || (r > 0 && SOL[i - w]) || (r < V.rows - 1 && SOL[i + w])) return; }
  CHB[i] = g; COB[i] = col;
}
function dirGlyph(dx, dy) {
  const b = (((Math.atan2(dy * 2, dx) * 180 / PI) % 180) + 180) % 180;
  if (b < 22.5 || b >= 157.5) return GI['-'];
  if (b < 67.5) return GI['\\'];
  if (b < 112.5) return GI['|'];
  return GI['/'];
}
function clipSeg(x0, y0, x1, y1) {
  const xmin = -1, ymin = -1, xmax = V.cols, ymax = V.rows;
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy], q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; }
    else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy, t0, t1];
}
function line(x0, y0, x1, y1, fam, l0, l1, o) {
  o = o || {};
  if (!isFinite(x0 + y0 + x1 + y1)) return;
  const cl = clipSeg(x0, y0, x1, y1); if (!cl) return;
  const la = lerp(l0, l1, cl[4]), lb = lerp(l0, l1, cl[5]); x0 = cl[0]; y0 = cl[1]; x1 = cl[2]; y1 = cl[3]; l0 = la; l1 = lb;
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const g = o.glyph !== undefined ? o.glyph : dirGlyph(dx, dy);
  for (let i = 0; i <= n; i++) {
    if (o.dash && (i % o.dash[0]) >= o.dash[1]) continue;
    const s = i / n;
    put(x0 + dx * s, y0 + dy * s, g, palId(INK.mode, fam, Math.round(lerp(l0, l1, s))), o.behind);
  }
}
const lineU = (u0, v0, u1, v1, fam, l0, l1, o) => line(toC(u0), toR(v0), toC(u1), toR(v1), fam, l0, l1, o);
function dot(c, r, ch, fam, l, behind) { put(c, r, GI[ch], palId(INK.mode, fam, l), behind); }
function ring(cu, cv, ru, fam, l0, l1, glyphs, steps) {
  const cc = toC(cu), rr = toR(cv); steps = steps || Math.max(24, Math.round(ru * V.K / V.cw * 3));
  for (let i = 0; i < steps; i++) {
    const a = i / steps * TAU;
    put(cc + Math.cos(a) * ru * V.K / V.cw, rr + Math.sin(a) * ru * V.K / V.ch, GI[glyphs ? glyphs[i % glyphs.length] : 'o'], palId(INK.mode, fam, Math.round(l0)));
  }
}

/* ---- backdrop (soft airbrush layer behind the glyphs) ---- */
let cloudSprite = null, paperTile = null;
function buildBackdropAssets() {
  cloudSprite = document.createElement('canvas'); cloudSprite.width = 256; cloudSprite.height = 128;
  const c = cloudSprite.getContext('2d');
  const g = c.createRadialGradient(128, 64, 0, 128, 64, 128);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.save(); c.scale(1, .5); c.fillStyle = g; c.fillRect(0, 0, 256, 256); c.restore();
  paperTile = document.createElement('canvas'); paperTile.width = paperTile.height = 192;
  const p = paperTile.getContext('2d'), id = p.createImageData(192, 192), r = mulberry(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = 200 + (r() - .5) * 26 | 0; id.data[i] = v; id.data[i + 1] = v - 2; id.data[i + 2] = v - 3; id.data[i + 3] = 255; }
  p.putImageData(id, 0, 0);
}

'use strict';
/* ============ b_paint: everything drawn into the paint layer ============ */
const P = [0.17, -0.07];                         // where the two fingertips almost meet
const HEL = { s: 1.2, ox: 0, oy: 0.2 };        // helmet placement (image px -> K units)
const hx = x => (x - 595) / 1590 * HEL.s + HEL.ox, hy = y => (y - 800) / 1590 * HEL.s + HEL.oy;
const EYES = [[hx(480), hy(880)], [hx(710), hy(880)]];
const eyeAt = s => [EYES[s][0] + MX * 18 / 1590 * HEL.s, EYES[s][1] + MY * 10 / 1590 * HEL.s];
const CP = [0, -0.36];                          // crystal's home above the helmet
const GH = [-0.52, 0.12];                        // ghost's resting place
const dirW = [Math.cos(.45), Math.sin(.45)], dirR = [-Math.cos(.5), -Math.sin(.5)], GAP = 0.022;
const TIPW = [P[0] - dirW[0] * GAP, P[1] - dirW[1] * GAP], TIPR = [P[0] - dirR[0] * GAP, P[1] - dirR[1] * GAP];
let MX = 0, MY = 0;                              // smoothed pointer, -.5 .. .5

const skin = (v, a) => { v = clamp(v); return 'rgba(' + (255 * v | 0) + ',' + (176 * v | 0) + ',' + (108 * v | 0) + ',' + (a === undefined ? 1 : a) + ')'; };
const ghostc = (v, a) => { v = clamp(v); return 'rgba(' + (60 * v | 0) + ',' + (255 * v | 0) + ',' + (150 * v | 0) + ',' + (a === undefined ? 1 : a) + ')'; };
const gry = (v, a) => { const k = 255 * clamp(v) | 0; return 'rgba(' + k + ',' + k + ',' + k + ',' + (a === undefined ? 1 : a) + ')'; };
const lime = (v, a) => { v = clamp(v); return 'rgba(' + (170 * v | 0) + ',' + (255 * v | 0) + ',' + (60 * v | 0) + ',' + (a === undefined ? 1 : a) + ')'; };
const emer = (v, a) => { v = clamp(v); return 'rgba(' + (20 * v | 0) + ',' + (235 * v | 0) + ',' + (110 * v | 0) + ',' + (a === undefined ? 1 : a) + ')'; };

function seg(ctx, a, b, r0, r1, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / 0.012));
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    ctx.lineWidth = lerp(r0, r1, (t0 + t1) / 2) * 2;
    ctx.beginPath(); ctx.moveTo(a[0] + dx * t0, a[1] + dy * t0); ctx.lineTo(a[0] + dx * t1, a[1] + dy * t1); ctx.stroke();
  }
}
function limb(ctx, pts, rs, v, hue, off) {
  off = off || 0.007;
  for (let pass = 0; pass < 3; pass++) {
    const dx = pass === 0 ? off : pass === 2 ? -off : 0, dy = pass === 0 ? off * 1.1 : pass === 2 ? -off * 1.2 : 0;
    const vv = pass === 0 ? v * .45 : pass === 1 ? v : Math.min(1, v + .38), k = pass === 2 ? .5 : 1;
    for (let i = 0; i < pts.length - 1; i++)
      seg(ctx, [pts[i][0] + dx, pts[i][1] + dy], [pts[i + 1][0] + dx, pts[i + 1][1] + dy], rs[i] * k, rs[i + 1] * k, hue(vv));
  }
}
function ell(ctx, x, y, rx, ry, rot, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
}

/* ---------- sky ---------- */
function paintSky(ctx, T) {
  ctx.globalCompositeOperation = 'lighter';
  const uw = V.uw + .45;
  for (let i = 0; i < 11; i++) {
    const sp = .0045 + .003 * (i % 4);
    const x = lerp(-uw, uw, fract(i * .37 + T * sp + .15)) + MX * .02 * (1 + i % 3);
    const y = -V.vh + (.08 + .84 * hash(i, 1, 1)) * V.vh * 2;
    const rx = .24 + .24 * hash(i, 2, 1), ry = rx * .3, a = .2 + .14 * hash(i, 3, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(78,108,255,' + a + ')'); g.addColorStop(.6, 'rgba(78,108,255,' + a * .35 + ')'); g.addColorStop(1, 'rgba(78,108,255,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- title ---------- */
function paintTitle(ctx, T) {
  const a = ramp(T, 1.1, 1.9) * (1 - ramp(T, 5.2, 6.6));
  if (a <= .01) return;
  const lines = ['GHOST IN', 'THE GRID'], prog = ramp(T, 1.2, 3.9);
  const junk = '#@%&*+=<>/\\|';
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let li = 0; li < 2; li++) {
    const str = lines[li];
    ctx.save(); ctx.translate(MX * .015, -.075 + li * .2 + MY * .01); ctx.scale(.001, .001);
    ctx.font = '900 100px "Arial Black",Impact,"Helvetica Neue",Arial,sans-serif';
    const w = ctx.measureText(str).width, s = 660 / w;
    ctx.scale(s, s * 1.15);
    let x = -w / 2;
    for (let k = 0; k < str.length; k++) {
      const chw = ctx.measureText(str[k]).width, rv = (k + li * 8) / 16 * .8;
      let chr = str[k];
      if (prog >= rv && str[k] !== ' ') {
        if (prog < rv + .16) chr = junk[(hash(k, li, Math.floor(T * 16)) * junk.length) | 0];
        const gl = (prog < 1 || hash(Math.floor(T * 9), li, 3) > .94) ? (hash(k, li, Math.floor(T * 22)) - .5) * 16 : 0;
        ctx.fillStyle = '#fff'; ctx.fillText(chr, x + chw / 2 + gl, 0);
        if (gl !== 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,0,170,.7)'; ctx.fillText(chr, x + chw / 2 + gl + 9, 0);
          ctx.fillStyle = 'rgba(0,255,255,.6)'; ctx.fillText(chr, x + chw / 2 + gl - 9, 0);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      x += chw;
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- the man (the ghost) ---------- */
function manPose(T) {
  const a = Math.sin(T * .9), b = Math.sin(T * .7 + 1), c = Math.sin(T * 1.1 + 2);
  return {
    head: [0, .175 + .004 * a],
    shL: [-.075, .078], elL: [-.205, .062 + .012 * b], haL: [-.335, .03 + .014 * a],
    shR: [.075, .078], elR: [.205, .005 + .012 * a], haR: [.325, -.075 + .014 * c]
  };
}
const manXf = (T) => ({ x: -.42 + MX * .03, y: .10 + .012 * Math.sin(T * 1.1) + MY * .02, sc: .95, rot: .05 * Math.sin(T * .5) });
function manToWorld(T, pt) {
  const m = manXf(T), c = Math.cos(m.rot), s = Math.sin(m.rot);
  return [m.x + (pt[0] * c - pt[1] * s) * m.sc, m.y + (pt[0] * s + pt[1] * c) * m.sc];
}
function splay(ctx, c, ang, v, hue, a) {
  ctx.save(); ctx.globalAlpha *= a;
  ell(ctx, c[0], c[1], .028, .026, 0, hue(v * .85));
  for (let k = 0; k < 5; k++) {
    const an = ang + (k - 2) * .4, L = k === 0 ? .05 : .072 + (k === 2 ? .01 : 0);
    const b = [c[0] + Math.cos(an) * .02, c[1] + Math.sin(an) * .02], e = [c[0] + Math.cos(an) * (.02 + L), c[1] + Math.sin(an) * (.02 + L)];
    limb(ctx, [b, e], [.0105, .0075], v, hue, .004);
  }
  ctx.restore();
}
function paintMan(ctx, T, o) {
  const J = manPose(T), hue = o.hue || skin;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot || 0); ctx.scale(o.sc, o.sc); ctx.globalAlpha *= o.alpha;
  const g = ctx.createLinearGradient(-.09, 0, .09, 0);
  g.addColorStop(0, hue(.3)); g.addColorStop(.55, hue(.62)); g.addColorStop(1, hue(.92));
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(-.088, .082); ctx.lineTo(.088, .082); ctx.lineTo(.064, -.05); ctx.lineTo(.046, -.17); ctx.lineTo(-.046, -.17); ctx.lineTo(-.064, -.05); ctx.closePath(); ctx.fill();
  ell(ctx, -.036, .03, .03, .042, .2, hue(.78)); ell(ctx, .036, .03, .03, .042, -.2, hue(.86));
  seg(ctx, [0, .075], [0, -.15], .004, .003, hue(.22));
  limb(ctx, [J.shL, J.elL, J.haL], [.036, .03, .022], .62, hue);
  limb(ctx, [J.shR, J.elR, J.haR], [.036, .03, .022], .74, hue);
  splay(ctx, J.haL, Math.atan2(J.haL[1] - J.elL[1], J.haL[0] - J.elL[0]), .72, hue, 1);
  if (o.hand > .02) splay(ctx, J.haR, Math.atan2(J.haR[1] - J.elR[1], J.haR[0] - J.elR[0]), .82, hue, o.hand);
  seg(ctx, [0, .092], [0, .135], .026, .026, hue(.55));
  ell(ctx, J.head[0], J.head[1] + .02, .052, .052, 0, hue(.42));
  ell(ctx, J.head[0] - .018, J.head[1] + .004, .022, .015, .5, hue(.85));
  ell(ctx, J.head[0] + .02, J.head[1] + .03, .017, .012, -.4, hue(.45));
  ell(ctx, -.052, J.head[1] + .02, .008, .014, 0, hue(.6)); ell(ctx, .052, J.head[1] + .02, .008, .014, 0, hue(.7));
  ctx.restore();
}

/* ---------- hands (shared geometry; tip of the index finger at the origin, pointing +x) ---------- */
const HAND = [
  { p: [[-.24, -.07], [-.16, -.072], [-.08, -.07], [-.004, -.066]], r: [.033, .029, .025, .021] },   // index, sticking out of the fist
  { p: [[-.235, -.012], [-.17, -.012]], r: [.026, .026] },                                             // three curled fingers
  { p: [[-.24, .04], [-.175, .04]], r: [.026, .026] },
  { p: [[-.245, .092], [-.185, .092]], r: [.024, .024] },
  { p: [[-.31, .05], [-.26, .12], [-.19, .14]], r: [.032, .027, .022] },                              // thumb tucked underneath
  { p: [[-.4, .03], [-.29, .03]], r: [.07, .085] }                                                     // back of the hand
];
const HAND_BACK = [-.47, .03];
function paintRealHand(ctx, tip, ang, sc, alpha) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(tip[0], tip[1]); ctx.rotate(ang); ctx.scale(sc, sc);
  seg(ctx, [-.47, .04], [-1.6, .16], .085, .105, gry(.5));
  seg(ctx, [-.7, .06], [-1.6, .13], .03, .04, gry(.72));
  for (let i = HAND.length - 1; i >= 0; i--) limb(ctx, HAND[i].p, HAND[i].r, .62, skin, .007);
  seg(ctx, [-.485, -.06], [-.482, .12], .016, .016, gry(.97));
  ctx.restore();
}
function capPath(ctx, a, b, r0, r1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L, an = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * r0, a[1] + ny * r0); ctx.lineTo(b[0] + nx * r1, b[1] + ny * r1);
  ctx.arc(b[0], b[1], r1, an + PI / 2, an - PI / 2, true);
  ctx.lineTo(a[0] - nx * r0, a[1] - ny * r0);
  ctx.arc(a[0], a[1], r0, an - PI / 2, an + PI / 2, true);
  ctx.closePath();
}
/* wire hand: the mask marks where the mesh goes (a bit inside the painted silhouette, so the outline cells come from the paint layer) */
const wirec = (v, a) => { v = clamp(v); return 'rgba(' + (200 * v | 0) + ',' + (255 * v | 0) + ',' + (225 * v | 0) + ',' + (a === undefined ? 1 : a) + ')'; };
const WIRE_V = [1, .5, .9, .5, .85, .42];
function paintWireHand(ctx, tip, ang, sc, alpha) {
  if (alpha <= .01) return;
  ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(ang); ctx.scale(sc, sc); ctx.globalAlpha *= alpha;
  for (let i = HAND.length - 1; i >= 0; i--) for (let j = 0; j < HAND[i].p.length - 1; j++) {
    if (hash(i, j, Math.floor(alpha * 6)) > alpha * 1.15) continue;
    seg(ctx, HAND[i].p[j], HAND[i].p[j + 1], HAND[i].r[j] * .97, HAND[i].r[j + 1] * .97, wirec(WIRE_V[i]));
  }
  ctx.restore();
}
function maskWireHand(ctx, tip, ang, sc, alpha, flip) {
  if (alpha <= .01) return;
  ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(ang); ctx.scale(sc, flip ? -sc : sc);
  ctx.fillStyle = '#00f';
  for (let i = HAND.length - 1; i >= 0; i--) for (let j = 0; j < HAND[i].p.length - 1; j++) {
    if (hash(i, j, Math.floor(alpha * 6)) > alpha * 1.15) continue;
    capPath(ctx, HAND[i].p[j], HAND[i].p[j + 1], HAND[i].r[j] * .8, HAND[i].r[j + 1] * .8);
    ctx.fill();
  }
  ctx.restore();
}
function maskCable(ctx, a, b, off, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * off, ny = dx / L * off;
  ctx.save(); ctx.strokeStyle = '#f00'; ctx.lineWidth = w; ctx.lineCap = 'round';
  for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(a[0] + nx * s, a[1] + ny * s); ctx.lineTo(b[0] + nx * s, b[1] + ny * s); ctx.stroke(); }
  ctx.restore();
}

/* ---------- starburst core ---------- */
function paintBurstCore(ctx, b, flash) {
  if (b <= .01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const R = (.03 + .07 * b + .5 * flash);
  const g = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], R);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.7)'); g.addColorStop(.5, 'rgba(255,230,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P[0], P[1], R, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- kabuto (ink density: 0 paper .. 1 deepest ink), drawn in the image's own pixel space ---------- */
function paintHelmet(ctx, T, glow, ox, oy) {
  const d = gry;
  ctx.save();
  ctx.translate(HEL.ox + ox, HEL.oy + oy); const sc = HEL.s / 1590; ctx.scale(sc, sc); ctx.translate(-595, -800);
  const mir = fn => { fn(); ctx.save(); ctx.translate(1190, 0); ctx.scale(-1, 1); fn(); ctx.restore(); };
  const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); };
  const st = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

  /* body armour: serrated shoulders */
  ctx.fillStyle = d(.88); ctx.beginPath(); ctx.moveTo(-60, 1700); ctx.lineTo(-60, 1160);
  for (let i = 0; i < 6; i++) { const x = -40 + i * 66; ctx.lineTo(x + 30, 1118 + i * 15); ctx.lineTo(x + 66, 1190 + i * 16); }
  ctx.quadraticCurveTo(595, 1130, 800, 1250);
  for (let i = 5; i >= 0; i--) { const x = 1190 + 40 - i * 66; ctx.lineTo(x - 66, 1190 + i * 16); ctx.lineTo(x - 30, 1118 + i * 15); }
  ctx.lineTo(1250, 1160); ctx.lineTo(1250, 1700); ctx.closePath(); ctx.fill();
  st(9, d(.5));
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-40, 1290 + k * 54); ctx.quadraticCurveTo(300, 1250 + k * 54, 560, 1330 + k * 40); ctx.stroke(); ctx.beginPath(); ctx.moveTo(1230, 1290 + k * 54); ctx.quadraticCurveTo(890, 1250 + k * 54, 630, 1330 + k * 40); ctx.stroke(); }

  /* shikoro (neck guard) */
  poly([[330, 820], [860, 820], [1048, 1160], [142, 1160]], d(.78));
  st(8, d(.42));
  for (let k = 0; k < 8; k++) { const y = 870 + k * 36, t = (y - 820) / 340, x0 = lerp(330, 142, t), x1 = lerp(860, 1048, t); ctx.beginPath(); ctx.moveTo(x0 + 6, y); ctx.lineTo(x1 - 6, y); ctx.stroke(); }

  /* fukigaeshi (side turn-backs) with rivets */
  mir(() => {
    ctx.save(); ctx.translate(262, 692); ctx.rotate(-.2);
    ell(ctx, 0, 0, 102, 128, 0, d(.52)); ell(ctx, 0, 0, 80, 106, 0, d(.4));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) ell(ctx, -38 + a * 38, -80 + b * 40, 11, 11, 0, d(.16 + .08 * ((a + b) % 2)));
    st(7, d(.9)); ctx.beginPath(); ctx.ellipse(0, 0, 102, 128, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  });

  /* dome and crest */
  const dg = ctx.createRadialGradient(560, 470, 10, 595, 540, 190);
  dg.addColorStop(0, d(.28)); dg.addColorStop(.55, d(.55)); dg.addColorStop(1, d(.88));
  ell(ctx, 595, 545, 178, 170, 0, dg);
  ctx.fillStyle = d(.6);
  ctx.beginPath(); ctx.moveTo(595, 338); ctx.lineTo(626, 420); ctx.lineTo(668, 386); ctx.lineTo(656, 466); ctx.lineTo(712, 450); ctx.lineTo(676, 530); ctx.lineTo(514, 530); ctx.lineTo(478, 450); ctx.lineTo(534, 466); ctx.lineTo(522, 386); ctx.lineTo(564, 420); ctx.closePath(); ctx.fill();
  st(9, d(.2)); for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(595 + k * 14, 420 + Math.abs(k) * 12); ctx.lineTo(595 + k * 40, 600); ctx.stroke(); }

  /* horns */
  mir(() => {
    const hg = ctx.createLinearGradient(232, 262, 430, 610);
    hg.addColorStop(0, d(.4)); hg.addColorStop(1, d(.72));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(232, 262);
    ctx.bezierCurveTo(300, 252, 400, 290, 478, 352); ctx.bezierCurveTo(500, 380, 484, 420, 452, 470);
    ctx.bezierCurveTo(430, 520, 434, 565, 424, 612); ctx.lineTo(384, 612);
    ctx.bezierCurveTo(372, 520, 330, 430, 262, 330); ctx.closePath(); ctx.fill();
    st(10, d(.14)); ctx.beginPath(); ctx.moveTo(250, 272); ctx.bezierCurveTo(320, 268, 410, 304, 470, 360); ctx.stroke();
    st(7, d(.92)); ctx.beginPath(); ctx.moveTo(262, 334); ctx.bezierCurveTo(330, 430, 372, 520, 384, 612); ctx.stroke();
  });

  /* maedate band */
  st(76, d(.58)); ctx.beginPath(); ctx.moveTo(388, 618); ctx.quadraticCurveTo(595, 800, 802, 618); ctx.stroke();
  const rr = mulberry(11);
  for (let k = 0; k < 90; k++) { const t = rr(), x = lerp(388, 802, t), y = (1 - t) * (1 - t) * 618 + 2 * t * (1 - t) * 800 + t * t * 618 + (rr() - .5) * 52; ell(ctx, x, y, 3 + rr() * 5, 3 + rr() * 5, 0, d(rr() > .5 ? .22 : .95)); }

  /* menpo: mid-tone face, dark features */
  ctx.fillStyle = d(.5); ctx.beginPath(); ctx.moveTo(372, 806); ctx.lineTo(818, 806); ctx.bezierCurveTo(850, 960, 770, 1120, 595, 1198); ctx.bezierCurveTo(420, 1120, 340, 960, 372, 806); ctx.closePath(); ctx.fill();
  st(10, d(.9)); ctx.beginPath(); ctx.moveTo(372, 806); ctx.bezierCurveTo(340, 960, 420, 1120, 595, 1198); ctx.bezierCurveTo(770, 1120, 850, 960, 818, 806); ctx.stroke();
  mir(() => {
    ell(ctx, 478, 880, 86, 34, .1, d(1));
    ell(ctx, 452, 984, 58, 28, .25, d(.26));
    st(12, d(.22)); ctx.beginPath(); ctx.moveTo(396, 846); ctx.quadraticCurveTo(480, 814, 560, 848); ctx.stroke();
    st(9, d(.88)); ctx.beginPath(); ctx.moveTo(470, 1008); ctx.quadraticCurveTo(480, 1052, 512, 1068); ctx.stroke();
    st(8, d(.88)); ctx.beginPath(); ctx.moveTo(430, 1100); ctx.quadraticCurveTo(500, 1150, 560, 1138); ctx.stroke();
    ell(ctx, 556, 1024, 26, 16, 0, d(1));
  });
  st(26, d(.2)); ctx.beginPath(); ctx.moveTo(595, 852); ctx.lineTo(595, 1004); ctx.stroke();
  ctx.fillStyle = d(1); ctx.beginPath(); ctx.moveTo(488, 1066); ctx.lineTo(702, 1066); ctx.lineTo(678, 1126); ctx.lineTo(512, 1126); ctx.closePath(); ctx.fill();
  for (let k = -4; k <= 4; k++) { ctx.fillStyle = d(.16); ctx.fillRect(595 + k * 22 - 8, 1070, 16, 20); ctx.fillRect(595 + k * 22 - 7, 1102, 14, 18); }
  ell(ctx, 595, 1168, 13, 12, 0, d(.22));

  /* visor */
  const vg = ctx.createLinearGradient(0, 750, 0, 830); vg.addColorStop(0, d(.18)); vg.addColorStop(.55, d(.5)); vg.addColorStop(1, d(.96));
  ell(ctx, 595, 786, 240, 40, 0, vg);
  st(6, d(.06)); ctx.beginPath(); ctx.ellipse(595, 780, 226, 28, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();

  /* eyes: emerald fire */
  if (glow > .01) {
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 2; s++) {
      const ex = (s ? 710 : 480) + MX * 18, ey = 880 + MY * 10, k = .6 + glow * .6;
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 86 * k);
      eg.addColorStop(0, 'rgba(150,255,190,' + clamp(glow) + ')'); eg.addColorStop(.4, 'rgba(20,235,110,' + .8 * glow + ')'); eg.addColorStop(1, 'rgba(0,200,80,0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(ex, ey, 84 * k, 38, .1 * (s ? -1 : 1), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/* ---------- crystal ---------- */
const CRY = { edges: [], verts: [] };
const LIGHTV = (() => { const l = Math.hypot(-.5, -.7, .8); return [-.5 / l, -.7 / l, .8 / l]; })();
function paintCrystal(ctx, cu, cv, sc, rot, tilt, alpha) {
  CRY.edges.length = 0; CRY.verts.length = 0;
  if (alpha <= .01 || sc <= .01) return;
  const H = .125 * sc, R = .066 * sc, BH = .02 * sc, ct = Math.cos(tilt), st = Math.sin(tilt);
  const X = (p, r) => { // rotate about Y then tilt about Z
    const c = Math.cos(r), s = Math.sin(r);
    let x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c, y = p[1];
    return [x * ct - y * st, x * st + y * ct, z];
  };
  const build = (k, r, ry) => {
    const ring = (y) => { const a = []; for (let i = 0; i < 4; i++) { const an = i * PI / 2 + PI / 4; a.push(X([R * k * Math.cos(an), y * k, R * k * Math.sin(an)], r)); } return a; };
    const top = X([0, -H * k, 0], r), bot = X([0, H * k, 0], r), U = ring(-BH), L = ring(BH);
    const faces = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      faces.push([top, U[i], U[j]]); faces.push([U[i], U[j], L[j], L[i]]); faces.push([bot, L[j], L[i]]);
    }
    return faces;
  };
  const shadeFace = (f) => {
    const a = f[0], b = f[1], c = f[2];
    let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    let cx = 0, cy = 0, cz = 0; f.forEach(p => { cx += p[0]; cy += p[1]; cz += p[2]; }); cx /= f.length; cy /= f.length; cz /= f.length;
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) n = [-n[0], -n[1], -n[2]];
    const dif = Math.max(0, n[0] * LIGHTV[0] + n[1] * LIGHTV[1] + n[2] * LIGHTV[2]);
    const hv = [LIGHTV[0], LIGHTV[1], LIGHTV[2] + 1], hl = Math.hypot(hv[0], hv[1], hv[2]);
    const sp = Math.pow(Math.max(0, (n[0] * hv[0] + n[1] * hv[1] + n[2] * hv[2]) / hl), 14);
    return { n, z: cz, v: clamp(.2 + dif * .62 + sp * .55 + (1 - Math.abs(n[2])) * .22), front: n[2] > 0 };
  };
  const outer = build(1, rot).map(f => ({ f, s: shadeFace(f) })).sort((p, q) => p.s.z - q.s.z);
  const inner = build(.5, -rot * 1.35 + .6).map(f => ({ f, s: shadeFace(f) })).sort((p, q) => p.s.z - q.s.z);
  ctx.save(); ctx.translate(cu, cv); ctx.globalCompositeOperation = 'lighter';
  const boost = INK.mode ? 1.35 : 1;
  const drawF = (o, hue, al, mult) => {
    const f = o.f; ctx.fillStyle = hue(o.s.v * mult * boost, al); ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]);
    for (let i = 1; i < f.length; i++) ctx.lineTo(f[i][0], f[i][1]); ctx.closePath(); ctx.fill();
  };
  outer.forEach(o => { if (!o.s.front) drawF(o, emer, alpha * .55, .8); });
  inner.forEach(o => drawF(o, lime, alpha * .8, 1.1));
  outer.forEach(o => { if (o.s.front) drawF(o, emer, alpha * .78, 1.0); });
  ctx.restore();
  outer.forEach(o => {
    const f = o.f;
    for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; CRY.edges.push([cu + a[0], cv + a[1], cu + b[0], cv + b[1], o.s.front ? 1 : 0]); }
  });
  outer[0].f.forEach(p => CRY.verts.push([cu + p[0], cv + p[1]]));
}

'use strict';
/* ============ c_scene: timeline state, ink overlays, backdrop, frame ============ */
const T_POUR0 = 26.2;
const ripples = [];            // {t0,u,v} real-time ripples from clicks
let RT = 0;                    // real clock (s) for ripples

function camPath(T) {
  if (T < 5) return 0;
  if (T < 7) return lerp(0, -.38, eio(ramp(T, 5, 7)));
  if (T < 11) return -.38;
  if (T < 17) return lerp(-.38, .03, eio(ramp(T, 11, 17)));
  if (T < 20.5) return .03;
  return 0;
}
function ghostXf() { return V.uw < .6 ? { p: [-.2, .02], s: .62 } : { p: GH, s: .85 }; }

function computeState(T) {
  const S = { T };
  S.paper = T >= 20.5 ? 1 : 0;
  S.flash = T < 19.3 ? 0 : T < 20.5 ? Math.pow((T - 19.3) / 1.2, 2) : Math.pow(Math.max(0, 1 - (T - 20.5) / 1.7), 1.5);
  let w = 1, h = 1;
  if (T < .9) { w = eout(ramp(T, .05, .35)); h = T < .35 ? 0 : eout(ramp(T, .35, .9)); }
  else if (T > 37.3) { h = 1 - eio(ramp(T, 37.3, 37.9)); w = 1 - eio(ramp(T, 37.9, 38.4)); }
  S.bw = w; S.bh = h;
  S.charge = Math.pow(ramp(T, 15, 18.4), 1.6) * .55;
  S.burst = T < 18.4 ? S.charge : T < 20.5 ? (.9 + .7 * ramp(T, 18.5, 20.5)) : Math.max(0, 1 - ramp(T, 20.5, 24)) * .45;
  S.warp = T < 20.5 ? sstep(15.8, 18.2, T) : 0;
  S.ign = T >= 18.4 && T < 20.5 ? Math.max(0, 1 - (T - 18.4) / 1.4) : 0;
  S.fade = 1 - sstep(19.8, 20.5, T);          // everything of the night world fades into the bloom
  return S;
}

/* ---------- hands ---------- */
function handsState(T) {
  const hm = manToWorld(T, manPose(T).haR);
  const e1 = eio(ramp(T, 11.4, 16.8));
  const tip0 = [hm[0] + .05, hm[1] - .03];
  const tip = [lerp(tip0[0], TIPW[0], e1), lerp(tip0[1], TIPW[1], e1) - Math.sin(e1 * PI) * .1];
  const j = sstep(16.6, 18.4, T) * (T < 20.5 ? 1 : 0);
  tip[0] += (hash(Math.floor(T * 30), 1) - .5) * .004 * j; tip[1] += (hash(Math.floor(T * 30), 2) - .5) * .004 * j;
  const ang = lerp(-.7, .45, e1), sc = lerp(.6, 1.35, sstep(11, 14.5, T));
  const D = (1 - eout(ramp(T, 13, 18))) * 1.9;
  const tipR = [TIPR[0] - dirR[0] * D + MX * .01 * (1 - D), TIPR[1] - dirR[1] * D];
  return {
    hm, wire: { tip, ang, sc, alpha: sstep(11, 12.4, T) },
    real: { tip: tipR, ang: Math.atan2(dirR[1], dirR[0]), sc: 1.4, alpha: sstep(12.8, 13.2, T) },
    manHand: 1 - sstep(11, 12.8, T)
  };
}

/* ---------- ghost particles ---------- */
const PART = (() => {
  const r = mulberry(99), J = manPose(0), N = 420, a = [];
  const lim = [[J.shL, J.elL, J.haL], [J.shR, J.elR, J.haR]];
  for (let i = 0; i < N; i++) {
    let lx, ly; const k = r();
    if (k < .35) { const L = lim[r() < .5 ? 0 : 1], s = r() * 2, j = Math.min(1, Math.floor(s)), t = s - j; lx = lerp(L[j][0], L[j + 1][0], t) + (r() - .5) * .03; ly = lerp(L[j][1], L[j + 1][1], t) + (r() - .5) * .03; }
    else if (k < .8) { lx = (r() - .5) * .1; ly = -.16 + r() * .24; }
    else { const an = r() * TAU, rr = Math.sqrt(r()) * .05; lx = Math.cos(an) * rr; ly = .19 + Math.sin(an) * rr; }
    a.push({ lx, ly, d: r() * 3.2, D: 1 + r() * 1.2, cx: (r() - .5) * .25, cy: -.12 - r() * .18, e: i % 2, jx: (r() - .5) * .03, jy: (r() - .5) * .016 });
  }
  return a;
})();
function eyeGlow(T) {
  if (T < 24.5) return 0;
  let arrived = 0; for (let i = 0; i < PART.length; i++) if (T >= T_POUR0 + PART[i].d + PART[i].D) arrived++;
  let g = .08 * sstep(24.5, 26, T) + .38 * arrived / PART.length;
  if (T >= 30) g = Math.max(g, .4 + .6 * sstep(30, 30.35, T)) * (T > 31 ? .94 + .06 * Math.sin(T * 7) : 1);
  return clamp(g);
}
function crystalState(T) {
  if (T < 21.2) return null;
  const born = ramp(T, 21.2, 22.6), rise = eio(ramp(T, 23.2, 26.2));
  const u = lerp(P[0], CP[0], rise) + MX * .03, v = lerp(P[1], CP[1], rise) - .03 * Math.sin(rise * PI) + (T > 26.2 ? .012 * Math.sin(T * 1.3) : 0) + MY * .02;
  return { u, v, sc: (lerp(.15, .62, eout(born)) + .38 * rise) * (T > 30 ? 1 + .05 * Math.sin(T * 2) : 1), alpha: sstep(21.2, 21.8, T) };
}

/* ---------- grid planes ---------- */
function rot3(p, ax, ay, az) {
  let [x, y, z] = p, c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
function planeDefs(T) {
  const A = { cx: -.14, cy: -.50, cz: 2.5, hu: 1.25, hv: .62, ax: -.45 + .08 * Math.sin(T * .4), ay: .22 + .10 * Math.sin(T * .31 + 1), az: .06 * Math.sin(T * .27), off: 0, nu: 11, nv: 6, par: .02 };
  const FL = { cx: 0, cy: 1, cz: 6, hu: 9, hv: 5.5, ax: PI / 2, ay: 0, az: 0, off: .12 };
  let phase = -1, alphaA = 1;
  if (T >= 29.8) {
    const e = eio(ramp(T, 29.8, 31));
    for (const k of Object.keys(FL)) A[k] = lerp(A[k], FL[k], e);
    A.nu = 20; A.nv = 10; A.par = 0; alphaA = sstep(29.8, 30.4, T);
    if (e >= 1) phase = fract((T - 31) * .25) * 1;
  } else if (T >= 20.5) alphaA = 0;
  else alphaA = (1 - ramp(T, 19.4, 20.5)) * (1 - .6 * sstep(11.5, 15.5, T));
  const B = { cx: .22, cy: .52, cz: 2.6, hu: 1.0, hv: .45, ax: .55 + .07 * Math.sin(T * .36 + 2), ay: -.28 + .08 * Math.sin(T * .29), az: -.1, off: 0, nu: 9, nv: 4, par: .035 };
  let alphaB = T < 20.5 ? (1 - ramp(T, 19.4, 20.5)) * (1 - .6 * sstep(11.5, 15.5, T)) : (T >= 29.6 ? sstep(29.6, 30, T) * (1 - sstep(30.1, 30.7, T)) : 0);
  return { A, B, phase, alphaA, alphaB };
}
function planePoint(d, lu, lv, warp) {
  let p = rot3([lu, lv, 0], d.ax, d.ay, d.az);
  const z = p[2] + d.cz; if (z < .25) return null;
  let u = (p[0] + d.cx) / z + MX * d.par, v = (p[1] + d.cy) / z + d.off + MY * d.par;
  if (warp > 0) { const dx = P[0] - u, dy = P[1] - v, dist = Math.hypot(dx, dy), k = warp * .5 * Math.exp(-(dist / .33) * (dist / .33)); u += dx * k; v += dy * k; }
  return [u, v, z];
}
function inkPlane(d, alpha, warp, phase, mode) {
  if (alpha <= .03) return;
  const sub = 3, NU = d.nu * sub, NV = d.nv * sub, floor = phase >= 0 || d.hu > 3;
  const lvl = (z, edge) => clamp(Math.round((floor ? 6.2 - z * .55 : 2.4 + (2.8 - z) * 1.2) * alpha + (edge ? 1.4 : 0)), 0, 7);
  const draw = (a, b, edge) => { if (!a || !b) return; const l0 = lvl(a[2], edge), l1 = lvl(b[2], edge); if (l0 + l1 < 1) return; line(toC(a[0]), toR(a[1]), toC(b[0]), toR(b[1]), F.grn, l0, l1, { behind: true }); };
  const kmax = phase >= 0 ? d.nv - 1 : d.nv;
  for (let k = 0; k <= kmax; k++) {
    let fv = (k + Math.max(0, phase) * d.nv) / d.nv; if (phase >= 0) fv = fract(fv);
    const lv = -d.hv + 2 * d.hv * fv, edge = phase < 0 && (k === 0 || k === d.nv); let prev = null;
    for (let i = 0; i <= NU; i++) { const p = planePoint(d, -d.hu + 2 * d.hu * i / NU, lv, warp); draw(prev, p, edge); prev = p; }
  }
  for (let i = 0; i <= d.nu; i++) {
    const lu = -d.hu + 2 * d.hu * i / d.nu, edge = (i === 0 || i === d.nu); let prev = null;
    for (let j = 0; j <= NV; j++) { const p = planePoint(d, lu, -d.hv + 2 * d.hv * j / NV, warp); draw(prev, p, edge); prev = p; }
  }
  /* twinkling nodes */
  if (phase < 0) for (let i = 0; i <= d.nu; i++) for (let k = 0; k <= d.nv; k++) {
    const p = planePoint(d, -d.hu + 2 * d.hu * i / d.nu, -d.hv + 2 * d.hv * k / d.nv, warp); if (!p) continue;
    const tw = hash(i, k, Math.floor(S_T * 2.2)) > .9;
    if (tw || ((i + k) % 2 === 0)) put(toC(p[0]), toR(p[1]), GI[tw ? '*' : '+'], palId(mode, tw ? F.neu : F.grn, tw ? 7 : Math.round(3 * alpha)), true);
  }
}
let S_T = 0;
function planeQuadCss(d) {
  const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(s => planePoint(d, s[0] * d.hu, s[1] * d.hv, 0));
  return q.every(p => p) ? q.map(p => [toX(p[0]), toY(p[1])]) : null;
}

/* ---------- lasers, burst, prism ---------- */
function glowLine(u0, v0, u1, v1, fam, l0, l1, o) {
  const c0 = toC(u0), r0 = toR(v0), c1 = toC(u1), r1 = toR(v1);
  line(c0, r0, c1, r1, fam, l0, l1, o);
  if (!o || !o.thin) line(c0 + (Math.abs(r1 - r0) * 2 > Math.abs(c1 - c0) ? 1 : 0), r0 + (Math.abs(r1 - r0) * 2 > Math.abs(c1 - c0) ? 0 : 1), c1 + (Math.abs(r1 - r0) * 2 > Math.abs(c1 - c0) ? 1 : 0), r1 + (Math.abs(r1 - r0) * 2 > Math.abs(c1 - c0) ? 0 : 1), fam, Math.max(0, l0 - 1), Math.max(0, l1 - 1), o);
  const steep = Math.abs(r1 - r0) * 2 > Math.abs(c1 - c0);
  const dx = steep ? 1 : 0, dy = steep ? 0 : 1;
  line(c0 + dx, r0 + dy, c1 + dx, r1 + dy, fam, Math.max(0, l0 - 4), Math.max(0, l1 - 4), { glyph: GI['.'], behind: true });
  line(c0 - dx, r0 - dy, c1 - dx, r1 - dy, fam, Math.max(0, l0 - 4), Math.max(0, l1 - 4), { glyph: GI['.'], behind: true });
}
const LASERS = [[[-.42, -.46], [-.20, .62]], [[.34, -.58], [.52, .38]], [[.0, .2], [.12, .66]]];
function inkLasers(T, S) {
  if (T < 20.5) {
    for (let i = 0; i < 3; i++) {
      const g = ramp(T, 3.6 + i * .5, 5.2 + i * .5) * S.fade; if (g <= 0) continue;
      const L = LASERS[i], sway = Math.sin(T * .5 + i) * .01 + MX * .015;
      const u0 = L[0][0] + sway, v0 = L[0][1], u1 = lerp(u0, L[1][0] + sway, g), v1 = lerp(v0, L[1][1], g);
      glowLine(u0, v0, u1, v1, F.mag, 5, 7, {});
      const p = fract(T * .32 + i * .31); if (p < g) { const pu = lerp(u0, L[1][0] + sway, p), pv = lerp(v0, L[1][1], p); put(toC(pu), toR(pv), GI['@'], palId(0, F.neu, 7)); put(toC(pu), toR(pv) + 1, GI['*'], palId(0, F.mag, 7)); }
    }
  } else if (T >= 23.4 && T < 37) {
    const cs = crystalState(T); if (!cs) return;
    const g = ramp(T, 23.4, 25);
    glowLine(-.62, -.56, lerp(-.62, cs.u - .02, g), lerp(-.56, cs.v, g), F.mag, 4, 7, {});
    const g2 = ramp(T, 24.2, 26.2);
    if (g2 > 0) {
      const cols = [F.red, F.yel, F.grn, F.cyn, F.vio, F.mag], fan = [-.02, .1, .22, .34, .46, .58];
      for (let k = 0; k < 6; k++) {
        const a = fan[k] + .03 * Math.sin(T * .6 + k), len = 1.2 * g2;
        glowLine(cs.u + .02, cs.v + .01, cs.u + .02 + Math.cos(a) * len, cs.v + .01 + Math.sin(a) * len, cols[k], 7, 2, {});
      }
    }
  }
}
const RAYS = [[-1.15, .34, F.red], [-.55, .16, F.vio], [.12, .26, F.grn], [.62, .13, F.yel], [1.99, .34, F.red], [2.55, .15, F.cyn], [3.3, .24, F.vio], [3.78, .12, F.grn]];
function inkBurst(T, S) {
  const b = S.burst; if (b <= .02) return;
  const flick = .85 + .15 * Math.sin(T * 23) + (S.ign * .6), rot = T * .04;
  for (let i = 0; i < RAYS.length; i++) {
    const r = RAYS[i], a = r[0] + rot, len = r[1] * 1.35 * Math.min(b, 1.6) * flick * (1 + 1.4 * S.flash);
    const u1 = P[0] + Math.cos(a) * len, v1 = P[1] + Math.sin(a) * len;
    lineU(P[0], P[1], u1, v1, r[2], 7, 4, {});
    lineU(P[0], P[1], P[0] - Math.cos(a) * len * .4, P[1] - Math.sin(a) * len * .4, r[2], 7, 3, {});
    lineU(P[0], P[1], P[0] + Math.cos(a + .05) * len * .6, P[1] + Math.sin(a + .05) * len * .6, F.neu, 7, 5, { glyph: GI['.'] });
  }
  const c = toC(P[0]), rr = toR(P[1]);
  put(c, rr, GI['@'], palId(INK.mode, F.neu, 7));
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(o => put(c + o[0], rr + o[1], GI['#'], palId(INK.mode, F.neu, 6)));
  if (T >= 18.4 && T < 20.5) {
    const sp = T - 18.4;
    for (let k = 0; k < 34; k++) {
      const a = hash(k, 5, 1) * TAU, sp0 = .25 + hash(k, 6, 1) * .5, r = sp * sp0 * .5;
      put(c + Math.cos(a) * r * V.K / V.cw, rr + Math.sin(a) * r * V.K / V.ch, GI[hash(k, 7, 1) > .5 ? '*' : '.'], palId(0, [F.red, F.grn, F.vio, F.yel][k % 4], 6 - Math.floor(sp * 1.5)));
    }
  }
}
function inkParticles(T, S) {
  if (T < 24.8 || T > 31.5) return;
  const gAlpha = sstep(24.8, 26, T);
  for (let i = 0; i < PART.length; i++) {
    const p = PART[i], t0 = T_POUR0 + p.d, u = clamp((T - t0) / p.D);
    if (u >= 1) continue;
    const gx = ghostXf(), sx = gx.p[0] + p.lx * gx.s + MX * .02, sy = gx.p[1] + p.ly * gx.s + .008 * Math.sin(T * 1.1 + p.lx * 9);
    const e = EYES[p.e], tx = e[0] + p.jx, ty = e[1] + p.jy;
    if (u <= 0) { if (gAlpha > .05 && hash(i, 1, Math.floor(T * 3)) > .3) put(toC(sx), toR(sy), GI[hash(i, 2, 2) > .5 ? '.' : ':'], palId(1, F.grn, 2 + Math.round(2 * gAlpha))); continue; }
    const pos = (uu) => { const q = eio(uu), mx = (sx + tx) / 2 + p.cx, my = (sy + ty) / 2 + p.cy; return [(1 - q) * (1 - q) * sx + 2 * (1 - q) * q * mx + q * q * tx, (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * my + q * q * ty]; };
    const a = pos(u); put(toC(a[0]), toR(a[1]), GI['*'], palId(1, F.grn, 7));
    for (let k = 1; k <= 3; k++) { const b = pos(Math.max(0, u - k * .035)); put(toC(b[0]), toR(b[1]), GI[k === 1 ? '+' : '.'], palId(1, F.grn, 6 - k * 1.2)); }
  }
}
function inkCrystal(T) {
  const cs = crystalState(T); if (!cs || !CRY.edges.length) return;
  CRY.edges.forEach(e => lineU(e[0], e[1], e[2], e[3], (e[4] && !INK.mode) ? F.yel : F.grn, e[4] ? 7 : 3, e[4] ? 6 : 3, {}));
  CRY.verts.forEach(v => put(toC(v[0]), toR(v[1]), GI['+'], palId(INK.mode, F.neu, 7)));
  if (cs.alpha > .5) for (let k = 0; k < 7; k++) {
    const a = hash(k, 9, Math.floor(T * 3)) * TAU, r = (.1 + .1 * hash(k, 3, 1)) * cs.sc;
    put(toC(cs.u + Math.cos(a) * r), toR(cs.v + Math.sin(a) * r * .9), GI[hash(k, 4, Math.floor(T * 3)) > .5 ? '+' : '.'], palId(INK.mode, F.grn, 5 + (k % 3)));
  }
}
function inkRipples(S) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i], age = RT - r.t0; if (age > 1.6) { ripples.splice(i, 1); continue; }
    ring(r.u, r.v, age * .45, F.grn, 7 - age * 4, 0, ['o', '.', 'O']);
    ring(r.u, r.v, age * .3, F.mag, 6 - age * 4, 0, ['.', 'o']);
  }
}
function inkStars(T, S) {
  if (S.paper) return;
  for (let i = 0; i < 50; i++) {
    const c = hash(i, 1, 4) * V.cols, r = hash(i, 2, 4) * V.rows * .8;
    const tw = Math.sin(T * (.8 + hash(i, 3, 4) * 1.8) + i);
    if (tw > .55) put(c, r, GI[tw > .88 ? '+' : '.'], palId(0, F.blu, tw > .88 ? 7 : 5), true);
  }
}

/* ---------- backdrop ---------- */
let paperPat = null, wireDark = null, glowC = null;
function makeWireDark() {
  if (!wireDark) wireDark = document.createElement('canvas');
  if (wireDark.width !== wireC.width || wireDark.height !== wireC.height) { wireDark.width = wireC.width; wireDark.height = wireC.height; }
  const g = wireDark.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, wireDark.width, wireDark.height);
  g.drawImage(wireC, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#00130a'; g.fillRect(0, 0, wireDark.width, wireDark.height); g.globalCompositeOperation = 'source-over';
}
function drawBackdrop(T, S, GEO) {
  const c = sctx, W = V.W, H = V.H;
  c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  if (!S.paper) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#03051f'); g.addColorStop(.42, '#0a1672'); g.addColorStop(.82, '#1f3bb0'); g.addColorStop(1, '#2f4fc8');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const sp = .004 + .003 * (i % 3), x = lerp(-.25, 1.25, fract(i * .43 + T * sp + .1)) * W + MX * 30 * (1 + i % 3), y = (.1 + .75 * hash(i, 8, 2)) * H, w = W * (.3 + .3 * hash(i, 9, 2));
      c.globalAlpha = (.08 + .07 * hash(i, 10, 2)) * (1 - S.flash * .5);
      c.drawImage(cloudSprite, x - w / 2, y - w * .18, w, w * .36);
    }
    c.globalAlpha = 1;
    if (wireDark) { c.globalAlpha = .62; c.imageSmoothingEnabled = true; c.drawImage(wireDark, V.OX, V.OY, V.cols * V.cw, V.rows * V.ch); c.globalAlpha = 1; }
    GEO.quads.forEach(q => { if (!q.pts) return; c.fillStyle = 'rgba(30,230,150,' + (.085 * q.alpha) + ')'; c.beginPath(); c.moveTo(q.pts[0][0], q.pts[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q.pts[i][0], q.pts[i][1]); c.closePath(); c.fill(); });
    c.globalCompositeOperation = 'source-over';
  } else {
    c.fillStyle = '#cfcccb'; c.fillRect(0, 0, W, H);
    if (!paperPat) paperPat = c.createPattern(paperTile, 'repeat');
    c.save(); c.globalAlpha = .5; c.fillStyle = paperPat; c.fillRect(0, 0, W, H); c.restore();
  }
}
function radial(c, x, y, r, col0, col1, mode, alpha) {
  c.save(); c.globalCompositeOperation = mode || 'lighter'; c.globalAlpha = alpha === undefined ? 1 : alpha;
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col0); g.addColorStop(1, col1);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}
function drawGlows(T, S, cs, eg) {
  const c = sctx; c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  if (!S.paper) {
    if (!glowC) glowC = document.createElement('canvas');
    const gw = Math.max(8, V.cols >> 2), gh = Math.max(8, V.rows >> 2);
    if (glowC.width !== gw || glowC.height !== gh) { glowC.width = gw; glowC.height = gh; }
    const gg = glowC.getContext('2d'); gg.imageSmoothingEnabled = true; gg.drawImage(paintC, 0, 0, gw, gh);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .55; c.imageSmoothingEnabled = true;
    c.drawImage(glowC, V.OX, V.OY, V.cols * V.cw, V.rows * V.ch); c.restore();
  }
  if (S.burst > .02) radial(c, toX(P[0]), toY(P[1]), V.K * (.06 + .5 * Math.min(S.burst, 1.6) + 1.2 * S.flash), 'rgba(255,255,255,' + Math.min(.85, S.burst * .6 + S.flash) + ')', 'rgba(255,255,255,0)', S.paper ? 'source-over' : 'lighter', S.paper ? .7 : 1);
  if (cs && cs.alpha > .05) radial(c, toX(cs.u), toY(cs.v), V.K * .22 * cs.sc, 'rgba(60,255,150,.5)', 'rgba(60,255,150,0)', S.paper ? 'source-over' : 'lighter', S.paper ? .35 : 1);
  if (eg > .02 && S.paper) [0, 1].map(eyeAt).forEach(e => radial(c, toX(e[0]), toY(e[1]), V.K * (.05 + .13 * eg), 'rgba(40,255,140,' + .8 * eg + ')', 'rgba(40,255,140,0)', 'source-over', 1));
}
function blit() {
  const cpw = V.cpw, cph = V.cph, cols = V.cols, rows = V.rows;
  const ox = Math.round(V.OX * V.dpr), oy = Math.round(V.OY * V.dpr);
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1; sctx.filter = 'none';
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    const i = r * cols + cc, g = CHB[i]; if (!g) continue;
    const ci = COB[i]; if (!atlasFlag[ci * NG + g]) ensureGlyph(ci, g);
    sctx.drawImage(atlas, g * cpw, ci * cph, cpw, cph, ox + cc * cpw, oy + r * cph, cpw, cph);
  }
}
function post(S) {
  const c = sctx; c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  if (S.flash > .003) { c.fillStyle = 'rgba(255,255,255,' + Math.min(1, S.flash * 1.08) + ')'; c.fillRect(0, 0, V.W, V.H); }
  if (S.bw < 1 || S.bh < 1) {
    const bh = Math.max(2, V.H * S.bh), bw = V.W * S.bw;
    c.fillStyle = '#000';
    c.fillRect(0, 0, V.W, (V.H - bh) / 2); c.fillRect(0, (V.H + bh) / 2, V.W, (V.H - bh) / 2);
    c.fillRect(0, (V.H - bh) / 2, (V.W - bw) / 2, bh); c.fillRect((V.W + bw) / 2, (V.H - bh) / 2, (V.W - bw) / 2, bh);
    if (S.bh < .98) { c.fillStyle = 'rgba(225,255,240,.95)'; c.shadowColor = 'rgba(160,255,210,.9)'; c.shadowBlur = 14; c.fillRect((V.W - bw) / 2, V.H / 2 - 1, Math.max(bw, 3), 2); c.shadowBlur = 0; }
  }
}

/* ---------- one frame ---------- */
const PROF = {};
function renderFrame(T) {
  FRAME++; S_T = T; let _t = performance.now(); const lap = k => { const n = performance.now(); PROF[k] = (PROF[k] || 0) * .8 + (n - _t) * .2; _t = n; };
  const S = computeState(T), mode = S.paper; INK.mode = mode;
  if (S.bw <= .001 || S.bh <= .001) {
    sctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); sctx.fillStyle = '#000'; sctx.fillRect(0, 0, V.W, V.H);
    if (S.bw > .001) { sctx.fillStyle = 'rgba(225,255,240,.95)'; sctx.shadowColor = 'rgba(160,255,210,.9)'; sctx.shadowBlur = 14; sctx.fillRect((V.W - V.W * S.bw) / 2, V.H / 2 - 1, Math.max(V.W * S.bw, 3), 2); sctx.shadowBlur = 0; }
    return S;
  }
  const H = handsState(T), cs = crystalState(T), eg = eyeGlow(T);

  V.camX = V.uw < .6 ? camPath(T) : 0;
  /* paint layer */
  pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.globalCompositeOperation = 'source-over'; pctx.globalAlpha = 1; pctx.fillStyle = '#000'; pctx.fillRect(0, 0, paintC.width, paintC.height);
  wctx.setTransform(1, 0, 0, 1, 0, 0); wctx.clearRect(0, 0, wireC.width, wireC.height);
  setPaintTransform();
  if (!mode) {
    paintSky(pctx, T);
    const mx = manXf(T), ma = ramp(T, 4.6, 7) * S.fade * (1 - .55 * sstep(12, 17, T));
    if (ma > .01) paintMan(pctx, T, { x: mx.x, y: mx.y, sc: mx.sc, rot: mx.rot, alpha: ma, hand: H.manHand });
    if (H.real.alpha > .01 && T < 20.5) paintRealHand(pctx, H.real.tip, H.real.ang, H.real.sc, H.real.alpha * S.fade);
    paintTitle(pctx, T);
    /* wire silhouettes */
    const w = H.wire, fa = S.fade;
    if (w.alpha > .02 && fa > .02) {
      paintWireHand(pctx, w.tip, w.ang, w.sc, w.alpha * fa);
      maskWireHand(wctx, w.tip, w.ang, w.sc, w.alpha * fa, false);
      const co = Math.cos(w.ang), si = Math.sin(w.ang);
      const wr = [w.tip[0] + (co * HAND_BACK[0] - si * HAND_BACK[1]) * w.sc, w.tip[1] + (si * HAND_BACK[0] + co * HAND_BACK[1]) * w.sc];
      maskCable(wctx, H.hm, wr, .028 * Math.min(1, w.alpha * 2), .017);
      WIRE.c0 = Math.floor(toC(w.tip[0])); WIRE.r0 = Math.floor(toR(w.tip[1]));
    }
    paintBurstCore(pctx, S.burst, S.flash);
  } else {
    paintBurstCore(pctx, S.burst, 0);
    paintHelmet(pctx, T, eg, MX * .012, MY * .008 + .004 * Math.sin(T * .7));
    const ga = sstep(24.8, 26, T) * (1 - ramp(T, 26.4, 29.9)) * .8;
    if (ga > .01) { const gx = ghostXf(); paintMan(pctx, T, { x: gx.p[0] + MX * .02, y: gx.p[1] + .008 * Math.sin(T * 1.1), sc: gx.s, rot: 0, alpha: ga, hand: 1, hue: ghostc }); }
    if (cs) paintCrystal(pctx, cs.u, cs.v, cs.sc, T * .9 + MX * 2.2, .1 * Math.sin(T * .7) + MX * .25, cs.alpha);
  }
  lap('paint');
  /* develop sweep */
  REV.on = !!mode && T < 24.4;
  if (REV.on) REV.row = Math.floor(lerp(-4, V.rows + 6, ramp(T, 20.8, 24.2)));

  makeWireDark();
  convert(mode);
  lap('convert');

  /* ink layer */
  const PL = planeDefs(T), GEO = { quads: [] };
  if (!mode || PL.alphaA > .03) {
    const warp = S.warp;
    if (PL.alphaA > .03) { inkPlane(PL.A, PL.alphaA, warp, PL.phase, mode); GEO.quads.push({ pts: planeQuadCss(PL.A), alpha: PL.alphaA }); }
    if (PL.alphaB > .03) { inkPlane(PL.B, PL.alphaB, warp, -1, mode); GEO.quads.push({ pts: planeQuadCss(PL.B), alpha: PL.alphaB }); }
  } else if (PL.alphaB > .03) inkPlane(PL.B, PL.alphaB, 0, -1, mode);
  inkStars(T, S);
  inkLasers(T, S);
  inkBurst(T, S);
  if (mode) { inkParticles(T, S); inkCrystal(T); }
  if (REV.on) line(0, REV.row, V.cols - 1, REV.row, F.blu, 3, 5, { glyph: GI['='] });
  if (T >= 30 && T < 31.6) EYES.forEach(e => ring(e[0], e[1], (T - 30) * .55, F.grn, 7 - (T - 30) * 3.5, 0, ['o', '.', 'O', '.']));
  inkRipples(S);

  lap('ink');
  drawBackdrop(T, S, GEO);
  drawGlows(T, S, cs, eg);
  lap('backdrop');
  blit();
  lap('blit');
  post(S);
  return S;
}

'use strict';
/* ============ d_main: loop, UI, sound ============ */
const $ = id => document.getElementById(id);
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let T = RM ? 33 : 0, playing = !RM, lastTs = 0, tmx = 0, tmy = 0, prevT = T, seeking = false;
let dtAcc = 0, dtN = 0, lastCap = '', lastPaper = -1, idleAt = 0;

/* ---------- sound (all synthesised, nothing downloaded) ---------- */
const Aud = {
  ctx: null, on: false,
  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = .0001;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(c.destination);
    const len = Math.floor(c.sampleRate * 2.6), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    this.rev = c.createConvolver(); this.rev.buffer = buf;
    const rg = c.createGain(); rg.gain.value = .55; this.rev.connect(rg); rg.connect(this.master);
    this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(this.master);
    const send = c.createGain(); send.gain.value = .6; this.bus.connect(send); send.connect(this.rev);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.nbuf = nb;
    /* drone */
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 4;
    this.dg = c.createGain(); this.dg.gain.value = .0001; lp.connect(this.dg); this.dg.connect(this.bus);
    [55, 55.35, 82.6].forEach((f, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = i === 2 ? .5 : .32; o.connect(g); g.connect(lp); o.start(); });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .11; lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    /* crt hum */
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60; const hg = c.createGain(); hg.gain.value = .02; hum.connect(hg); hg.connect(this.master); hum.start();
    return true;
  },
  setOn(v) {
    this.on = v; if (v && !this.init()) { this.on = false; return; }
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(v ? .95 : .0001, this.ctx.currentTime, .15);
    if (v && playing) this.ctx.resume(); if (!v) setTimeout(() => { if (!this.on && this.ctx) this.ctx.suspend(); }, 600);
  },
  pause(p) { if (!this.ctx || !this.on) return; p ? this.ctx.suspend() : this.ctx.resume(); },
  tone(type, f0, f1, dur, peak, att, dest) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + (att || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest || this.bus); o.start(t); o.stop(t + dur + .05);
  },
  noise(dur, peak, f0, f1, q, att) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; f.type = 'bandpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + (att || dur * .6)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + dur + .05);
  },
  events: [
    [.05, a => { a.tone('sawtooth', 60, 1400, .5, .06, .02); a.noise(.35, .05, 3000, 9000, 1, .05); }],
    [11.1, a => a.noise(2.4, .09, 500, 4200, 3, 1.4)],
    [15.2, a => { a.tone('sine', 420, 2100, 3.2, .05, 2.6); a.tone('triangle', 210, 1050, 3.2, .04, 2.6); }],
    [18.4, a => { [1318.5, 1975.5, 2637, 3951].forEach((f, i) => a.tone('sine', f, 0, 3.6 - i * .5, .09 / (i + 1), .004)); a.noise(.9, .07, 7000, 12000, .7, .01); }],
    [19.3, a => a.noise(1.3, .16, 300, 7000, 1.2, 1.2)],
    [20.5, a => { a.tone('sine', 90, 30, 1.6, .5, .005); a.noise(1.4, .08, 4000, 400, .8, .01); }],
    [21.2, a => { a.tone('sine', 880, 0, 2.6, .07, .01); a.tone('sine', 1320.5, 0, 2.2, .05, .01); a.tone('triangle', 440, 0, 3, .05, .6); }],
    [26.2, a => { for (let i = 0; i < 22; i++) setTimeout(() => { if (a.ctx && a.on) a.tone('sine', 700 + Math.random() * 2400, 0, .18, .035, .004); }, i * 150 + Math.random() * 90); }],
    [30.0, a => { a.tone('sine', 150, 42, .7, .7, .004); a.noise(.35, .18, 900, 160, .8, .004); setTimeout(() => { if (a.ctx && a.on) { a.tone('sine', 130, 40, .7, .5, .004); a.noise(.3, .1, 800, 140, .8, .004); } }, 430); }],
    [31.0, a => { [110, 164.8, 220, 277.2].forEach((f, i) => a.tone('sine', f, 0, 6, .06, 2.2 + i * .3)); }],
    [37.3, a => { a.tone('sawtooth', 1200, 40, 1, .06, .01); a.noise(.9, .06, 6000, 300, 1, .02); }]
  ],
  run(p, t) { if (!this.on || !this.ctx) return; for (const e of this.events) if (p < e[0] && t >= e[0] && t - p < .6) e[1](this); },
  mood(t) { if (!this.on || !this.ctx) return; const lv = t < 20.5 ? .14 : t < 30 ? .18 : .24; this.dg.gain.setTargetAtTime(lv, this.ctx.currentTime, .4); }
};

/* ---------- ui ---------- */
const CAPS = [[0, ''], [1.2, 'signal'], [6, 'a ghost, hanging in the grid'], [11, 'his hand goes to wire'], [16.8, 'almost touching'], [20.2, 'developing'], [24.4, 'the ghost goes looking for a shell'], [30, 'armor, lit'], [37, '']];
const capOf = t => { let s = ''; for (const c of CAPS) if (t >= c[0]) s = c[1]; return s; };
const fmt = t => { t = Math.floor(t); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
function ui(S) {
  $('tc').textContent = fmt(T) + ' / ' + fmt(DUR);
  if (!seeking) $('seek').value = Math.round(T / DUR * 1000);
  const c = capOf(T); if (c !== lastCap) { $('cap').textContent = c; lastCap = c; }
  if (S && S.paper !== lastPaper) { document.body.classList.toggle('paper', !!S.paper); lastPaper = S.paper; }
  $('play').textContent = playing ? 'pause' : 'play';
  $('bar').classList.toggle('idle', performance.now() > idleAt && playing);
}
function wake() { idleAt = performance.now() + 3200; }
function setPlaying(p) { playing = p; Aud.pause(!p); $('hint').classList.remove('on'); wake(); }
function setSound(v) { Aud.setOn(v); $('snd').textContent = Aud.on ? 'sound on' : 'sound off'; $('snd').setAttribute('aria-pressed', Aud.on ? 'true' : 'false'); prevT = T; }

$('play').addEventListener('click', () => setPlaying(!playing));
$('snd').addEventListener('click', () => setSound(!Aud.on));
const seek = $('seek');
seek.addEventListener('input', () => { seeking = true; T = seek.value / 1000 * DUR; prevT = T; wake(); renderNow(); });
seek.addEventListener('change', () => { seeking = false; });
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  else if (e.code === 'ArrowRight') { T = Math.min(DUR - .05, T + 2); prevT = T; wake(); renderNow(); }
  else if (e.code === 'ArrowLeft') { T = Math.max(0, T - 2); prevT = T; wake(); renderNow(); }
  else if (e.key === 'm' || e.key === 'M') setSound(!Aud.on);
});
stage.addEventListener('pointermove', e => { tmx = e.clientX / V.W - .5; tmy = e.clientY / V.H - .5; wake(); });
stage.addEventListener('pointerdown', e => {
  wake(); const r = stage.getBoundingClientRect();
  ripples.push({ t0: RT, u: (e.clientX - r.left - V.W / 2) / V.K + V.camX, v: (e.clientY - r.top - V.H / 2) / V.K });
  if (!playing && RM) setPlaying(true);
  if (Aud.on && Aud.ctx) Aud.tone('sine', 1560, 0, .6, .05, .004);
});
stage.addEventListener('pointerleave', () => { tmx = 0; tmy = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden) Aud.pause(true); else if (playing) Aud.pause(false); lastTs = 0; });
let rzT = 0;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { layout(); renderNow(); }, 120); });

function renderNow() { const S = renderFrame(T); ui(S); return S; }
function tick(ts) {
  RT = ts / 1000;
  const dt = lastTs ? Math.min(.1, (ts - lastTs) / 1000) : .016; lastTs = ts;
  MX += (tmx - MX) * (1 - Math.exp(-dt * 5)); MY += (tmy - MY) * (1 - Math.exp(-dt * 5));
  if (playing) {
    const p = T; T += dt;
    if (T >= DUR) { T -= DUR; prevT = -1; } else { Aud.run(p, T); prevT = T; }
    Aud.mood(T);
  }
  const t0 = performance.now();
  const S = renderFrame(T); ui(S);
  /* adaptive quality: bigger glyphs if the machine is struggling */
  dtAcc += performance.now() - t0 + (dt * 1000 > 40 ? dt * 500 : 0); dtN++;
  if (dtN >= 90) { const avg = dtAcc / dtN; dtAcc = 0; dtN = 0; if (avg > 20 && targetCw < 15 && playing) { targetCw *= 1.16; layout(); } }
  requestAnimationFrame(tick);
}

layout();
wake();
if (RM) { $('hint').classList.add('on'); renderNow(); }
window.__film = { PROF, seek(t) { T = t; prevT = t; renderNow(); }, pause() { playing = false; }, get T() { return T; }, V, Aud };
requestAnimationFrame(tick);

