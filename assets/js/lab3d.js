/* lab3d.js: three small WebGL scenes, written from scratch (no libraries).
   1. Heat relief: an image lifted into 3D by how hot each pixel is.
   2. Pixel monolith: every pixel of a portrait becomes a bar.
   3. Crystal: the plumb crystal in real 3D over a scrolling grid.
   Drag to orbit. Arrow keys also orbit when a scene is focused. */
(function () {
"use strict";
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s) { return document.querySelector(s); };
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function smooth(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

/* ---------- tiny vector and matrix helpers (column-major, like GL) ---------- */
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function nrm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function persp(f, a, n, fr) { var t = 1 / Math.tan(f / 2), nf = 1 / (n - fr); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) * nf, -1, 0, 0, 2 * fr * n * nf, 0]); }
function lookAt(e, c, u) {
  var z = nrm(sub(e, c)), x = nrm(cross(u, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function mul(a, b) {
  var o = new Float32Array(16), c, r, k, s;
  for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) { s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
function transl(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
function scl(x, y, z) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); }
var IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/* ---------- GL helpers ---------- */
function getGL(canvas) {
  var o = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
  try { return canvas.getContext('webgl', o) || canvas.getContext('experimental-webgl', o); } catch (e) { return null; }
}
function compile(gl, type, src) {
  var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs, attrs, unis) {
  var p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  var A = {}, U = {};
  attrs.forEach(function (n) { A[n] = gl.getAttribLocation(p, n); });
  unis.forEach(function (n) { U[n] = gl.getUniformLocation(p, n); });
  return { p: p, A: A, U: U };
}
function buf(gl, data, target) {
  var b = gl.createBuffer(); target = target || gl.ARRAY_BUFFER;
  gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
}
function tex(gl, img) {
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function attrib(gl, loc, size, stride, offset) {
  if (loc < 0) return;
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
}
function loadImage(src) {
  return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('image failed: ' + src)); }; im.src = src; });
}
function pixels(img, w, h) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;   /* throws if the browser blocks it (opened as a local file) */
}

/* ---------- orbit rig: drag, keyboard, smooth damping ---------- */
function Rig(canvas, o, onChange) {
  var s = { yaw: o.yaw, pitch: o.pitch, dist: o.dist, ty: o.yaw, tp: o.pitch, td: o.dist, drag: false, lx: 0, ly: 0, ptr: null, sway: o.sway || 0, auto: o.auto || 0, t: 0 };
  function poke() { if (onChange) onChange(); }
  canvas.addEventListener('pointerdown', function (e) { s.drag = true; s.lx = e.clientX; s.ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    s.ptr = { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -(((e.clientY - r.top) / r.height) * 2 - 1), on: true };
    if (s.drag) {
      var dx = e.clientX - s.lx, dy = e.clientY - s.ly; s.lx = e.clientX; s.ly = e.clientY;
      s.ty -= dx * 0.008;
      if (e.pointerType === 'mouse') s.tp = clamp(s.tp + dy * 0.006, o.pmin, o.pmax);   /* touch keeps vertical drags for page scroll */
    }
    poke();
  });
  function up() { s.drag = false; }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', function () { if (s.ptr) s.ptr.on = false; poke(); });
  canvas.addEventListener('dblclick', function () { s.ty = o.yaw; s.tp = o.pitch; s.td = o.dist; poke(); });
  canvas.addEventListener('keydown', function (e) {
    var k = e.key, h = true;
    if (k === 'ArrowLeft') s.ty += 0.15; else if (k === 'ArrowRight') s.ty -= 0.15;
    else if (k === 'ArrowUp') s.tp = clamp(s.tp + 0.1, o.pmin, o.pmax); else if (k === 'ArrowDown') s.tp = clamp(s.tp - 0.1, o.pmin, o.pmax);
    else if (k === '+' || k === '=') s.td = clamp(s.td - 0.25, o.dmin, o.dmax); else if (k === '-') s.td = clamp(s.td + 0.25, o.dmin, o.dmax);
    else if (k === 'Home' || k === '0') { s.ty = o.yaw; s.tp = o.pitch; s.td = o.dist; }
    else h = false;
    if (h) { e.preventDefault(); poke(); }
  });
  /* returns true while still moving, so reduced-motion pages keep drawing until it settles */
  s.step = function (t, dt) {
    s.t = t;
    if (!s.drag && s.auto && !RM) s.ty += s.auto * dt;
    var k = 1 - Math.exp(-dt * 9), dy = s.ty - s.yaw, dp = s.tp - s.pitch, dd = s.td - s.dist;
    s.yaw += dy * k; s.pitch += dp * k; s.dist += dd * k;
    return Math.abs(dy) + Math.abs(dp) + Math.abs(dd) > 1e-3 || s.drag;
  };
  s.eye = function (tg) {
    var yaw = s.yaw + (RM ? 0 : s.sway * Math.sin(s.t * 0.3)), cp = Math.cos(s.pitch);
    return [tg[0] + s.dist * cp * Math.sin(yaw), tg[1] + s.dist * Math.sin(s.pitch), tg[2] + s.dist * cp * Math.cos(yaw)];
  };
  return s;
}
function rayAt(rig, tg, aspect, fov, nx, ny) {
  var e = rig.eye(tg), f = nrm(sub(tg, e)), r = nrm(cross(f, [0, 1, 0])), u = cross(r, f), th = Math.tan(fov / 2);
  return { o: e, d: nrm([f[0] + r[0] * nx * th * aspect + u[0] * ny * th, f[1] + r[1] * nx * th * aspect + u[1] * ny * th, f[2] + r[2] * nx * th * aspect + u[2] * ny * th]) };
}
function hitY(ray, y) { if (Math.abs(ray.d[1]) < 1e-4) return null; var t = (y - ray.o[1]) / ray.d[1]; return t < 0 ? null : [ray.o[0] + ray.d[0] * t, ray.o[2] + ray.d[2] * t]; }
function hitZ(ray, z) { if (Math.abs(ray.d[2]) < 1e-4) return null; var t = (z - ray.o[2]) / ray.d[2]; return t < 0 ? null : [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t]; }

/* ---------- runner: draws only while on screen ---------- */
function runner(box, canvas, piece) {
  var vis = false, need = true, last = 0;
  new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) need = true; }).observe(box);
  function size() {
    var d = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); need = true; }
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!vis || document.hidden) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    size();
    var moving = piece.update(ts / 1000, dt);
    if (RM && !moving && !need) return;
    piece.draw(ts / 1000); need = false;
  }
  requestAnimationFrame(frame);
  return { wake: function () { need = true; } };
}
function failBox(box, msg, err) {
  if (err && window.console) console.warn('lab3d fallback:', err);
  box.classList.add('nogl');
  var m = box.querySelector('.vmsg'); if (m && msg) m.textContent = msg;
}
var NOGL = '3D view unavailable here. Your browser has WebGL turned off, or this page was opened as a local file. Open the live site, or run a local server (see the README).';
function pressed(btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }

/* =====================================================================
   1. HEAT RELIEF
   ===================================================================== */
var RELIEF_VS = [
'precision highp float;',
'attribute vec2 aXZ; attribute vec2 aUV; attribute float aH; attribute vec2 aG;',
'uniform mat4 uVP; uniform float uAmp; uniform vec3 uP; uniform float uRing; uniform float uRingA; uniform vec2 uRC;',
'varying vec2 vUV; varying float vH; varying vec3 vN; varying float vRing;',
'void main(){',
'  float dr = length(aXZ - uRC);',
'  float ring = exp(-pow((dr - uRing) * 5.0, 2.0)) * uRingA;',
'  float dh = length(aXZ - uP.xy);',
'  float hov = exp(-dh * dh * 7.0) * uP.z;',
'  float h = aH * uAmp + ring * 0.11 * (0.3 + aH) + hov * 0.05 * (0.3 + aH);',
'  vec3 p = vec3(aXZ.x, h, aXZ.y);',
'  vN = normalize(vec3(-aG.x * uAmp, 1.0, -aG.y * uAmp));',
'  vUV = aUV; vH = aH; vRing = ring;',
'  gl_Position = uVP * vec4(p, 1.0);',
'}'].join('\n');
var RELIEF_FS = [
'precision mediump float;',
'uniform sampler2D uTex; uniform float uContour; uniform float uTimeF; uniform float uAmpF;',
'varying vec2 vUV; varying float vH; varying vec3 vN; varying float vRing;',
'void main(){',
'  vec3 c = texture2D(uTex, vUV).rgb;',
'  float lam = clamp(dot(normalize(vN), normalize(vec3(-0.45, 0.85, 0.35))), 0.0, 1.0);',
'  c *= mix(1.0, 0.45 + 0.75 * lam, smoothstep(0.0, 0.2, uAmpF));',
'  float g = abs(fract(vH * 12.0) - 0.5) * 2.0;',
'  float line = smoothstep(0.88, 1.0, g) * step(0.05, vH) * uContour;',
'  c = mix(c, vec3(0.18, 1.0, 0.9), line * 0.85);',
'  c += vec3(1.0, 0.92, 0.55) * vRing * 0.7;',
'  float sc = exp(-pow((fract(uTimeF * 0.07) - vUV.y) * 22.0, 2.0));',
'  c += vec3(0.25, 0.9, 0.7) * sc * 0.12;',
'  gl_FragColor = vec4(c, 1.0);',
'}'].join('\n');

function buildRelief(box, canvas, img) {
  var gl = getGL(canvas); if (!gl) { failBox(box, NOGL); return; }
  var GXn = 200, GYn = Math.round(GXn * img.height / img.width), PW = 1.6, PH = PW * img.height / img.width;
  var px;
  try { px = pixels(img, GXn, GYn); } catch (e) { failBox(box, NOGL, e); return; }
  var i, x, y, H = new Float32Array(GXn * GYn), H2 = new Float32Array(GXn * GYn);
  for (i = 0; i < H.length; i++) {
    var r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    H[i] = smooth(0.28, 0.95, Math.max(0, r * 0.9 + g * 0.25 - b * 0.35));
  }
  for (var pass = 0; pass < 2; pass++) {       /* soften silhouettes */
    for (y = 0; y < GYn; y++) for (x = 0; x < GXn; x++) {
      var s = 0, n = 0, dx, dy;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GXn && yy < GYn) { s += H[yy * GXn + xx]; n++; } }
      H2[y * GXn + x] = s / n;
    }
    H.set(H2);
  }
  var cx = PW / (GXn - 1), cz = PH / (GYn - 1), V = new Float32Array(GXn * GYn * 7), o = 0;
  for (y = 0; y < GYn; y++) for (x = 0; x < GXn; x++) {
    var h0 = H[y * GXn + x];
    var gx = (H[y * GXn + Math.min(GXn - 1, x + 1)] - H[y * GXn + Math.max(0, x - 1)]) / (2 * cx);
    var gz = (H[Math.min(GYn - 1, y + 1) * GXn + x] - H[Math.max(0, y - 1) * GXn + x]) / (2 * cz);
    V[o++] = (x / (GXn - 1) - 0.5) * PW; V[o++] = (y / (GYn - 1) - 0.5) * PH;
    V[o++] = x / (GXn - 1); V[o++] = y / (GYn - 1); V[o++] = h0; V[o++] = gx; V[o++] = gz;
  }
  var idx = new Uint16Array((GXn - 1) * (GYn - 1) * 6), q = 0;
  for (y = 0; y < GYn - 1; y++) for (x = 0; x < GXn - 1; x++) {
    var a = y * GXn + x, b2 = a + 1, c2 = a + GXn, d2 = c2 + 1;
    idx[q++] = a; idx[q++] = c2; idx[q++] = b2; idx[q++] = b2; idx[q++] = c2; idx[q++] = d2;
  }
  var pr, vb, ib, tx;
  try {
    pr = program(gl, RELIEF_VS, RELIEF_FS, ['aXZ', 'aUV', 'aH', 'aG'], ['uVP', 'uAmp', 'uP', 'uRing', 'uRingA', 'uRC', 'uTex', 'uContour', 'uTimeF', 'uAmpF']);
    vb = buf(gl, V); ib = buf(gl, idx, gl.ELEMENT_ARRAY_BUFFER); tx = tex(gl, img);
  } catch (e) { failBox(box, NOGL, e); return; }

  var tg = [0, 0.12, 0], fov = 42 * Math.PI / 180;
  var st = { amp: 0, ampT: 0.36, contour: 1, hov: 0, ring: 0, ringA: 0, rc: [0, 0], lastPulse: 0, ptrXZ: [0, 0] };
  var run;
  var rig = Rig(canvas, { yaw: 0, pitch: 0.8, dist: 2.85, pmin: 0.12, pmax: 1.5, dmin: 1.6, dmax: 6, sway: 0.1 }, function () { if (run) run.wake(); });
  function pulse(x, z) { st.rc = [x, z]; st.ring = 0; st.ringA = 1; if (run) run.wake(); }
  canvas.addEventListener('click', function () { if (rig.ptr && st.hit) pulse(st.hit[0], st.hit[1]); else pulse(0, 0); });

  var bRel = $('#rl-relief'), bFlat = $('#rl-flat'), bCon = $('#rl-contour'), bPulse = $('#rl-pulse');
  function setMode(relief) { st.ampT = relief ? 0.36 : 0; pressed(bRel, relief); pressed(bFlat, !relief); if (run) run.wake(); }
  bRel.addEventListener('click', function () { setMode(true); });
  bFlat.addEventListener('click', function () { setMode(false); });
  bCon.addEventListener('click', function () { st.contour = st.contour ? 0 : 1; pressed(bCon, st.contour); if (run) run.wake(); });
  bPulse.addEventListener('click', function () { pulse(0, 0); });
  pressed(bRel, true); pressed(bFlat, false); pressed(bCon, true);

  var piece = {
    update: function (t, dt) {
      var mv = rig.step(t, dt);
      st.amp += (st.ampT - st.amp) * (1 - Math.exp(-dt * 4));
      var want = rig.ptr && rig.ptr.on ? 1 : 0;
      st.hov += (want - st.hov) * (1 - Math.exp(-dt * 8));
      if (st.ringA > 0) { st.ring += dt * 1.4; st.ringA = Math.max(0, st.ringA - dt * 0.5); mv = true; }
      if (!RM && t - st.lastPulse > 7 && !rig.drag) { st.lastPulse = t; pulse(-0.6 + Math.random() * 1.2, -0.8 + Math.random() * 1.6); }
      return mv || Math.abs(st.ampT - st.amp) > 1e-3 || st.hov > 0.01;
    },
    draw: function (t) {
      var asp = canvas.width / canvas.height, e = rig.eye(tg);
      var VP = mul(persp(fov, asp, 0.1, 40), lookAt(e, tg, [0, 1, 0]));
      st.hit = null;
      if (rig.ptr && rig.ptr.on) st.hit = hitY(rayAt(rig, tg, asp, fov, rig.ptr.nx, rig.ptr.ny), 0);
      if (st.hit) st.ptrXZ = st.hit;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.012, 0.014, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(pr.p);
      gl.uniformMatrix4fv(pr.U.uVP, false, VP);
      gl.uniform1f(pr.U.uAmp, st.amp); gl.uniform1f(pr.U.uAmpF, st.amp); gl.uniform3f(pr.U.uP, st.ptrXZ[0], st.ptrXZ[1], st.hov);
      gl.uniform1f(pr.U.uRing, st.ring); gl.uniform1f(pr.U.uRingA, st.ringA); gl.uniform2f(pr.U.uRC, st.rc[0], st.rc[1]);
      gl.uniform1f(pr.U.uContour, st.contour); gl.uniform1f(pr.U.uTimeF, t);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(pr.U.uTex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      attrib(gl, pr.A.aXZ, 2, 7, 0); attrib(gl, pr.A.aUV, 2, 7, 2); attrib(gl, pr.A.aH, 1, 7, 4); attrib(gl, pr.A.aG, 2, 7, 5);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    }
  };
  run = runner(box, canvas, piece);
  canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); failBox(box, NOGL); });
}

/* =====================================================================
   2. PIXEL MONOLITH
   ===================================================================== */
var MONO_VS = [
'precision highp float;',
'attribute vec3 aL; attribute float aF; attribute vec2 aC; attribute float aH;',
'uniform mat4 uVP; uniform vec2 uSize; uniform float uCell; uniform float uAmp; uniform float uTime; uniform float uWave;',
'uniform vec3 uP; uniform vec3 uS; uniform float uSA;',
'varying vec2 vC; varying float vF; varying float vZ;',
'void main(){',
'  vec2 xy = vec2((aC.x - 0.5) * uSize.x, (0.5 - aC.y) * uSize.y);',
'  float d = length(xy - uP.xy);',
'  float push = exp(-d * d * 16.0) * uP.z;',
'  float wave = 0.5 + 0.5 * sin(aC.x * 16.0 + aC.y * 11.0 - uTime * 1.8);',
'  float sd = length(xy - uS.xy);',
'  float shock = exp(-pow((sd - uS.z) * 7.0, 2.0)) * uSA;',
'  float h = aH * uAmp * (1.0 + 0.5 * wave * uWave) + push * 0.32 + shock * 0.3;',
'  h = max(h, 0.015);',
'  vec3 p = vec3(xy + aL.xy * uCell, aL.z * h);',
'  vC = aC; vF = aF; vZ = aL.z;',
'  gl_Position = uVP * vec4(p, 1.0);',
'}'].join('\n');
var MONO_FS = [
'precision mediump float;',
'uniform sampler2D uTex; uniform float uTimeF;',
'varying vec2 vC; varying float vF; varying float vZ;',
'void main(){',
'  vec3 c = texture2D(uTex, vC).rgb;',
'  if (vF > 0.5) {',
'    float k = vF < 1.5 ? 0.62 : (vF < 2.5 ? 0.36 : (vF < 3.5 ? 0.8 : 0.5));',
'    c *= k * mix(0.4, 1.0, vZ);',
'  }',
'  float band = exp(-pow((fract(uTimeF * 0.11) - vC.y) * 14.0, 2.0));',
'  c += vec3(1.0) * band * 0.26;',
'  gl_FragColor = vec4(c, 1.0);',
'}'].join('\n');

function buildMonolith(box, canvas, img) {
  var gl = getGL(canvas); if (!gl) { failBox(box, NOGL); return; }
  var BX = 64, BY = Math.round(BX * img.height / img.width), PW = 1.5, PH = PW * img.height / img.width, cell = PW / BX;
  var px;
  try { px = pixels(img, BX, BY); } catch (e) { failBox(box, NOGL, e); return; }
  var n = BX * BY, lum = new Float32Array(n), i, lo = 9, hi = -9;
  for (i = 0; i < n; i++) {
    lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    if (lum[i] < lo) lo = lum[i]; if (lum[i] > hi) hi = lum[i];
  }
  /* darker pixels stand taller; the bright background stays low */
  var FACES = [   /* id, four corners (x, y, z) of a unit bar; z runs 0 (base) to 1 (top) */
    [0, [[-.5, -.5, 1], [.5, -.5, 1], [.5, .5, 1], [-.5, .5, 1]]],
    [1, [[.5, -.5, 0], [.5, .5, 0], [.5, .5, 1], [.5, -.5, 1]]],
    [2, [[-.5, .5, 0], [-.5, -.5, 0], [-.5, -.5, 1], [-.5, .5, 1]]],
    [3, [[.5, .5, 0], [-.5, .5, 0], [-.5, .5, 1], [.5, .5, 1]]],
    [4, [[-.5, -.5, 0], [.5, -.5, 0], [.5, -.5, 1], [-.5, -.5, 1]]]
  ];
  var V = new Float32Array(n * 30 * 7), o = 0, bx, by, f, k, quad = [0, 1, 2, 0, 2, 3];
  for (by = 0; by < BY; by++) for (bx = 0; bx < BX; bx++) {
    var l = (lum[by * BX + bx] - lo) / Math.max(0.0001, hi - lo), h = Math.pow(1 - l, 1.15);
    var cxn = (bx + 0.5) / BX, cyn = (by + 0.5) / BY;
    for (f = 0; f < FACES.length; f++) {
      var fid = FACES[f][0], cs = FACES[f][1];
      for (k = 0; k < 6; k++) {
        var c = cs[quad[k]];
        V[o++] = c[0] * 0.9; V[o++] = c[1] * 0.9; V[o++] = c[2]; V[o++] = fid; V[o++] = cxn; V[o++] = cyn; V[o++] = h;
      }
    }
  }
  var pr, vb, tx;
  try {
    pr = program(gl, MONO_VS, MONO_FS, ['aL', 'aF', 'aC', 'aH'], ['uVP', 'uSize', 'uCell', 'uAmp', 'uTime', 'uTimeF', 'uWave', 'uP', 'uS', 'uSA', 'uTex']);
    vb = buf(gl, V); tx = tex(gl, img);
  } catch (e) { failBox(box, NOGL, e); return; }

  var tg = [0, 0, 0.12], fov = 38 * Math.PI / 180;
  var st = { amp: 0, ampT: 0.62, wave: 0, hov: 0, shock: 0, shockA: 0, sc: [0, 0], hit: null, ptr: [0, 0] };
  var run;
  var rig = Rig(canvas, { yaw: 0.35, pitch: 0.16, dist: 4.3, pmin: -0.5, pmax: 1.3, dmin: 1.8, dmax: 6, sway: 0.12 }, function () { if (run) run.wake(); });
  canvas.addEventListener('click', function () { if (st.hit) { st.sc = [st.hit[0], st.hit[1]]; } else { st.sc = [0, 0]; } st.shock = 0; st.shockA = 1; if (run) run.wake(); });
  var bMono = $('#pm-mono'), bFlat = $('#pm-flat'), bWave = $('#pm-wave');
  function setMode(m) { st.ampT = m ? 0.62 : 0.03; pressed(bMono, m); pressed(bFlat, !m); if (run) run.wake(); }
  bMono.addEventListener('click', function () { setMode(true); });
  bFlat.addEventListener('click', function () { setMode(false); });
  bWave.addEventListener('click', function () { st.wave = st.wave ? 0 : 1; pressed(bWave, st.wave); if (run) run.wake(); });
  pressed(bMono, true); pressed(bFlat, false); pressed(bWave, false);

  var piece = {
    update: function (t, dt) {
      var mv = rig.step(t, dt);
      st.amp += (st.ampT - st.amp) * (1 - Math.exp(-dt * 4));
      st.hov += ((rig.ptr && rig.ptr.on ? 1 : 0) - st.hov) * (1 - Math.exp(-dt * 8));
      if (st.shockA > 0) { st.shock += dt * 1.5; st.shockA = Math.max(0, st.shockA - dt * 0.55); mv = true; }
      return mv || Math.abs(st.ampT - st.amp) > 1e-3 || st.hov > 0.01 || !!st.wave;
    },
    draw: function (t) {
      var asp = canvas.width / canvas.height, e = rig.eye(tg);
      var VP = mul(persp(fov, asp, 0.1, 40), lookAt(e, tg, [0, 1, 0]));
      st.hit = null;
      if (rig.ptr && rig.ptr.on) st.hit = hitZ(rayAt(rig, tg, asp, fov, rig.ptr.nx, rig.ptr.ny), 0.1);
      if (st.hit) st.ptr = st.hit;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.01, 0.01, 0.014, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(pr.p);
      gl.uniformMatrix4fv(pr.U.uVP, false, VP);
      gl.uniform2f(pr.U.uSize, PW, PH); gl.uniform1f(pr.U.uCell, cell); gl.uniform1f(pr.U.uAmp, st.amp);
      gl.uniform1f(pr.U.uTime, t); gl.uniform1f(pr.U.uTimeF, t); gl.uniform1f(pr.U.uWave, st.wave);
      gl.uniform3f(pr.U.uP, st.ptr[0], st.ptr[1], st.hov); gl.uniform3f(pr.U.uS, st.sc[0], st.sc[1], st.shock); gl.uniform1f(pr.U.uSA, st.shockA);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(pr.U.uTex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      attrib(gl, pr.A.aL, 3, 7, 0); attrib(gl, pr.A.aF, 1, 7, 3); attrib(gl, pr.A.aC, 2, 7, 4); attrib(gl, pr.A.aH, 1, 7, 6);
      gl.drawArrays(gl.TRIANGLES, 0, n * 30);
    }
  };
  run = runner(box, canvas, piece);
  canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); failBox(box, NOGL); });
}

/* =====================================================================
   3. CRYSTAL
   ===================================================================== */
var FACE_VS = [
'precision highp float;',
'attribute vec3 aP; attribute vec3 aN;',
'uniform mat4 uVP; uniform mat4 uM; uniform vec3 uEye;',
'varying vec3 vN; varying vec3 vV;',
'void main(){ vec4 w = uM * vec4(aP, 1.0); vN = mat3(uM) * aN; vV = uEye - w.xyz; gl_Position = uVP * w; }'].join('\n');
var FACE_FS = [
'precision mediump float;',
'uniform vec3 uColor; uniform float uAlpha;',
'varying vec3 vN; varying vec3 vV;',
'void main(){',
'  vec3 N = normalize(vN), V = normalize(vV), L = normalize(vec3(-0.5, 0.7, 0.6));',
'  float d = abs(dot(N, L));',
'  float fr = pow(1.0 - abs(dot(N, V)), 2.0);',
'  float s = pow(max(dot(reflect(-L, N), V), 0.0), 22.0);',
'  vec3 col = uColor * (0.06 + 0.34 * d) + vec3(0.7, 1.0, 0.85) * s * 0.7 + uColor * fr * 0.8;',
'  gl_FragColor = vec4(col * uAlpha, 1.0);',
'}'].join('\n');
var LINE_VS = [
'precision highp float;',
'attribute vec3 aP; uniform mat4 uVP; uniform mat4 uM; uniform float uScroll; uniform float uFloor;',
'varying vec3 vW;',
'void main(){ vec3 p = aP; if (uFloor > 0.5) { p.z = mod(p.z + uScroll + 5.0, 10.0) - 5.0; } vec4 w = uM * vec4(p, 1.0); vW = w.xyz; gl_Position = uVP * w; }'].join('\n');
var LINE_FS = [
'precision mediump float;',
'uniform vec3 uColor; uniform float uAlpha; uniform float uFade; varying vec3 vW;',
'void main(){ float f = 1.0; if (uFade > 0.5) { f = 1.0 - clamp(length(vW.xz) / 5.2, 0.0, 1.0); f = f * f; } gl_FragColor = vec4(uColor * uAlpha * f, 1.0); }'].join('\n');
var SPK_VS = [
'precision highp float;',
'attribute vec3 aP; attribute vec4 aC; uniform mat4 uVP; uniform float uTime; uniform float uPx;',
'varying vec3 vCol; varying float vA;',
'void main(){',
'  vec3 p = aP; p.y += sin(uTime * 0.5 + aC.w * 6.28) * 0.12; p.x += cos(uTime * 0.37 + aC.w * 9.0) * 0.08;',
'  vec4 c = uVP * vec4(p, 1.0);',
'  float tw = 0.55 + 0.45 * sin(uTime * 2.2 + aC.w * 40.0);',
'  gl_PointSize = (2.0 + 5.0 * aC.w) * uPx * tw * (3.2 / max(c.w, 0.5));',
'  vCol = aC.xyz; vA = tw; gl_Position = c;',
'}'].join('\n');
var SPK_FS = [
'precision mediump float;',
'varying vec3 vCol; varying float vA;',
'void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol * a * vA, 1.0); }'].join('\n');

function crystalGeometry(n) {
  var H = 1.0, R = 0.56, T = [0, H, 0], B = [0, -H, 0], E = [], k, pos = [], nor = [], lines = [];
  for (k = 0; k < n; k++) { var a = k * Math.PI * 2 / n + Math.PI / n; E.push([R * Math.cos(a), 0, R * Math.sin(a)]); }
  function tri(a, b, c) {
    var nn = nrm(cross(sub(b, a), sub(c, a))), cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(nn, cen) < 0) nn = [-nn[0], -nn[1], -nn[2]];
    [a, b, c].forEach(function (p) { pos.push(p[0], p[1], p[2]); nor.push(nn[0], nn[1], nn[2]); });
  }
  for (k = 0; k < n; k++) {
    var e0 = E[k], e1 = E[(k + 1) % n];
    tri(T, e0, e1); tri(B, e1, e0);
    lines.push(T[0], T[1], T[2], e0[0], e0[1], e0[2], B[0], B[1], B[2], e0[0], e0[1], e0[2], e0[0], e0[1], e0[2], e1[0], e1[1], e1[2]);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), lines: new Float32Array(lines), nTri: n * 6, nLine: n * 6 };
}

function buildCrystal(box, canvas) {
  var gl = getGL(canvas); if (!gl) { failBox(box, NOGL); return; }
  var fp, lp, sp;
  try {
    fp = program(gl, FACE_VS, FACE_FS, ['aP', 'aN'], ['uVP', 'uM', 'uEye', 'uColor', 'uAlpha']);
    lp = program(gl, LINE_VS, LINE_FS, ['aP'], ['uVP', 'uM', 'uScroll', 'uFloor', 'uColor', 'uAlpha', 'uFade']);
    sp = program(gl, SPK_VS, SPK_FS, ['aP', 'aC'], ['uVP', 'uTime', 'uPx']);
  } catch (e) { failBox(box, NOGL); return; }
  var FLOOR = -1.55, i, fxA = [], fzA = [];
  for (i = -10; i < 10; i++) { fxA.push(-5, FLOOR, i * 0.5, 5, FLOOR, i * 0.5); fzA.push(i * 0.5, FLOOR, -5, i * 0.5, FLOOR, 5); }
  fzA.push(5, FLOOR, -5, 5, FLOOR, 5);
  var floorX = buf(gl, new Float32Array(fxA)), floorZ = buf(gl, new Float32Array(fzA));
  var cols = [[0.27, 1.0, 0.48], [0.18, 0.9, 0.85], [1.0, 0.18, 0.66]], sk = [], rs = 1;
  function rnd() { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; }
  for (i = 0; i < 180; i++) {
    var th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), rr = 1.5 + rnd() * 2.6, c = cols[rnd() < 0.7 ? 0 : (rnd() < 0.5 ? 1 : 2)];
    sk.push(rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph) * 0.7, rr * Math.sin(ph) * Math.sin(th), c[0], c[1], c[2], rnd());
  }
  var spk = buf(gl, new Float32Array(sk));
  var geo = null, gPos, gNor, gLines;
  function rebuild(n) {
    if (gPos) { gl.deleteBuffer(gPos); gl.deleteBuffer(gNor); gl.deleteBuffer(gLines); }
    geo = crystalGeometry(n); gPos = buf(gl, geo.pos); gNor = buf(gl, geo.nor); gLines = buf(gl, geo.lines);
  }
  rebuild(4);

  var tg = [0, -0.2, 0], fov = 45 * Math.PI / 180;
  var st = { spin: 1, spark: 1, rot: 0 };
  var run;
  var rig = Rig(canvas, { yaw: 0, pitch: 0.2, dist: 5.4, pmin: -0.25, pmax: 1.2, dmin: 3, dmax: 8, sway: 0.18 }, function () { if (run) run.wake(); });
  var bSpin = $('#cr-spin'), bSpark = $('#cr-spark'), rSides = $('#cr-sides'), oSides = $('#cr-sides-out');
  bSpin.addEventListener('click', function () { st.spin = st.spin ? 0 : 1; pressed(bSpin, st.spin); if (run) run.wake(); });
  bSpark.addEventListener('click', function () { st.spark = st.spark ? 0 : 1; pressed(bSpark, st.spark); if (run) run.wake(); });
  rSides.addEventListener('input', function () { var v = parseInt(rSides.value, 10); oSides.textContent = v; rebuild(v); if (run) run.wake(); });
  pressed(bSpin, true); pressed(bSpark, true);

  function drawFaces(M, eye, col, a) {
    gl.useProgram(fp.p); gl.uniformMatrix4fv(fp.U.uM, false, M); gl.uniform3f(fp.U.uEye, eye[0], eye[1], eye[2]);
    gl.uniform3f(fp.U.uColor, col[0], col[1], col[2]); gl.uniform1f(fp.U.uAlpha, a);
    gl.bindBuffer(gl.ARRAY_BUFFER, gPos); attrib(gl, fp.A.aP, 3, 3, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gNor); attrib(gl, fp.A.aN, 3, 3, 0);
    gl.drawArrays(gl.TRIANGLES, 0, geo.nTri);
  }
  function drawLines(prog, buffer, count, M, col, a, floor, fade, scroll) {
    gl.useProgram(prog.p); gl.uniformMatrix4fv(prog.U.uM, false, M);
    gl.uniform3f(prog.U.uColor, col[0], col[1], col[2]); gl.uniform1f(prog.U.uAlpha, a);
    gl.uniform1f(prog.U.uFloor, floor); gl.uniform1f(prog.U.uFade, fade); gl.uniform1f(prog.U.uScroll, scroll || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); attrib(gl, prog.A.aP, 3, 3, 0);
    gl.drawArrays(gl.LINES, 0, count);
  }

  var piece = {
    update: function (t, dt) {
      var mv = rig.step(t, dt);
      if (st.spin && !RM) { st.rot += dt * 0.7; mv = true; }
      return mv;
    },
    draw: function (t) {
      var asp = canvas.width / canvas.height, eye = rig.eye(tg);
      var VP = mul(persp(fov, asp, 0.1, 60), lookAt(eye, tg, [0, 1, 0]));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      var green = [0.27, 1.0, 0.48], bob = RM ? 0 : Math.sin(t * 1.3) * 0.09;
      /* floor grid */
      gl.useProgram(lp.p); gl.uniformMatrix4fv(lp.U.uVP, false, VP);
      var scroll = RM ? 0 : ((t * 0.12) % 1) * 0.5;
      drawLines(lp, floorX, fxA.length / 3, IDENT, green, 0.55, 1, 1, scroll);
      drawLines(lp, floorZ, fzA.length / 3, IDENT, green, 0.55, 0, 1, 0);
      gl.disableVertexAttribArray(lp.A.aP);
      /* reflection, then crystal */
      var base = mul(transl(0, bob, 0), rotY(st.rot));
      var mirror = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * FLOOR, 0, 1]);
      var sets = [[mirror, 0.28], [IDENT, 1.0]], si, sc;
      for (si = 0; si < sets.length; si++) {
        var pre = sets[si][0], al = sets[si][1];
        for (sc = 0; sc < 2; sc++) {
          var s = sc ? 0.52 : 1.0, M = mul(pre, mul(base, scl(s, s, s)));
          gl.useProgram(fp.p); gl.uniformMatrix4fv(fp.U.uVP, false, VP);
          drawFaces(M, eye, sc ? [0.6, 1.0, 0.75] : green, al * (sc ? 1.1 : 0.9));
          gl.disableVertexAttribArray(fp.A.aP); gl.disableVertexAttribArray(fp.A.aN);
          gl.useProgram(lp.p); gl.uniformMatrix4fv(lp.U.uVP, false, VP);
          drawLines(lp, gLines, geo.nLine, M, sc ? [0.8, 1.0, 0.9] : green, al * (sc ? 0.9 : 1.15), 0, 0, 0);
          gl.disableVertexAttribArray(lp.A.aP);
        }
      }
      /* sparkles */
      if (st.spark) {
        gl.useProgram(sp.p); gl.uniformMatrix4fv(sp.U.uVP, false, VP); gl.uniform1f(sp.U.uTime, RM ? 0 : t); gl.uniform1f(sp.U.uPx, Math.min(2, window.devicePixelRatio || 1));
        gl.bindBuffer(gl.ARRAY_BUFFER, spk); attrib(gl, sp.A.aP, 3, 7, 0); attrib(gl, sp.A.aC, 4, 7, 3);
        gl.drawArrays(gl.POINTS, 0, 180);
        gl.disableVertexAttribArray(sp.A.aP); gl.disableVertexAttribArray(sp.A.aC);
      }
    }
  };
  run = runner(box, canvas, piece);
  canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); failBox(box, NOGL); });
}

/* ---------- start ---------- */
var rBox = $('#vp-relief'), mBox = $('#vp-mono'), cBox = $('#vp-crystal');
if (rBox) {
  loadImage('assets/img/thermal-street.jpg').then(function (im) { buildRelief(rBox, $('#gl-relief'), im); }, function () { failBox(rBox, 'The image could not be loaded.'); });
}
if (mBox) {
  loadImage('assets/img/pixel-portrait.jpg').then(function (im) { buildMonolith(mBox, $('#gl-mono'), im); }, function () { failBox(mBox, 'The image could not be loaded.'); });
}
if (cBox) buildCrystal(cBox, $('#gl-crystal'));
})();
