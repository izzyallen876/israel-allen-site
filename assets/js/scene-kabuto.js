(function () {
"use strict";
var G = window.GX; if (!G) return;
var $ = G.$;
if (!$('#kabuto')) return;
var RM = G.RM, TAU = G.TAU, clamp = G.clamp, lerp = G.lerp, rad = G.rad, hash = G.hash;
var GlyphScreen = G.GlyphScreen, ramp3 = G.ramp3, dprCanvas = G.dprCanvas;
var INKP = G.INKP, GLOWP = G.GLOWP, PGD = G.PGD, PGL = G.PGL;
var DARK = G.theme.dark, GRIDC = G.theme.grid;

/* ---------- 3. kabuto ---------- */
var KW = 1000, KH = 1300;
var K = {S:null, mode:'ink', SS:2, big:document.createElement('canvas'), small:document.createElement('canvas'),
         px:0, py:0, tpx:0, tpy:0, hasPtr:false, started:false, revT0:-1e9, parts:[]};
K.bx = K.big.getContext('2d');
K.sx = K.small.getContext('2d', {willReadFrequently:true});
(function(){
  var i;
  for(i=0;i<46;i++) K.parts.push({x0:hash(i,1,2), y0:hash(i,3,4)*140, sp:1.5+hash(i,5,6)*2.5, ph:hash(i,7,8)*6.28, g:[1,2,5,6][i%4]});
})();

/* every shape below is the right half (x >= 0, measured from the centre line);
   a mirrored copy is drawn for the left half */
var P = {
  horn:    new Path2D('M306 214 C262 212 168 230 96 309 C110 340 126 380 136 424 C142 448 148 466 152 486 L158 536 L194 530 L186 496 C186 430 205 380 232 329 C250 290 275 245 306 214 Z'),
  band:    new Path2D('M-196 486 C-120 574 120 574 196 486 L206 520 C130 629 -130 629 -206 520 Z'),
  dome:    new Path2D('M-196 604 C-192 520 -176 450 -150 400 C-124 340 -60 306 0 300 C60 306 124 340 150 400 C176 450 192 520 196 604 Z'),
  blade:   new Path2D('M0 334 C22 326 34 312 30 296 C27 282 12 272 0 262 Z'),
  tongue:  new Path2D('M34 346 C64 340 90 318 96 288 C96 276 90 270 88 262 C80 290 60 306 32 316 Z'),
  tongue2: new Path2D('M30 384 C58 376 80 354 82 326 C70 346 52 356 28 360 Z'),
  face:    new Path2D('M0 668 L186 668 C190 720 184 790 168 840 C152 890 116 934 70 956 C40 968 16 970 0 970 Z'),
  eye:     new Path2D('M30 686 L36 670 L172 668 L178 692 C172 722 132 744 92 742 C58 740 36 722 30 686 Z'),
  nose:    new Path2D('M0 676 L13 678 L19 752 C30 770 46 786 52 804 C48 822 22 828 0 826 Z'),
  mouth:   new Path2D('M0 866 C28 856 58 848 86 858 C84 890 44 912 0 914 Z'),
  body:    new Path2D('M-560 1320 L-560 1060 C-480 1020 -380 985 -270 962 C-200 948 -150 944 -110 946 L110 946 C150 944 200 948 270 962 C380 985 480 1020 560 1060 L560 1320 Z')
};
var SPECK = [];
(function(){
  var s = 12345, i;
  function r(){ s = (Math.imul(s,1664525) + 1013904223) >>> 0; return s/4294967296; }
  for(i=0;i<260;i++) SPECK.push([r()*400-200, 488+r()*210, 2.5+r()*4.5, r()<.5 ? 0 : 1]);
})();

function drawKabuto(g, t, px, py){
  var i, j, k, b = 1 + Math.sin(t*1.25)*0.004;
  function L(v){ return 'rgb(' + Math.round(clamp(v,0,1)*255) + ',255,0)'; }
  function LA(v,a){ return 'rgba(' + Math.round(clamp(v,0,1)*255) + ',255,0,' + a.toFixed(3) + ')'; }
  function lg(x0,y0,x1,y1,st){ var gr = g.createLinearGradient(x0,y0,x1,y1), q; for(q=0;q<st.length;q+=2) gr.addColorStop(st[q], L(st[q+1])); return gr; }
  function rg(x0,y0,r0,x1,y1,r1,st){ var gr = g.createRadialGradient(x0,y0,r0,x1,y1,r1), q; for(q=0;q<st.length;q+=2) gr.addColorStop(st[q], L(st[q+1])); return gr; }
  function mulg(x0,y0,x1,y1,st){ var gr = g.createLinearGradient(x0,y0,x1,y1), q; for(q=0;q<st.length;q+=2) gr.addColorStop(st[q], 'rgb(' + Math.round(clamp(st[q+1],0,1)*255) + ',255,255)'); return gr; }
  function line(x0,y0,x1,y1,col,w){ g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke(); }
  function curve(x0,y0,x1,y1,x2,y2,x3,y3,col,w){ g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0,y0); g.bezierCurveTo(x1,y1,x2,y2,x3,y3); g.stroke(); }
  function dot(x,y,r,col){ g.fillStyle = col; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); }
  function tri(x1,y1,x2,y2,x3,y3,col,ol){ g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.lineTo(x3,y3); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = ol; g.lineWidth = 2.5; g.stroke(); }
  function layer(d, fn){ g.save(); g.translate(px*d*16, py*d*9); fn(); g.restore(); }
  function sym(fn){ var s; for(s=1;s>=-1;s-=2){ g.save(); g.translate(500,0); g.scale(s,1); fn(s); g.restore(); } }
  function ctr(fn){ g.save(); g.translate(500,0); fn(); g.restore(); }

  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(500,1000); g.scale(b,b); g.translate(-500,-1000);

  /* ---- shoulders and chest ---- */
  g.save(); g.translate(500 + px*3, py*2);
  g.fillStyle = lg(0,940,0,1300,[0,.32,.5,.17,1,.07]); g.fill(P.body);
  g.restore();
  g.save(); g.translate(px*3, py*2);
  sym(function(){
    var sx, sy, th, q;
    for(q=0;q<6;q++){
      sx = 288 + q*52; sy = 972 + (sx-270)*0.34; th = 64 - q*4;
      g.beginPath(); g.moveTo(sx-17,sy+12); g.lineTo(sx+14,sy-th); g.lineTo(sx+27,sy+8); g.closePath();
      g.fillStyle = L(.22); g.fill();
      line(sx+14,sy-th,sx+27,sy+8,LA(.64,.9),5);
    }
    for(q=0;q<4;q++) curve(250+q*36,1075+q*44,360+q*30,1040+q*44,430+q*20,1050+q*44,520,1120+q*36,LA(.46-q*.05,.9),17-q*2);
  });
  curve(360,952,430,1000,570,1000,640,952,LA(.5,.9),14);
  g.restore();

  /* ---- head ---- */
  g.save(); g.translate(500,960); g.rotate(px*0.02); g.translate(-500,-960);

  /* neck guard: five lames flaring out like wings */
  layer(.45, function(){ sym(function(){
    for(k=0;k<5;k++){
      var y0 = 640 + k*60, y1 = y0 + 66, xt = 196 + k*40, xb = xt + 22;
      g.beginPath(); g.moveTo(40,y0); g.lineTo(xt,y0); g.lineTo(xb,y1); g.lineTo(40,y1); g.closePath();
      g.fillStyle = lg(0,y0,0,y1,[0,.10+k*.012,1,.27+k*.012]); g.fill();
      g.save(); g.clip();
      g.lineWidth = 3; g.strokeStyle = LA(.45,.9);
      for(j=52;j<xb;j+=24){
        g.beginPath(); g.moveTo(j,y0); g.lineTo(j,y1); g.stroke();
        g.beginPath(); g.moveTo(j+8,y0); g.lineTo(j+8,y1); g.stroke();
      }
      for(j=60;j<xb;j+=48) dot(j,y0+11,3.4,L(.92));
      g.restore();
      line(40,y1-1,xb,y1-1,LA(.68,.95),5);
      line(xt,y0,xb,y1,LA(.8,.95),5);
    }
  }); });

  /* dome with fluted ridges, studs and the flame crest */
  layer(.8, function(){
    ctr(function(){
      g.fillStyle = rg(-50,440,10,0,470,300,[0,.92,.4,.58,1,.16]); g.fill(P.dome);
      g.save(); g.clip(P.dome);
      for(i=-5;i<=5;i++){
        var qx = i*34, ex = i*40;
        g.beginPath(); g.moveTo(0,336); g.quadraticCurveTo(qx,450,ex,606); g.strokeStyle = L(.06); g.lineWidth = 7; g.stroke();
        g.beginPath(); g.moveTo(-4,340); g.quadraticCurveTo(qx-4,450,ex-4,606); g.strokeStyle = LA(.9,.85); g.lineWidth = 3; g.stroke();
        for(j=0;j<3;j++){
          var tt = .46 + j*.17, u = 1 - tt;
          dot(2*u*tt*qx + tt*tt*ex - 5, u*u*336 + 2*u*tt*450 + tt*tt*606, 4.2, L(.98));
        }
      }
      for(j=0;j<3;j++){
        g.beginPath(); g.moveTo(-150,420+j*52); g.quadraticCurveTo(0,380+j*52,150,420+j*52);
        g.strokeStyle = LA(.05,.55); g.lineWidth = 4; g.stroke();
      }
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = mulg(0,500,0,604,[0,1,1,.45]); g.fillRect(-220,500,440,110);
      g.globalCompositeOperation = 'source-over';
      g.restore();
    });
    sym(function(){
      g.lineWidth = 3; g.strokeStyle = L(.04);
      g.fillStyle = lg(0,0,38,0,[0,.98,1,.44]); g.fill(P.blade); g.stroke(P.blade);
      g.fillStyle = lg(0,0,100,0,[0,.92,1,.42]); g.fill(P.tongue); g.stroke(P.tongue);
      g.fillStyle = lg(0,0,86,0,[0,.9,1,.4]); g.fill(P.tongue2); g.stroke(P.tongue2);
    });
    ctr(function(){ line(0,332,0,266,L(1),4); });
  });

  /* demon mask */
  layer(1.25, function(){ sym(function(){
    var pe = .35 + .6*(.5 + .5*Math.sin(t*2.6 + 1));
    g.fillStyle = rg(0,780,10,0,790,230,[0,.34,.6,.22,1,.09]); g.fill(P.face);
    g.save(); g.clip(P.face);
    var cg = g.createRadialGradient(118,770,2,118,770,56);
    cg.addColorStop(0, LA(.86,.95)); cg.addColorStop(1, LA(.86,0));
    g.fillStyle = cg; g.beginPath(); g.ellipse(118,772,58,20,-0.2,0,TAU); g.fill();
    /* cheek creases */
    curve(54,824,100,836,146,866,160,920,L(.02),8);   curve(52,820,98,832,144,862,158,916,LA(.78,.95),6);
    curve(64,800,112,806,164,832,180,872,L(.02),7);   curve(62,796,110,802,162,828,178,868,LA(.68,.95),5);
    /* moustache bristles */
    for(i=0;i<6;i++) curve(8+i*3,830+i*1.5,50+i*12,812+i*5,76+i*13,820+i*9,96+i*14,838+i*12,i%2 ? L(.05) : LA(.8,.95),5);
    /* jaw line and cheek guard */
    curve(20,944,50,940,80,930,104,912,LA(.5,.9),5);
    curve(178,706,190,770,176,840,140,900,LA(.62,.9),5);
    g.strokeStyle = LA(.6,.9); g.lineWidth = 10; g.stroke(P.face);
    g.restore();
    /* eye sockets with a live ember */
    g.fillStyle = L(0); g.fill(P.eye);
    g.strokeStyle = LA(.5,.9); g.lineWidth = 3; g.stroke(P.eye);
    var pg = g.createRadialGradient(112,716,1,112,716,24);
    pg.addColorStop(0, L(pe)); pg.addColorStop(1, LA(pe,0));
    g.fillStyle = pg; g.beginPath(); g.ellipse(112,716,24,10,-0.25,0,TAU); g.fill();
    /* nose */
    g.fillStyle = lg(0,0,52,0,[0,.78,1,.28]); g.fill(P.nose);
    g.strokeStyle = L(.04); g.lineWidth = 3; g.stroke(P.nose);
    line(4,684,10,750,L(1),7);
    dot(30,812,8,L(0));
    /* brow curls */
    curve(10,782,34,764,66,766,92,794,L(.02),8);
    curve(10,770,34,750,66,752,94,780,LA(.82,.95),7);
    curve(14,752,44,738,80,742,108,764,LA(.7,.95),6);
    /* open snarl */
    g.fillStyle = L(0); g.fill(P.mouth);
    tri(6,866,28,860,17,888,L(.95),L(.05));
    tri(34,860,58,853,46,882,L(.95),L(.05));
    tri(62,854,86,858,76,898,L(.95),L(.05));
    tri(14,913,36,910,25,892,L(.9),L(.05));
    tri(44,908,66,902,55,884,L(.9),L(.05));
    /* chin knob */
    g.fillStyle = rg(-3,931,1,0,934,14,[0,.98,1,.4]); g.beginPath(); g.ellipse(0,934,14,10,0,0,TAU); g.fill();
  }); });

  /* side turnbacks with studded relief */
  layer(.9, function(){ sym(function(){
    g.save(); g.translate(274,578); g.rotate(rad(10));
    g.fillStyle = rg(-24,-30,8,0,0,128,[0,.82,.55,.5,1,.16]);
    g.beginPath(); g.ellipse(0,0,90,112,0,0,TAU); g.fill();
    g.save(); g.clip();
    for(j=-4;j<=4;j++) for(i=-3;i<=3;i++){
      var sx = i*26 + ((j&1) ? 13 : 0), sy = j*26;
      if((sx*sx)/(66*66) + (sy*sy)/(88*88) > 1) continue;
      dot(sx,sy,7.6,L(.04)); dot(sx-1.2,sy-1.2,5,L(.92));
    }
    g.restore();
    g.strokeStyle = LA(.95,.95); g.lineWidth = 11;
    g.beginPath(); g.ellipse(0,0,86,108,0,-1.9,0.5); g.stroke();
    g.strokeStyle = L(.06); g.lineWidth = 4;
    g.beginPath(); g.ellipse(0,0,100,122,0,0,TAU); g.stroke();
    g.restore();
  }); });

  /* crescent horns joined by a hammered band */
  layer(1.1, function(){
    sym(function(){
      g.fillStyle = lg(110,300,290,430,[0,.96,.5,.64,1,.36]); g.fill(P.horn);
      g.save(); g.clip(P.horn);
      curve(166,470,172,400,196,330,250,262,LA(1,.34),28);
      curve(160,468,166,400,190,330,242,262,L(1),5);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = mulg(0,400,0,500,[0,1,1,.42]); g.fillRect(100,380,140,140);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = L(.98); g.lineWidth = 14; g.stroke(P.horn);
      g.restore();
    });
    ctr(function(){
      g.fillStyle = lg(0,490,0,690,[0,.76,.5,.5,1,.2]); g.fill(P.band);
      g.save(); g.clip(P.band);
      for(i=0;i<SPECK.length;i++){ var sp = SPECK[i]; dot(sp[0],sp[1],sp[2], sp[3] ? L(.98) : L(.1)); }
      g.restore();
      g.strokeStyle = L(.96); g.lineWidth = 6; g.stroke(P.band);
      g.strokeStyle = L(.06); g.lineWidth = 2; g.stroke(P.band);
    });
  });

  /* visor */
  layer(1.0, function(){ ctr(function(){
    g.fillStyle = L(.22); g.beginPath(); g.ellipse(0,642,200,28,0,0,TAU); g.fill();
    g.fillStyle = lg(0,592,0,654,[0,1,.55,.82,1,.46]); g.beginPath(); g.ellipse(0,622,204,30,0,0,TAU); g.fill();
    g.save(); g.clip();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = mulg(-204,0,204,0,[0,.5,.25,.95,.5,1,.75,.95,1,.5]); g.fillRect(-210,580,420,80);
    g.globalCompositeOperation = 'source-over';
    g.restore();
    g.strokeStyle = L(1); g.lineWidth = 6; g.beginPath(); g.ellipse(0,622,190,22,0,Math.PI*1.1,Math.PI*1.9); g.stroke();
    for(i=-3;i<=3;i++) dot(i*48,646,3.2,L(.9));
    g.strokeStyle = L(.05); g.lineWidth = 2.5; g.beginPath(); g.ellipse(0,622,204,30,0,0,TAU); g.stroke();
  }); });

  g.restore();

  /* ---- light from the left, falling off to the right and downward ---- */
  g.globalCompositeOperation = 'multiply';
  var m1 = g.createLinearGradient(0,0,1000,0);
  m1.addColorStop(0,'rgb(255,255,255)'); m1.addColorStop(.5,'rgb(242,255,255)'); m1.addColorStop(1,'rgb(158,255,255)');
  g.fillStyle = m1; g.fillRect(-100,0,1200,1300);
  var m2 = g.createLinearGradient(0,700,0,1300);
  m2.addColorStop(0,'rgb(255,255,255)'); m2.addColorStop(1,'rgb(140,255,255)');
  g.fillStyle = m2; g.fillRect(-100,700,1200,700);
  /* a bright sweep that crosses the armor every nine seconds */
  g.globalCompositeOperation = 'lighter';
  var ph = (t % 9)/3.2;
  if(ph < 1){
    var sx0 = -300 + ph*1600;
    var sg = g.createLinearGradient(sx0-90, 300, sx0+90, 420);
    sg.addColorStop(0,'rgba(255,0,0,0)'); sg.addColorStop(.5,'rgba(255,0,0,0.38)'); sg.addColorStop(1,'rgba(255,0,0,0)');
    g.fillStyle = sg; g.fillRect(-100,0,1300,1300);
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

function renderKabuto(t, ts){
  var S = K.S; if(!S || !S.ready) return;
  var cols = S.cols, rows = S.rows, SS = K.SS, i, x, y, o;
  if(K.big.width !== cols*SS || K.big.height !== rows*SS){
    K.big.width = cols*SS; K.big.height = rows*SS; K.small.width = cols; K.small.height = rows;
  }
  K.px += ((K.hasPtr ? K.tpx : Math.sin(t*.45)*.18) - K.px)*.08;
  K.py += ((K.hasPtr ? K.tpy : Math.cos(t*.37)*.1) - K.py)*.08;
  var g = K.bx;
  g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = '#000'; g.fillRect(0,0,K.big.width,K.big.height);
  g.setTransform(cols*SS/KW,0,0,rows*SS/KH,0,0);
  drawKabuto(g, t, K.px, K.py);
  var sx = K.sx;
  sx.setTransform(1,0,0,1,0,0); sx.globalCompositeOperation = 'source-over'; sx.imageSmoothingEnabled = true;
  sx.drawImage(K.big, 0, 0, cols, rows);
  var d = sx.getImageData(0,0,cols,rows).data;

  var ink = K.mode === 'ink', col = [0,0,0], rev = RM ? 1.9 : clamp((ts-K.revT0)/2600,0,1)*1.9;
  var fl = Math.floor(ts/110), gi, hh, G, m, Lm, dens, vis, rn, fy, vx, vy, vg;
  for(y=0;y<rows;y++){
    fy = y/rows;
    for(x=0;x<cols;x++){
      i = y*cols + x; o = i*4; G = d[o+1]; gi = 0;
      if(G > (ink ? 14 : 30)){
        m = G/255; Lm = Math.min(1, d[o]/G);
        rn = hash(x,y,7); vis = rev - fy*0.7;
        if(rn <= vis){
          if(ink){ dens = (.28 + .72*Math.pow(1-Lm,.85))*(.35 + .65*m); ramp3(INKP, Lm, col); }
          else { dens = Math.pow(Lm,.8)*(.4 + .6*m); ramp3(GLOWP, Lm, col); }
          gi = dens < .03 ? 1 : Math.round(dens*14)+1;
          hh = hash(x,y,fl); if(hh < .14) gi += hh < .07 ? 1 : -1;
          gi = clamp(gi,1,15);
          if(rn > vis - .06){ gi = hash(x,y,fl+3) < .5 ? 12 : 15; col[0] = ink ? 30 : 200; col[1] = ink ? 40 : 230; col[2] = 255; }
        }
      } else {
        hh = hash(x,y,fl*3+11);
        if(ink){
          vx = x/cols - .5; vy = y/rows - .5; vg = .012 + .1*(vx*vx + vy*vy);
          if(hh < vg){ gi = hh < vg*.15 ? 2 : 1; col[0] = 140; col[1] = 142; col[2] = 170; }
        } else if(hh < .010){ gi = 1; col[0] = 18; col[1] = 34; col[2] = 110; }
      }
      S.I[i] = gi; S.R[i] = col[0]; S.G[i] = col[1]; S.B[i] = col[2];
    }
  }
  /* drifting sparks */
  var span = rows + 6, p, cx, cy, ci, tw;
  for(i=0;i<K.parts.length;i++){
    p = K.parts[i];
    cy = Math.floor((((p.y0 - t*p.sp) % span) + span) % span - 3);
    cx = Math.floor(p.x0*cols + Math.sin(t*.5 + p.ph)*3);
    if(cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
    ci = cy*cols + cx; if(S.I[ci]) continue;
    tw = .5 + .5*Math.sin(t*3 + p.ph*5);
    S.I[ci] = p.g;
    if(ink){ S.R[ci] = 10; S.G[ci] = 10; S.B[ci] = 60 + tw*80; }
    else { S.R[ci] = 80 + tw*100; S.G[ci] = 150 + tw*80; S.B[ci] = 255; }
  }
  S.draw(ink ? '#e6dec0' : '#02030a', ink ? 0 : .6, ink ? 0 : .5);
}

/* helmet controls and head tracking */
var armorEl = $('#armor');
function setMode(m){
  K.mode = m;
  armorEl.classList.toggle('glow', m === 'glow');
  $('#m-ink').setAttribute('aria-pressed', m === 'ink' ? 'true' : 'false');
  $('#m-glow').setAttribute('aria-pressed', m === 'glow' ? 'true' : 'false');
  if(RM) renderKabuto(0,0);
}
$('#m-ink').addEventListener('click', function(){ setMode('ink'); });
$('#m-glow').addEventListener('click', function(){ setMode('glow'); });
$('#m-replay').addEventListener('click', function(){ K.revT0 = performance.now(); if(RM) renderKabuto(0,0); });
armorEl.addEventListener('pointermove', function(e){
  var r = K.S.canvas.getBoundingClientRect();
  K.tpx = clamp(((e.clientX - r.left)/r.width - .5)*2.4, -1, 1);
  K.tpy = clamp(((e.clientY - r.top)/r.height - .5)*2.4, -1, 1);
  K.hasPtr = true;
});
armorEl.addEventListener('pointerleave', function(){ K.hasPtr = false; });


/* ---------- layout and loop ---------- */
K.S = GlyphScreen($('#kabuto'), {aspect:1.3, cellPx:5.4, minCols:84, maxCols:190});
function resizeAll() { K.S.resize(); if (RM) renderKabuto(0, 0); }
var rzT = 0;
window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(resizeAll, 120); });
window.addEventListener('load', resizeAll);
var vis = false;
new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    vis = e.isIntersecting;
    if (e.isIntersecting && !K.started) { K.started = true; K.revT0 = performance.now(); }
  });
}).observe($('#armor'));
resizeAll();
var lastK = 0;
function loop(ts) {
  if (vis && !document.hidden && ts - lastK > 40) { lastK = ts; renderKabuto(ts / 1000, ts); }
  requestAnimationFrame(loop);
}
if (!RM) requestAnimationFrame(loop);
})();
