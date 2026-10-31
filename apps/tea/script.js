// Gongfu Tea Timer — PRO small upgrades
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const storage = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  };

  const defaultPresets = [
    { name: "Oolong (Gongfu)", base: 10, rule: "fixed", amount: 2, count: 12, rinse: 1, sound: "chime" },
    { name: "Puerh Ripe (Shou)", base: 8, rule: "fixed", amount: 2, count: 14, rinse: 1, sound: "gong" },
    { name: "Green (Light)", base: 8, rule: "percent", amount: 20, count: 8, rinse: 0, sound: "chime" },
    { name: "Black/Red Tea", base: 12, rule: "percent", amount: 15, count: 10, rinse: 1, sound: "wood" },
    { name: "White (Delicate)", base: 12, rule: "multiplier", amount: 1.15, count: 10, rinse: 0, sound: "chime" }
  ];

  const el = {
    presetSelect: $("#preset-select"),
    savePreset: $("#save-preset"),
    deletePreset: $("#delete-preset"),
    resetPresets: $("#reset-presets"),
    base: $("#base-seconds"),
    rule: $("#increase-rule"),
    amount: $("#increase-amount"),
    count: $("#num-infusions"),
    rinse: $("#rinse-count"),
    sound: $("#sound-type"),
    generate: $("#generate"),
    exportBtn: $("#export-json"),
    importBtn: $("#import-json"),
    importFile: $("#import-file"),
    exportCsv: $("#export-csv"),
    time: $("#time-remaining"),
    label: $("#infusion-label"),
    start: $("#start"),
    pause: $("#pause"),
    reset: $("#reset"),
    next: $("#next"),
    ring: document.querySelector(".ring"),
    tableBody: $("#schedule-table tbody"),
    log: $("#log"),
    themeBtn: $("#toggle-theme"),
    gh: $("#github-link"),
    share: $("#share-link"),
  };

  // Set your repo link here
  el.gh.href = "https://github.com/izzyallen876";
  el.gh.textContent = "GitHub";

  // Theme
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  if (storage.get("gf_theme", prefersLight ? "light" : "dark") === "light") document.documentElement.classList.add("light");
  el.themeBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("light");
    storage.set("gf_theme", document.documentElement.classList.contains("light") ? "light" : "dark");
  });

  // Presets
  function loadPresets() {
    const saved = storage.get("gongfu_presets", []);
    const all = [...defaultPresets, ...saved];
    el.presetSelect.innerHTML = "";
    all.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      el.presetSelect.appendChild(opt);
    });
    return all;
  }
  function getPreset(name) {
    const saved = storage.get("gongfu_presets", []);
    const all = [...defaultPresets, ...saved];
    return all.find(p => p.name === name);
  }
  function saveCurrentAsPreset() {
    const name = prompt("Preset name:");
    if (!name) return;
    const preset = currentSettings(name);
    const saved = storage.get("gongfu_presets", []);
    const i = saved.findIndex(p => p.name === name);
    if (i >= 0) saved[i] = preset; else saved.push(preset);
    storage.set("gongfu_presets", saved);
    loadPresets();
    el.presetSelect.value = name;
  }
  function deletePreset() {
    const name = el.presetSelect.value;
    const saved = storage.get("gongfu_presets", []);
    const newSaved = saved.filter(p => p.name !== name);
    storage.set("gongfu_presets", newSaved);
    loadPresets();
  }
  function resetToDefaults() {
    storage.set("gongfu_presets", []);
    loadPresets();
  }

  // Settings helpers
  function currentSettings(name="Custom"){
    return {
      name,
      base: +el.base.value,
      rule: el.rule.value,
      amount: +el.amount.value,
      count: +el.count.value,
      rinse: Math.max(0, Math.min(2, +el.rinse.value||0)),
      sound: el.sound.value
    };
  }
  function applySettings(s){
    el.base.value = s.base;
    el.rule.value = s.rule;
    el.amount.value = s.amount;
    el.count.value = s.count;
    el.rinse.value = s.rinse ?? 0;
    el.sound.value = s.sound ?? "chime";
  }

  // Schedule generation (with rinse slots)
  function generateSchedule(base, rule, amount, count, rinse) {
    const schedule = [];
    for (let r = 0; r < rinse; r++) schedule.push({ t: 2, label: `Rinse ${r+1}` });
    let t = base;
    for (let i = 0; i < count; i++) {
      schedule.push({ t: Math.round(t), label: `Infusion ${i+1}` });
      if (rule === "fixed") t += amount;
      else if (rule === "percent") t += t * (amount/100);
      else if (rule === "multiplier") t *= amount;
    }
    return schedule;
  }

  // Render schedule table + persistent notes
  function renderSchedule(times) {
    el.tableBody.innerHTML = "";
    const notes = storage.get("gf_notes", {});
    times.forEach((item, i) => {
      const key = `n_${i}`;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i+1}</td><td>${item.t}</td>
        <td contenteditable="true" class="note-cell" data-idx="${i}" placeholder="notes…">${notes[key] ?? ""}</td>`;
      el.tableBody.appendChild(tr);
    });
    $$("#schedule-table .note-cell").forEach(td => {
      td.addEventListener("input", () => {
        const idx = td.getAttribute("data-idx");
        const cur = storage.get("gf_notes", {});
        cur[`n_${idx}`] = td.textContent;
        storage.set("gf_notes", cur);
      });
    });
  }

  // Timer and sounds
  const CIRC = 2 * Math.PI * 54;
  let schedule = generateSchedule(10, "fixed", 2, 10, 1);
  let idx = 0;
  let remaining = schedule[0].t;
  let timerId = null;
  let paused = true;

  function updateRing() {
    const total = schedule[idx]?.t || 1;
    const frac = remaining / total;
    el.ring.style.strokeDasharray = CIRC;
    el.ring.style.strokeDashoffset = CIRC * (1 - frac);
  }
  function fmt(sec){
    const m = Math.floor(sec/60).toString().padStart(2,"0");
    const s = Math.floor(sec%60).toString().padStart(2,"0");
    return `${m}:${s}`;
  }
  function paint() {
    el.time.textContent = fmt(remaining);
    el.label.textContent = `${schedule[idx]?.label || "Done"} (${idx+1} / ${schedule.length})`;
    updateRing();
  }
  function synthSound(type="chime"){
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    let freq = 880, t = ctx.currentTime;
    if (type === "gong"){ freq = 196; o.type = "sine"; }
    else if (type === "wood"){ freq = 520; o.type = "square"; }
    else { freq = 880; o.type = "sine"; }
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start();
    setTimeout(()=>o.stop(), 950);
  }
  function chime() {
    const type = el.sound.value;
    if (type !== "none") synthSound(type);
  }
  function logBrew() {
    const now = new Date();
    const div = document.createElement("div");
    div.className = "log-item";
    div.textContent = `✔️ ${schedule[idx]?.label || "Done"} finished at ${now.toLocaleTimeString()}`;
    el.log.prepend(div);
  }

  function tick() {
    if (paused) return;
    if (remaining <= 0){
      chime();
      logBrew();
      nextInfusion();
      return;
    }
    remaining -= 1;
    paint();
  }
  function start() {
    if (!timerId) timerId = setInterval(tick, 1000);
    paused = false; paint();
  }
  function pause() { paused = true; paint(); }
  function reset() {
    idx = 0; remaining = schedule[0].t; paused = true; paint();
  }
  function nextInfusion() {
    idx++;
    if (idx >= schedule.length) { paused = true; idx = schedule.length-1; paint(); return; }
    remaining = schedule[idx].t;
    paint();
  }

  // Export CSV
  function exportCSV(){
    const notes = storage.get("gf_notes", {});
    let lines = ["index,label,seconds,note,timestamp"];
    schedule.forEach((item, i) => {
      const note = (notes[`n_${i}`] ?? "").replace(/"/g, '""');
      lines.push(`${i+1},"${item.label}",${item.t},"${note}",`);
    });
    const blob = new Blob([lines.join("\n")], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gongfu_brew_log.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // JSON Import/Export
  function currentPlan(){
    return {
      base:+el.base.value, rule:el.rule.value, amount:+el.amount.value, count:+el.count.value, rinse:+el.rinse.value, sound:el.sound.value,
      schedule
    };
  }
  function applyPlan(plan){
    el.base.value = plan.base ?? 10;
    el.rule.value = plan.rule ?? "fixed";
    el.amount.value = plan.amount ?? 2;
    el.count.value = plan.count ?? 10;
    el.rinse.value = plan.rinse ?? 0;
    el.sound.value = plan.sound ?? "chime";
    schedule = plan.schedule ?? generateSchedule(+el.base.value, el.rule.value, +el.amount.value, +el.count.value, +el.rinse.value);
    idx = 0; remaining = schedule[0].t; renderSchedule(schedule); paint();
  }

  el.generate.addEventListener("click", () => {
    schedule = generateSchedule(+el.base.value, el.rule.value, +el.amount.value, +el.count.value, +el.rinse.value);
    idx = 0; remaining = schedule[0].t; renderSchedule(schedule); paint();
    storage.set("gf_notes", {});
  });
  el.exportBtn.addEventListener("click", () => {
    const data = currentPlan();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gongfu_timer_plan.json"; a.click();
    URL.revokeObjectURL(url);
  });
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{ applyPlan(JSON.parse(reader.result)); }
      catch(err){ alert("Invalid JSON"); }
    };
    reader.readAsText(file);
  });
  el.exportCsv.addEventListener("click", exportCSV);

  // Keyboard & gestures
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space"){ e.preventDefault(); paused ? start() : pause(); }
    if (e.key.toLowerCase() === "n"){ nextInfusion(); }
    if (e.key.toLowerCase() === "r"){ reset(); }
  });
  let startX=null, startY=null;
  window.addEventListener("touchstart", (e)=>{
    if (!e.touches?.length) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, {passive:true});
  window.addEventListener("touchend", (e)=>{
    if (startX===null||startY===null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? 0) - startX;
    const dy = (e.changedTouches?.[0]?.clientY ?? 0) - startY;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { nextInfusion(); }
    else if (dy > 40 && Math.abs(dy) > Math.abs(dx)) { reset(); }
    startX = startY = null;
  }, {passive:true});

  // Shareable URL
  function encodeShare(){
    const j = currentSettings();
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(j))));
    const url = `${location.origin}${location.pathname}#${payload}`;
    navigator.clipboard?.writeText(url);
    el.share.textContent = "Copied!";
    setTimeout(()=> el.share.textContent="Share", 1200);
  }
  function tryDecodeShare(){
    if (location.hash?.length > 1){
      try{
        const j = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
        applySettings(j);
        schedule = generateSchedule(j.base, j.rule, j.amount, j.count, j.rinse);
        idx = 0; remaining = schedule[0].t; renderSchedule(schedule); paint();
      }catch{ /* ignore */ }
    }
  }

  el.share.addEventListener("click", encodeShare);
  el.resetPresets.addEventListener("click", resetToDefaults);

  // Init
  const allPresets = loadPresets();
  applySettings(allPresets[0]);
  schedule = generateSchedule(+el.base.value, el.rule.value, +el.amount.value, +el.count.value, +el.rinse.value);
  idx = 0; remaining = schedule[0].t;
  renderSchedule(schedule); paint();
  tryDecodeShare();
})();