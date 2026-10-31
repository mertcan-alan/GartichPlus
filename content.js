(() => {
  'use strict';
  if (window.__gpLayer) return;
  window.__gpLayer = true;

  /* ───────────── Durum ───────────── */
  const KEY = 'gpLayerSettings2', IMGKEY = 'gpLayerImage';
  const S = {
    img: null, aspect: 1, fx: 0.1, fy: 0.1, fw: 0.8,
    visible: true, opacity: 0.5, posMode: false,
    mode: 'bw', style: 'fill', auto: true, cell: 8, lighten: 0, edge: 14, dither: true, speed: 8,
    brushSel: -1, brushR: null, method: 0,
    mirror: false, mAxis: 'v', mGuide: true,
    palette: [], tab: 'layer', open: true, run: 'idle', capturing: false
  };
  const SAVE = ['fx', 'fy', 'fw', 'visible', 'opacity', 'mode', 'style', 'auto', 'cell', 'lighten', 'edge', 'dither', 'speed', 'brushSel', 'brushR', 'method', 'mAxis', 'mGuide', 'tab', 'open'];
  let cv = null, stopFlag = false, saveT = 0, pending = null, paceM = 0, busy = 0, mStroke = null, mQueue = Promise.resolve();
  const METHODS = ['fare + pointer (tuval)', 'fare + pointer (document)', 'dokunmatik', 'fare (hızlı/toplu)', 'güvenilir (debugger)'];

  const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (!store) return;
      const o = {}; SAVE.forEach(k => o[k] = S[k]);
      try { store.set({ [KEY]: o }); } catch (e) { /* yok say */ }
    }, 300);
  }
  function saveImage() {
    if (!store || !S.img) return;
    try {
      const sc = Math.min(1, 1024 / Math.max(S.img.naturalWidth, S.img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(S.img.naturalWidth * sc); c.height = Math.round(S.img.naturalHeight * sc);
      c.getContext('2d').drawImage(S.img, 0, 0, c.width, c.height);
      store.set({ [IMGKEY]: c.toDataURL('image/png') });
    } catch (e) { /* yok say */ }
  }

  /* ───────────── Yardımcılar ───────────── */
  const $ = (id) => root.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const frame = () => new Promise(res => { let d = 0; const f = () => { if (!d) { d = 1; res(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
  async function pace() {
    if (paceM === 4) { await sleep(Math.max(1, Math.round((10 - S.speed) * 2))); return; }
    await frame(); const x = Math.round((10 - S.speed) * 3); if (x > 0) await sleep(x);
  }

  // Tuvalin ekranda görünen (oyunun kırptığı) kısmı
  function visRect(c) {
    const r = c.getBoundingClientRect();
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    for (let n = c.parentElement; n; n = n.parentElement) {
      if (n === document.documentElement || n === document.body) continue;
      const st = getComputedStyle(n);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') {
        const q = n.getBoundingClientRect();
        l = Math.max(l, q.left); t = Math.max(t, q.top); rr = Math.min(rr, q.right); b = Math.min(b, q.bottom);
      }
    }
    l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, innerWidth); b = Math.min(b, innerHeight);
    return { l, t, r: rr, b };
  }

  function findCanvas() {
    const list = [];
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 150) continue;
      const st = getComputedStyle(c);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const v = visRect(c), vw = v.r - v.l, vh = v.b - v.t;
      if (vw < 150 || vh < 100) continue;
      let score = vw * vh;
      if (st.pointerEvents === 'none') score *= 0.05;
      if (r.width >= innerWidth * 0.98 && r.height >= innerHeight * 0.98) score *= 0.1;
      list.push({ c, score });
    }
    list.sort((a, b) => b.score - a.score);
    return list.length ? list[0].c : null;
  }

  function parseRGB(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function dist(a, b) {
    const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
  }
  const isWhite = (c) => c[0] >= 240 && c[1] >= 240 && c[2] >= 240;
  const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

  /* ───────────── Arayüz ───────────── */
  const host = document.createElement('div');
  host.id = 'gp-layer-host';
  host.style.cssText = 'all:initial;position:fixed;top:64px;right:12px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box;font-family:ui-rounded,"Nunito","Varela Round","Segoe UI",system-ui,sans-serif;font-size:13px;font-weight:700;color:#f3eafb}
.p{--ink:#31024f;--deep:#1d0233;--lift:#45106b;--edge:#6a2f99;--mist:#cdb3ea;--sun:#ffd23f;--sunedge:#c79a00;--mint:#58e0a6;--mintedge:#2a9f72;--pink:#ff6b9a;--pinkedge:#b83a68;
 width:296px;background:var(--deep);border:3px solid var(--ink);border-radius:18px;box-shadow:0 0 0 2px #fff,0 10px 28px rgba(20,0,35,.55);overflow:hidden;user-select:none}
.hd{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 8px;background:var(--lift);border-bottom:3px solid var(--ink);cursor:move}
.logo{height:40px;width:auto;display:block;flex:none;pointer-events:none}
#ttl{display:none;font-size:15px;font-weight:900}
.st{flex:1;min-width:0;color:var(--mist);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st.ok{color:var(--mint)}
.bd{padding:12px 12px 14px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 120px);overflow:auto;scrollbar-width:thin;scrollbar-color:var(--edge) transparent}
.p.min .bd{display:none}.p.min .hd{border-bottom:0}
button{cursor:pointer;border:0;background:var(--lift);border-radius:10px;height:32px;padding:0 10px;color:#fff;font-weight:800;box-shadow:0 3px 0 var(--ink);transition:transform .06s,box-shadow .06s,background .12s}
button:hover:not(:disabled){background:var(--edge)}
button:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
button:disabled{opacity:.4;cursor:default}
button:focus-visible,input:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
button.pri{background:var(--sun);color:var(--ink);box-shadow:0 3px 0 var(--sunedge)}
button.pri:hover:not(:disabled){background:#ffe070}button.pri:active:not(:disabled){box-shadow:0 1px 0 var(--sunedge)}
button.on{background:var(--mint);color:var(--ink);box-shadow:0 3px 0 var(--mintedge)}
button.on:hover:not(:disabled){background:#7aeabb}button.on:active:not(:disabled){box-shadow:0 1px 0 var(--mintedge)}
button.danger{background:var(--pink);box-shadow:0 3px 0 var(--pinkedge)}
button.danger:hover:not(:disabled){background:#ff86ae}button.danger:active:not(:disabled){box-shadow:0 1px 0 var(--pinkedge)}
button.big{height:40px;font-size:15px}
button.sq{width:28px;height:28px;padding:0;flex:none;font-size:16px;line-height:1}
.tabs,.seg,.row{display:flex;gap:7px;padding-bottom:3px}.tabs button,.seg button,.row button{flex:1;min-width:0}
.seg.sm{gap:5px}.seg.sm button{height:28px;padding:0}
.tabs button{background:transparent;box-shadow:none;color:var(--mist)}
.tabs button:hover:not(:disabled){background:var(--lift)}
.tabs button.on{background:#fff;color:var(--ink);box-shadow:0 3px 0 var(--edge)}
.tabs button.on:hover:not(:disabled){background:#fff}
.row button{padding:0 4px;font-size:12.5px}
section{display:none;flex-direction:column;gap:10px}section.on{display:flex}
.sl{display:grid;grid-template-columns:82px 1fr 40px;align-items:center;gap:6px}
.sl span,.fld>span{color:var(--mist)}.sl output{text-align:right;color:var(--mist);font-variant-numeric:tabular-nums}
.fld{display:flex;flex-direction:column;gap:6px}
input[type=range]{width:100%;accent-color:var(--sun);height:18px;margin:0}input[type=range]:disabled{opacity:.35}
.chk{display:flex;gap:8px;align-items:center;color:var(--mist)}.chk input{accent-color:var(--sun);width:16px;height:16px;margin:0}
.file{display:block;border:2px dashed var(--edge);border-radius:12px;padding:12px;text-align:center;color:var(--mist);cursor:pointer}
.file:hover,.file.drag{border-color:var(--sun);color:#fff}.file input{display:none}
.hint{margin:0;color:var(--mist);font-size:11.5px;font-weight:600;line-height:1.45}
.pal{display:flex;flex-wrap:wrap;gap:5px;min-height:18px}.pal i{width:18px;height:18px;border-radius:6px;border:2px solid #fff;display:block}
.bar{height:8px;background:var(--ink);border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--sun);border-radius:5px}
#prog,#mmsg{color:var(--mist);font-size:11.5px;font-weight:600;min-height:14px}
@media (prefers-reduced-motion:reduce){button{transition:none}}
</style>
<div class="p" id="p">
 <div class="hd" id="hd"><img class="logo" id="logo" alt="Gartic Phone"><b id="ttl">Garticphone</b><span class="st" id="st">çizim alanı aranıyor</span><button class="sq" id="tg" title="Küçült (Alt+P)">–</button></div>
 <div class="bd">
  <div class="tabs"><button data-tab="layer">Katman</button><button data-tab="draw">Çizim</button><button data-tab="mirror">Simetri</button></div>
  <section data-sec="layer">
   <label class="file" id="drop"><input type="file" id="file" accept="image/*"><span id="fname">Görsel seç ya da buraya bırak</span></label>
   <div class="row"><button id="vis">Gizle</button><button id="pos">Konumlandır</button><button id="fit">Sığdır</button></div>
   <div class="sl"><span>Saydamlık</span><input type="range" id="op" min="5" max="100"><output id="opv"></output></div>
   <div class="sl"><span>Boyut</span><input type="range" id="sz" min="10" max="250"><output id="szv"></output></div>
   <p class="hint">Konumlandır açıkken görseli sürükle, tekerlekle büyüt/küçült. Alt+O: göster/gizle. Katman, oyunun tuval zoom'una uyar.</p>
   <button id="rm">Görseli kaldır</button>
  </section>
  <section data-sec="draw">
   <div class="seg" id="mode"><button data-m="bw">Renksiz</button><button data-m="color">Renkli</button></div>
   <div class="seg sm" id="style"><button data-s="fill">Dolgu</button><button data-s="layers">Katmanlı</button><button data-s="lines">Çizgi</button></div>
   <p class="hint" id="sth"></p>
   <label class="chk"><input type="checkbox" id="auto">Ayarları otomatik seç</label>
   <div class="sl"><span>Detay</span><input type="range" id="cell" min="3" max="30"><output id="cellv"></output></div>
   <div class="sl" id="rli"><span>Açıklık</span><input type="range" id="li" min="0" max="80"><output id="liv"></output></div>
   <div class="sl" id="red"><span>Çizgi bolluğu</span><input type="range" id="ed" min="4" max="40"><output id="edv"></output></div>
   <div class="sl"><span>Hız</span><input type="range" id="sp" min="1" max="10"><output id="spv"></output></div>
   <div class="fld"><span>Fırça</span><div class="seg sm" id="brs"><button data-b="-1">Oto</button><button data-b="0">1</button><button data-b="1">2</button><button data-b="2">3</button><button data-b="3">4</button><button data-b="4">5</button></div></div>
   <p class="hint" id="brh"></p>
   <label class="chk" id="rdit"><input type="checkbox" id="dit">Noktalı gölgeleme</label>
   <div id="palwrap"><div class="pal" id="pal"></div>
    <div class="row" style="margin-top:8px"><button id="scan">Paleti tara</button><button id="add">Renk ekle</button><button id="clr">Temizle</button></div></div>
   <div class="row"><button class="pri" id="go">Çiz</button><button id="ps">Duraklat</button><button class="danger" id="stp">Durdur</button></div>
   <div class="bar"><i id="barf"></i></div><div id="prog"></div>
   <div class="row"><button id="test">Test çizgisi</button><button id="meas">Fırçaları ölç</button><button id="dbg">Rapor</button></div>
  </section>
  <section data-sec="mirror">
   <button class="big" id="mbtn">Simetri kapalı</button>
   <div class="fld"><span>Eksen</span><div class="seg sm" id="maxis"><button data-a="v">Sol-sağ</button><button data-a="h">Üst-alt</button><button data-a="both">4 yön</button></div></div>
   <label class="chk"><input type="checkbox" id="mguide">Eksen çizgisini göster</label>
   <p class="hint" id="mhint"></p>
   <div id="mmsg"></div>
  </section>
 </div>
</div>`;

  /* ───────────── Katman (overlay) ───────────── */
  const wrap = document.createElement('div');
  wrap.id = 'gp-layer-wrap';
  wrap.style.cssText = 'all:initial;position:fixed;overflow:hidden;pointer-events:none;z-index:2147483000;display:none;';
  const ov = document.createElement('img');
  ov.draggable = false;
  ov.style.cssText = 'all:initial;position:absolute;display:block;pointer-events:none;user-select:none;-webkit-user-drag:none;max-width:none;';
  wrap.appendChild(ov);
  const gv = document.createElement('div'), gh = document.createElement('div');
  gv.style.cssText = 'all:initial;position:absolute;top:0;bottom:0;width:0;border-left:2px dashed #ffd23f;display:none;pointer-events:none;filter:drop-shadow(0 0 2px #31024f);';
  gh.style.cssText = 'all:initial;position:absolute;left:0;right:0;height:0;border-top:2px dashed #ffd23f;display:none;pointer-events:none;filter:drop-shadow(0 0 2px #31024f);';
  wrap.appendChild(gv); wrap.appendChild(gh);

  function fit() {
    if (!S.img) return;
    if (!cv) { S.fx = 0.1; S.fy = 0.1; S.fw = 0.8; return; }
    const r = cv.getBoundingClientRect();
    S.fw = Math.min(1, (r.height * S.aspect) / r.width);
    const fh = (S.fw * r.width / S.aspect) / r.height;
    S.fx = (1 - S.fw) / 2; S.fy = (1 - fh) / 2;
    save(); ui();
  }
  function geom() {
    const r = cv.getBoundingClientRect(), v = visRect(cv), sc = r.width / cv.width;
    const w = S.fw * r.width;
    return { r, vis: v, sc, R: { l: r.left + S.fx * r.width, t: r.top + S.fy * r.height, w, h: w / S.aspect } };
  }

  let lastStatus = '';
  function loop() {
    cv = findCanvas();
    let txt = 'çizim alanı yok';
    if (cv) { const v = visRect(cv); txt = 'çizim alanı ' + Math.round(v.r - v.l) + '×' + Math.round(v.b - v.t); }
    if (txt !== lastStatus) { lastStatus = txt; const s = $('st'); s.textContent = txt; s.className = 'st' + (cv ? ' ok' : ''); }
    const showImg = !!S.img && S.visible, showGuide = S.mirror && S.mGuide;
    if (cv && (showImg || showGuide)) {
      const r = cv.getBoundingClientRect(), v = visRect(cv), w = S.fw * r.width;
      wrap.style.left = v.l + 'px'; wrap.style.top = v.t + 'px';
      wrap.style.width = Math.max(0, v.r - v.l) + 'px'; wrap.style.height = Math.max(0, v.b - v.t) + 'px';
      wrap.style.display = 'block';
      ov.style.display = showImg ? 'block' : 'none';
      if (S.img) {
        ov.style.left = (r.left + S.fx * r.width - v.l) + 'px'; ov.style.top = (r.top + S.fy * r.height - v.t) + 'px';
        ov.style.width = w + 'px'; ov.style.height = (w / S.aspect) + 'px';
        ov.style.opacity = S.opacity;
        ov.style.pointerEvents = S.posMode ? 'auto' : 'none';
        ov.style.cursor = S.posMode ? 'move' : 'default';
        ov.style.outline = S.posMode ? '2px dashed #ffd23f' : 'none';
      }
      gv.style.display = showGuide && S.mAxis !== 'h' ? 'block' : 'none';
      gh.style.display = showGuide && S.mAxis !== 'v' ? 'block' : 'none';
      gv.style.left = (r.left + r.width / 2 - v.l) + 'px';
      gh.style.top = (r.top + r.height / 2 - v.t) + 'px';
    } else wrap.style.display = 'none';
    requestAnimationFrame(loop);
  }

  let drag = null;
  ov.addEventListener('pointerdown', (e) => {
    if (!S.posMode || !cv) return;
    e.preventDefault(); e.stopPropagation();
    drag = { x: e.clientX, y: e.clientY, fx: S.fx, fy: S.fy };
    ov.setPointerCapture(e.pointerId);
  });
  ov.addEventListener('pointermove', (e) => {
    if (!drag || !cv) return;
    const r = cv.getBoundingClientRect();
    S.fx = drag.fx + (e.clientX - drag.x) / r.width;
    S.fy = drag.fy + (e.clientY - drag.y) / r.height;
  });
  ov.addEventListener('pointerup', () => { if (drag) { drag = null; save(); } });
  ov.addEventListener('wheel', (e) => {
    if (!S.posMode || !cv) return;
    e.preventDefault(); e.stopPropagation();
    const r = cv.getBoundingClientRect();
    const nf = clamp(S.fw * Math.exp(-e.deltaY * 0.0012), 0.1, 2.5), k = nf / S.fw;
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    S.fx = px - (px - S.fx) * k; S.fy = py - (py - S.fy) * k; S.fw = nf;
    ui(); save();
  }, { passive: false });

  function loadImage(url, name, persist) {
    const im = new Image();
    im.onload = () => {
      S.img = im; S.aspect = im.naturalWidth / im.naturalHeight; ov.src = url;
      $('fname').textContent = name || 'Görsel yüklendi';
      if (persist) { fit(); saveImage(); } else ui();
    };
    im.onerror = () => msg('Görsel okunamadı');
    im.src = url;
  }
  function handleFile(f) {
    if (!f || !/^image\//.test(f.type)) return msg('Geçerli bir görsel seç');
    loadImage(URL.createObjectURL(f), f.name, true);
  }

  /* ───────────── Palet & fırça düğmeleri ───────────── */
  function scanPalette() {
    const groups = new Map();
    for (const el of document.body.querySelectorAll('*')) {
      if (el === wrap || wrap.contains(el) || el.tagName === 'CANVAS') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.width > 140 || r.height < 12 || r.height > 140) continue;
      const ratio = r.width / r.height;
      if (ratio < 0.6 || ratio > 1.7) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const bg = parseRGB(st.backgroundColor);
      if (!bg || bg[3] < 0.9) continue;
      const p = el.parentElement;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push({ el, rgb: bg.slice(0, 3) });
    }
    const uniq = (list) => { const out = []; for (const it of list) if (!out.some(o => dist(o.rgb, it.rgb) < 100)) out.push(it); return out; };
    let best = [];
    for (const l of groups.values()) { const u = uniq(l); if (u.length > best.length) best = u; }
    if (best.length < 4) {
      const g2 = new Map();
      for (const [p, l] of groups) { const gp = p && p.parentElement; if (!gp) continue; if (!g2.has(gp)) g2.set(gp, []); g2.get(gp).push(...l); }
      for (const l of g2.values()) { const u = uniq(l); if (u.length > best.length) best = u; }
    }
    return best;
  }
  function colorOf(el) {
    let n = el;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const c = parseRGB(getComputedStyle(n).backgroundColor); if (c && c[3] >= 0.9) return c.slice(0, 3); }
    const d = el.querySelector && el.querySelector('*');
    if (d) { const c = parseRGB(getComputedStyle(d).backgroundColor); if (c && c[3] >= 0.9) return c.slice(0, 3); }
    return null;
  }
  document.addEventListener('click', (e) => {
    if (!S.capturing || e.composedPath().includes(host)) return;
    S.capturing = false;
    const c = colorOf(e.target);
    if (!c) { ui(); return msg('Bu öğeden renk okunamadı'); }
    if (S.palette.some(p => dist(p.rgb, c) < 100)) { ui(); return msg('Bu renk zaten ekli'); }
    S.palette.push({ rgb: c, el: e.target });
    ui(); msg('Renk eklendi (' + S.palette.length + ')');
  }, true);

  const thickBtns = () => [...document.querySelectorAll('button.thickness')].filter(b => b.getBoundingClientRect().width > 0);
  // Fırça kalınlıkları (tuval pikseli). Ölçüldüyse gerçek değer, değilse tahmin.
  function brushList() {
    const btn = thickBtns();
    if (!btn.length || !cv) return [];
    if (S.brushR && S.brushR.length === btn.length) return S.brushR.map(r => r * cv.width);
    return btn.map(b => {
      const bw = b.getBoundingClientRect().width; let m = 0;
      b.querySelectorAll('*').forEach(e => { const w = e.getBoundingClientRect().width; if (w > m && w < bw + 1) m = w; });
      if (!m) m = bw * 0.5;
      return m * cv.width / 660;
    });
  }
  async function setBrush(i) { const b = thickBtns()[i]; if (b) { clickEl(b); await sleep(70); } }

  /* ───────────── Olay üretimi ───────────── */
  function fire(t, type, x, y, buttons) {
    // not: 'view: window' bilerek yok; içerik betiği dünyasında bazı sürümlerde olay oluşturmayı bozabiliyor
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, button: type === 'pointermove' ? -1 : 0, buttons };
    let ev;
    if (type.indexOf('pointer') === 0) {
      const init = Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0 }, base);
      try { init.coalescedEvents = [new PointerEvent(type, init)]; } catch (e) { /* desteklenmiyor */ }
      try { ev = new PointerEvent(type, init); } catch (e) { delete init.coalescedEvents; ev = new PointerEvent(type, init); }
    } else ev = new MouseEvent(type, Object.assign({}, base, { button: 0 }));
    t.dispatchEvent(ev);
  }
  // Güvenilir (isTrusted) olay: arka plandaki debugger ile gerçek fare girdisi gönderir
  async function cdp(type, x, y, buttons) {
    if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)) throw new Error('Eklenti bağlantısı yok. Eklentiyi yenile, sayfaya F5 at.');
    let r;
    try { r = await chrome.runtime.sendMessage({ gp: 'mouse', type, x, y, buttons }); }
    catch (e) { throw new Error('Eklenti arka planına ulaşılamadı. Eklentiyi yenile, sayfaya F5 at.'); }
    if (!r || !r.ok) throw new Error((r && r.error) || 'debugger hatası');
  }
  function clickEl(el) {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    fire(el, 'pointerdown', x, y, 1); fire(el, 'mousedown', x, y, 1);
    fire(el, 'pointerup', x, y, 0); fire(el, 'mouseup', x, y, 0); fire(el, 'click', x, y, 0);
  }
  function pickTarget() {
    const v = visRect(cv);
    const list = document.elementsFromPoint((v.l + v.r) / 2, (v.t + v.b) / 2);
    return list.find(e => e !== host && e !== wrap && !wrap.contains(e)) || cv;
  }
  function mkPen(m, t) {
    paceM = m;
    if (m === 4) {
      return {
        down: async (x, y) => { await cdp('mouseMoved', x, y, 0); await cdp('mousePressed', x, y, 1); },
        move: (x, y) => cdp('mouseMoved', x, y, 1),
        up: (x, y) => cdp('mouseReleased', x, y, 0)
      };
    }
    if (m === 2) {
      const te = (type, x, y) => {
        const tc = new Touch({ identifier: 7, target: t, clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
        const list = type === 'touchend' ? [] : [tc];
        t.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: list, targetTouches: list, changedTouches: [tc] }));
      };
      return { down: (x, y) => te('touchstart', x, y), move: (x, y) => te('touchmove', x, y), up: (x, y) => te('touchend', x, y) };
    }
    const mt = m === 1 ? document : t;
    return {
      down: (x, y) => { fire(t, 'pointerdown', x, y, 1); fire(t, 'mousedown', x, y, 1); },
      move: (x, y) => { fire(mt, 'pointermove', x, y, 1); fire(mt, 'mousemove', x, y, 1); },
      up: (x, y) => { fire(mt, 'pointerup', x, y, 0); fire(mt, 'mouseup', x, y, 0); }
    };
  }
  // Güvenilir fare kullanılırken panel çizim alanının üstündeyse tıklamaları yutmasın
  function shieldOn() {
    S.posMode = false;
    try {
      const a = $('p').getBoundingClientRect(), v = visRect(cv);
      if (a.left < v.r && a.right > v.l && a.top < v.b && a.bottom > v.t) host.style.pointerEvents = 'none';
    } catch (e) { /* yok say */ }
  }
  async function drawPath(pen, pts, paced) {
    busy++; if (paceM === 4) shieldOn();
    let last = pts[0], downDone = false, ok = false;
    try {
      await pen.down(pts[0][0], pts[0][1]); downDone = true; if (paced) await pace();
      let moved = false;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], dx = p[0] - last[0], dy = p[1] - last[1], d = Math.hypot(dx, dy);
        if (d < 0.05) continue;
        const n = Math.max(1, Math.ceil(d / 90));
        for (let k = 1; k <= n; k++) { await pen.move(last[0] + dx * k / n, last[1] + dy * k / n); moved = true; if (paced) await pace(); }
        last = p;
      }
      if (!moved) { last = [pts[0][0] + 0.6, pts[0][1]]; await pen.move(last[0], last[1]); if (paced) await pace(); }
      await pen.up(last[0], last[1]); if (paced) await pace();
      ok = true;
    } finally {
      if (downDone && !ok) { try { await pen.up(last[0], last[1]); } catch (e) { /* yok say */ } }
      setTimeout(() => { busy = Math.max(0, busy - 1); if (!busy) host.style.pointerEvents = ''; }, 150);
    }
  }

  /* ───────────── Piksel doğrulama ───────────── */
  function readables() {
    if (!cv) return [];
    const r0 = cv.getBoundingClientRect(), out = [];
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height < 0.4 * r0.width * r0.height || Math.abs(r.left - r0.left) > r0.width * 0.2) continue;
      try { const x = c.getContext('2d'); if (x) { x.getImageData(0, 0, 1, 1); out.push({ c, x }); } } catch (e) { /* okunamaz */ }
    }
    return out;
  }
  function darkIn(o, x0, y0, x1, y1) {
    const r = o.c.getBoundingClientRect(), sx = o.c.width / r.width, sy = o.c.height / r.height;
    const cx = Math.max(0, Math.floor((x0 - r.left) * sx)), cy = Math.max(0, Math.floor((y0 - r.top) * sy));
    const cw = Math.min(o.c.width - cx, Math.ceil((x1 - x0) * sx)), ch = Math.min(o.c.height - cy, Math.ceil((y1 - y0) * sy));
    if (cw <= 0 || ch <= 0) return 0;
    const d = o.x.getImageData(cx, cy, cw, ch).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 360) n++;
    return n;
  }
  async function useBlack() {
    let best = null, bd = Infinity;
    for (const p of S.palette) { const d = dist(p.rgb, [0, 0, 0]); if (d < bd) { bd = d; best = p; } }
    if (best && best.el && best.el.isConnected && bd < 20000) { clickEl(best.el); await sleep(70); }
  }

  async function testLine() {
    if (!cv) return msg('Çizim alanı bulunamadı');
    if (S.run !== 'idle') return;
    if (pending !== null) { S.method = (pending + 1) % METHODS.length; pending = null; }
    S.run = 'running'; ui();
    try {
      await useBlack();
      const v = visRect(cv), t = pickTarget(), rd = readables();
      const x0 = v.l + (v.r - v.l) * 0.3, x1 = v.l + (v.r - v.l) * 0.7;
      const baseY = v.t + (v.b - v.t) * 0.3;
      if (!rd.length) {
        const y = baseY + 20;
        await drawPath(mkPen(S.method, t), [[x0, y], [x1, y]], S.method !== 3);
        pending = S.method;
        msg('Yöntem ' + (S.method + 1) + ' (' + METHODS[S.method] + ') denendi. Çizgi göründüyse Çiz\'e bas, görünmediyse Test\'e tekrar bas (5. denemede güvenilir yöntem devreye girer).');
      } else {
        let ok = false;
        for (let k = 0; k < METHODS.length && !ok; k++) {
          const m = (S.method + k) % METHODS.length, y = baseY + k * 24;
          const sum = () => rd.reduce((a, o) => a + darkIn(o, x0, y - 30, x1, y + 30), 0);
          const before = sum();
          await drawPath(mkPen(m, t), [[x0, y], [x1, y]], m !== 3);
          await sleep(200);
          if (sum() - before > 10) { S.method = m; ok = true; save(); msg('Çalıştı: yöntem ' + (m + 1) + ' (' + METHODS[m] + ')'); }
        }
        if (!ok) msg('Hiçbir yöntem tuvale çizemedi. "Rapor" düğmesine basıp çıktıyı paylaş.');
      }
    } catch (e) { msg('Hata: ' + e.message); }
    S.run = 'idle'; ui();
  }

  async function measureBrushes() {
    if (!cv || S.run !== 'idle') return;
    const btn = thickBtns(), rd = readables();
    if (!btn.length) return msg('Fırça düğmeleri bulunamadı');
    if (!rd.length) return msg('Tuval okunamıyor, ölçülemedi (tahmini değerler kullanılıyor)');
    if (pending !== null) { pending = null; }
    S.run = 'running'; ui();
    try {
      await useBlack();
      const v = visRect(cv), t = pickTarget(), pen = mkPen(S.method, t), res = [];
      const hw = (v.r - v.l), hh = (v.b - v.t);
      for (let i = 0; i < btn.length; i++) {
        await setBrush(i);
        const y = v.t + hh * (0.08 + 0.1 * i), x0 = v.l + hw * 0.03, x1 = v.l + hw * 0.08;
        await drawPath(pen, [[x0, y], [x1, y]], S.method !== 3);
        await sleep(150);
        let th = 0;
        for (const o of rd) {
          const r = o.c.getBoundingClientRect(), sx = o.c.width / r.width, sy = o.c.height / r.height;
          const cx = Math.floor(((x0 + x1) / 2 - r.left) * sx), cy0 = Math.max(0, Math.floor((y - hh * 0.05 - r.top) * sy));
          const h = Math.min(o.c.height - cy0, Math.ceil(hh * 0.1 * sy));
          if (cx < 0 || cx >= o.c.width || h <= 0) continue;
          const d = o.x.getImageData(cx, cy0, 1, h).data; let n = 0;
          for (let k = 0; k < h; k++) if (d[k * 4 + 3] > 128 && d[k * 4] + d[k * 4 + 1] + d[k * 4 + 2] < 360) n++;
          if (n > th) th = n;
        }
        res.push(th / cv.width);
      }
      if (res.every(r => r > 0)) { S.brushR = res; save(); msg('Ölçüldü (tuval px): ' + res.map(r => Math.round(r * cv.width)).join(', ') + '. Ölçüm çizgilerini oyundan geri al/sil.'); }
      else msg('Ölçüm başarısız. Önce Test çizgisi ile çalışan yöntemi bul.');
    } catch (e) { msg('Hata: ' + e.message); }
    S.run = 'idle'; ui();
  }

  /* ───────────── Planlama ───────────── */
  function buildQP() {
    let qp = S.palette.map(p => ({ rgb: p.rgb, el: p.el }));
    if (S.mode === 'bw') {
      qp = qp.filter(p => sat(p.rgb) < 28);
      if (!qp.some(p => p.rgb[0] < 60)) qp.push({ rgb: [0, 0, 0], el: null });
    }
    if (!qp.some(p => isWhite(p.rgb))) qp.push({ rgb: [255, 255, 255], el: null });
    return { qp, wi: qp.findIndex(p => isWhite(p.rgb)) };
  }
  function nearest(a, b, c, qp) {
    let bi = 0, bd = 1e18;
    for (let q = 0; q < qp.length; q++) {
      const t = qp[q].rgb, rm = (a + t[0]) / 2, dr = a - t[0], dg = b - t[1], db = c - t[2];
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
      if (d < bd) { bd = d; bi = q; }
    }
    return bi;
  }
  function sampleGrid(cols, rows) {
    const off = document.createElement('canvas'); off.width = cols; off.height = rows;
    const x = off.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, cols, rows);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(S.img, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data, n = cols * rows, buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { buf[i * 3] = d[i * 4]; buf[i * 3 + 1] = d[i * 4 + 1]; buf[i * 3 + 2] = d[i * 4 + 2]; }
    if (S.auto) { // fotoğrafa göre otomatik seviye ayarı
      const h = new Uint32Array(256);
      for (let i = 0; i < n; i++) h[clamp(Math.round(0.3 * buf[i * 3] + 0.59 * buf[i * 3 + 1] + 0.11 * buf[i * 3 + 2]), 0, 255)]++;
      let a = 0, lo = 0, hi = 255;
      for (let k = 0; k < 256; k++) { a += h[k]; if (a >= n * 0.02) { lo = k; break; } }
      a = 0; for (let k = 255; k >= 0; k--) { a += h[k]; if (a >= n * 0.02) { hi = k; break; } }
      if (hi - lo > 40) { const g = Math.min(2, 255 / (hi - lo)); for (let i = 0; i < buf.length; i++) buf[i] = clamp((buf[i] - lo) * g, 0, 255); }
    } else if (S.lighten > 0) {
      const lf = S.lighten / 100;
      for (let i = 0; i < buf.length; i++) buf[i] += (255 - buf[i]) * lf;
    }
    return buf;
  }
  function quantize(buf, cols, rows, qp, dither) {
    const out = new Int16Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, o = i * 3;
      const bi = nearest(buf[o], buf[o + 1], buf[o + 2], qp);
      out[i] = bi;
      if (dither) {
        for (let k = 0; k < 3; k++) {
          const e = buf[o + k] - qp[bi].rgb[k];
          if (x + 1 < cols) buf[o + 3 + k] += e * 7 / 16;
          if (y + 1 < rows) {
            if (x > 0) buf[o + cols * 3 - 3 + k] += e * 3 / 16;
            buf[o + cols * 3 + k] += e * 5 / 16;
            if (x + 1 < cols) buf[o + cols * 3 + 3 + k] += e * 1 / 16;
          }
        }
      }
    }
    return out;
  }
  // işaret ızgarası -> renge göre satır parçaları
  function marksToRuns(mark, cols, rows, G, cw, ch) {
    const { R, vis } = G, groups = new Map();
    for (let y = 0; y < rows; y++) {
      const cy = R.t + (y + 0.5) * ch;
      if (cy < vis.t + 1 || cy > vis.b - 1) continue;
      let x = 0;
      while (x < cols) {
        const c = mark[y * cols + x], cx = R.l + (x + 0.5) * cw;
        if (c < 0 || cx < vis.l + 1 || cx > vis.r - 1) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < cols && mark[y * cols + x2 + 1] === c && R.l + (x2 + 1.5) * cw <= vis.r - 1) x2++;
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push({ row: y, x0: cx, x1: R.l + (x2 + 0.5) * cw, y: cy });
        x = x2 + 1;
      }
    }
    return groups;
  }
  // Komşu satırlardaki parçaları tek, kalemi kaldırmayan yollara bağla
  function buildPaths(runs) {
    const byRow = new Map();
    for (const r of runs) { if (!byRow.has(r.row)) byRow.set(r.row, []); byRow.get(r.row).push(r); }
    const rowsS = [...byRow.keys()].sort((a, b) => a - b), done = [];
    let open = [];
    for (const row of rowsS) {
      const rs = byRow.get(row).sort((a, b) => a.x0 - b.x0), next = [];
      for (const r of rs) {
        let f = null;
        for (const c of open) if (!c.t && c.row === row - 1 && c.x >= r.x0 - 1 && c.x <= r.x1 + 1) { f = c; break; }
        if (f) {
          f.t = true;
          const near = Math.abs(f.x - r.x0) <= Math.abs(f.x - r.x1) ? r.x0 : r.x1, far = near === r.x0 ? r.x1 : r.x0;
          f.pts.push([f.x, r.y]);
          if (near !== f.x) f.pts.push([near, r.y]);
          if (far !== near) f.pts.push([far, r.y]);
          f.x = far; f.row = row; next.push(f);
        } else next.push({ pts: [[r.x0, r.y], [r.x1, r.y]], x: r.x1, row, t: false });
      }
      for (const c of open) if (!c.t) done.push(c);
      for (const c of next) c.t = false;
      open = next;
    }
    for (const c of open) done.push(c);
    return done.map(c => c.pts);
  }
  function groupsToLayers(groups, qp, wi, brush, skipWhite) {
    const out = [];
    for (const [c, runs] of groups) {
      if (skipWhite && c === wi) continue;
      out.push({ brush, el: qp[c].el, rgb: qp[c].rgb, white: c === wi, n: runs.length, paths: buildPaths(runs) });
    }
    out.sort((a, b) => (a.white - b.white) || (b.n - a.n));
    return out;
  }
  function brushFor(cellC, bl) {
    if (!bl.length) return -1;
    if (S.brushSel >= 0 && S.brushSel < bl.length) return S.brushSel;
    const k = bl.findIndex(t => t >= cellC * 0.9);
    return k < 0 ? bl.length - 1 : k;
  }
  function gridFor(G, cellClient) {
    let cols = Math.max(1, Math.round(G.R.w / cellClient)), rows = Math.max(1, Math.round(G.R.h / cellClient));
    while (cols * rows > 140000) { cols = Math.ceil(cols / 1.2); rows = Math.ceil(rows / 1.2); }
    return { cols, rows, cw: G.R.w / cols, ch: G.R.h / rows };
  }

  function planFill(G, bq) {
    const bl = brushList(), wI = G.R.w / G.sc;
    let cellC = S.auto ? clamp(wI / 130, 4, 20) : S.cell;
    const bi = brushFor(cellC, bl);
    if (bi >= 0) cellC = (S.brushSel >= 0) ? bl[bi] : Math.min(cellC, bl[bi]);
    cellC = Math.max(2.5, cellC);
    const g = gridFor(G, cellC * G.sc), buf = sampleGrid(g.cols, g.rows);
    const q = quantize(buf, g.cols, g.rows, bq.qp, S.dither);
    const groups = marksToRuns(q, g.cols, g.rows, G, g.cw, g.ch);
    return groupsToLayers(groups, bq.qp, bq.wi, bi, true);
  }

  function planLines(G, bq) {
    const bl = brushList();
    const bi = S.brushSel >= 0 && S.brushSel < bl.length ? S.brushSel : (bl.length ? 0 : -1);
    const cellC = Math.max(3, bi >= 0 ? bl[bi] : (S.auto ? 4 : S.cell));
    const g = gridFor(G, cellC * G.sc), buf = sampleGrid(g.cols, g.rows), n = g.cols * g.rows;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.3 * buf[i * 3] + 0.59 * buf[i * 3 + 1] + 0.11 * buf[i * 3 + 2];
    const mag = new Float32Array(n), at = (x, y) => lum[clamp(y, 0, g.rows - 1) * g.cols + clamp(x, 0, g.cols - 1)];
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      mag[y * g.cols + x] = Math.hypot(gx, gy);
    }
    const sorted = Float32Array.from(mag).sort();
    const keep = S.auto ? 14 : S.edge;
    const thr = Math.max(40, sorted[Math.min(n - 1, Math.floor(n * (1 - keep / 100)))]);
    let ink = 0, ib = 1e9;
    bq.qp.forEach((p, i) => { const s = p.rgb[0] + p.rgb[1] + p.rgb[2]; if (s < ib) { ib = s; ink = i; } });
    const mark = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (mag[i] >= thr) mark[i] = ink;
    return groupsToLayers(marksToRuns(mark, g.cols, g.rows, G, g.cw, g.ch), bq.qp, bq.wi, bi, true);
  }

  function planLayers(G, bq) {
    const bl = brushList(), { qp, wi } = bq;
    let idxs;
    if (bl.length >= 2) idxs = [...new Set([bl.length - 1, Math.floor((bl.length - 1) / 2), 0])];
    else idxs = [-1];
    const fineC = Math.max(2.5, bl.length ? Math.min(...bl) : (S.auto ? 5 : S.cell));
    const fine = fineC * G.sc;
    let fcols = Math.max(1, Math.ceil(G.R.w / fine)), frows = Math.max(1, Math.ceil(G.R.h / fine));
    while (fcols * frows > 200000) { fcols = Math.ceil(fcols / 1.2); frows = Math.ceil(frows / 1.2); }
    const fw = G.R.w / fcols, fh = G.R.h / frows;
    const model = new Int16Array(fcols * frows).fill(wi);
    const layers = [];
    const steps = idxs.length === 1 ? [{ idx: -1, c: Math.max(fineC, S.auto ? 5 : S.cell) }] : idxs.map(i => ({ idx: i, c: Math.max(2.5, bl[i]) }));
    for (const st of steps) {
      const g = gridFor(G, st.c * G.sc), buf = sampleGrid(g.cols, g.rows);
      const tgt = quantize(buf, g.cols, g.rows, qp, false), mark = new Int16Array(g.cols * g.rows).fill(-1);
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
        const t = tgt[y * g.cols + x];
        const px0 = x * g.cw, px1 = (x + 1) * g.cw, py0 = y * g.ch, py1 = (y + 1) * g.ch;
        const fx0 = clamp(Math.floor(px0 / fw), 0, fcols - 1), fx1 = clamp(Math.ceil(px1 / fw) - 1, 0, fcols - 1);
        const fy0 = clamp(Math.floor(py0 / fh), 0, frows - 1), fy1 = clamp(Math.ceil(py1 / fh) - 1, 0, frows - 1);
        const cur = model[clamp(Math.floor((fy0 + fy1) / 2), 0, frows - 1) * fcols + clamp(Math.floor((fx0 + fx1) / 2), 0, fcols - 1)];
        if (t === cur) continue;
        if (t === wi && !qp[wi].el) continue; // beyaz boya yoksa düzeltme yapılamaz
        mark[y * g.cols + x] = t;
        for (let yy = fy0; yy <= fy1; yy++) for (let xx = fx0; xx <= fx1; xx++) model[yy * fcols + xx] = t;
      }
      layers.push(...groupsToLayers(marksToRuns(mark, g.cols, g.rows, G, g.cw, g.ch), qp, wi, st.idx, false));
    }
    return layers;
  }

  function makePlan() {
    const G = geom(), bq = buildQP();
    const layers = S.style === 'lines' ? planLines(G, bq) : S.style === 'layers' ? planLayers(G, bq) : planFill(G, bq);
    let total = 0, frames = 0;
    for (const l of layers) for (const p of l.paths) { total++; frames += 2 + p.length; }
    return { layers, total, sec: Math.round(frames / 60 * (1 + (10 - S.speed) * 0.2)) };
  }

  /* ───────────── Çizim ───────────── */
  async function startDraw() {
    if (S.run !== 'idle') return;
    if (!cv) return msg('Çizim alanı bulunamadı');
    if (!S.img) return msg('Önce bir görsel yükle');
    if (S.mode === 'color' || S.palette.length < 2) {
      const sc = scanPalette(); if (sc.length >= 4) S.palette = sc; // öğeler yenilenmiş olabilir
    }
    if (S.mode === 'color' && S.palette.length < 2) return msg('Renkli mod için "Paleti tara" ya da "Renk ekle" kullan');
    if (pending !== null) { S.method = pending; pending = null; save(); }
    S.posMode = false;
    const prevOp = S.opacity;
    if (S.auto) S.opacity = Math.min(S.opacity, 0.15); // çizilenleri görebilmek için katmanı otomatik soluklaştır
    S.run = 'running'; stopFlag = false; ui();
    try {
      const P = makePlan();
      if (!P.total) throw new Error('Çizilecek bir şey çıkmadı (görsel alan dışında olabilir)');
      msg(P.total + ' çizgi · yaklaşık ' + P.sec + ' sn');
      await sleep(400);
      const t = pickTarget(), pen = mkPen(S.method, t), paced = S.method !== 3;
      let curBrush = -2, curColor = null, done = 0;
      for (const L of P.layers) {
        if (stopFlag) break;
        if (L.brush >= 0 && L.brush !== curBrush) { await setBrush(L.brush); curBrush = L.brush; }
        if (L.el && L.el !== curColor) {
          if (!L.el.isConnected) throw new Error('Palet öğesi sayfadan kalktı, paleti yeniden tara');
          clickEl(L.el); await sleep(70); curColor = L.el;
        }
        for (const pts of L.paths) {
          while (S.run === 'paused' && !stopFlag) await sleep(100);
          if (stopFlag) break;
          if (!cv || !cv.isConnected) throw new Error('Çizim alanı kayboldu');
          await drawPath(pen, pts, paced);
          done++;
          if (done % 5 === 0) prog(done / P.total);
        }
      }
      prog(stopFlag ? done / P.total : 1);
      msg(stopFlag ? 'Durduruldu' : 'Bitti · ' + P.total + ' çizgi');
    } catch (e) { msg('Hata: ' + e.message); }
    S.opacity = prevOp; S.run = 'idle'; ui();
  }

  /* ───────────── Rapor ───────────── */
  function report() {
    const L = [];
    L.push('url: ' + location.href + ' | pencere: ' + innerWidth + 'x' + innerHeight + ' dpr=' + devicePixelRatio);
    L.push('yöntem: ' + (S.method + 1) + ' (' + METHODS[S.method] + ') bekleyen: ' + pending);
    document.querySelectorAll('canvas').forEach((c, i) => {
      const r = c.getBoundingClientRect();
      L.push('canvas#' + i + ' css=' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' attr=' + c.width + 'x' + c.height + ' pe=' + getComputedStyle(c).pointerEvents + ' class="' + c.className + '"');
    });
    if (cv) {
      const v = visRect(cv);
      L.push('seçilen canvas görünür alan: ' + Math.round(v.l) + ',' + Math.round(v.t) + ' ' + Math.round(v.r - v.l) + 'x' + Math.round(v.b - v.t));
      const chain = []; for (let n = cv.parentElement; n && chain.length < 8; n = n.parentElement) { const s = getComputedStyle(n); chain.push(n.tagName + '.' + String(n.className).split(' ')[0] + '[' + s.overflowX + '/' + s.overflowY + ']'); }
      L.push('üst öğeler: ' + chain.join(' < '));
      const els = document.elementsFromPoint((v.l + v.r) / 2, (v.t + v.b) / 2).slice(0, 5);
      L.push('merkezdeki öğeler: ' + els.map(e => e.tagName + '.' + String(e.className).split(' ')[0]).join(' > '));
      L.push('okunabilir canvas: ' + readables().length);
    }
    const tb = thickBtns();
    L.push('fırça düğmesi: ' + tb.length + ' seçili=' + tb.findIndex(b => b.classList.contains('sel')) + ' tahmin/ölçüm(px): ' + brushList().map(Math.round).join(','));
    const sc = scanPalette();
    L.push('palet taraması: ' + sc.length + ' -> ' + sc.map(s => s.rgb.map(Math.round).join(',')).join(' | '));
    L.push('simetri: ' + S.mirror + ' eksen=' + S.mAxis + ' | eklenti bağlantısı: ' + !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id));
    L.push('kayıtlı palet: ' + S.palette.length + ' | mod=' + S.mode + ' stil=' + S.style + ' oto=' + S.auto);
    const txt = L.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      () => msg('Rapor panoya kopyalandı'), () => { console.log(txt); msg('Rapor konsola yazıldı (F12)'); });
  }

  /* ───────────── Simetri (mirror) ───────────── */
  // Oyun aynı anda tek çizgi işler. Bu yüzden senin çizgin bitince, aynası arkasından çizilir.
  const mirrorOn = () => S.mirror && cv && S.run === 'idle' && !S.posMode && !busy;
  window.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || e.button !== 0 || !mirrorOn() || e.composedPath().includes(host)) return;
    const v = visRect(cv);
    if (e.clientX < v.l || e.clientX > v.r || e.clientY < v.t || e.clientY > v.b) return;
    mStroke = { id: e.pointerId, pts: [[e.clientX, e.clientY]] };
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!mStroke || !e.isTrusted || e.pointerId !== mStroke.id) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const q of (list && list.length ? list : [e])) mStroke.pts.push([q.clientX, q.clientY]);
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (!mStroke || !e.isTrusted || e.pointerId !== mStroke.id) return;
    const pts = mStroke.pts; mStroke = null;
    pts.push([e.clientX, e.clientY]);
    setTimeout(() => replayMirror(pts), 0);
  }, true);
  window.addEventListener('pointercancel', (e) => { if (mStroke && e.pointerId === mStroke.id) mStroke = null; }, true);

  function thin(pts) {
    const o = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = o[o.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 1.5 || i === pts.length - 1) o.push(p);
    }
    return o;
  }
  function mirrorSets(pts) {
    const r = cv.getBoundingClientRect(), ax = r.left + r.width / 2, ay = r.top + r.height / 2, out = [];
    const fx = (p) => [2 * ax - p[0], p[1]], fy = (p) => [p[0], 2 * ay - p[1]], fb = (p) => [2 * ax - p[0], 2 * ay - p[1]];
    if (S.mAxis !== 'h') out.push(pts.map(fx));
    if (S.mAxis !== 'v') out.push(pts.map(fy));
    if (S.mAxis === 'both') out.push(pts.map(fb));
    return out;
  }
  function clipRuns(set, v) {
    const runs = []; let cur = [];
    for (const p of set) {
      if (p[0] >= v.l && p[0] <= v.r && p[1] >= v.t && p[1] <= v.b) cur.push(p);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    return runs;
  }
  function replayMirror(pts) {
    if (!S.mirror || !cv || !pts.length) return;
    mQueue = mQueue.then(async () => {
      try {
        const m = pending !== null ? pending : S.method, v = visRect(cv), t = pickTarget(), pen = mkPen(m, t);
        for (const set of mirrorSets(thin(pts))) for (const run of clipRuns(set, v)) await drawPath(pen, run, false);
      } catch (e) { msg('Simetri hatası: ' + e.message); }
    });
  }
  function toggleMirror() {
    S.mirror = !S.mirror; mStroke = null; ui();
    msg(S.mirror ? 'Simetri açık' : 'Simetri kapalı');
  }

  /* ───────────── Panel mantığı ───────────── */
  function msg(t) { $('prog').textContent = t; $('mmsg').textContent = t; }
  function prog(f) { $('barf').style.width = Math.round(f * 100) + '%'; $('prog').textContent = '%' + Math.round(f * 100); }

  const STYLE_HINT = {
    fill: 'Görseli satır satır, seçilen renklerle doldurur.',
    layers: 'Önce kalın fırçayla büyük renk blokları, sonra daha ince fırçalarla ayrıntılar (anime / yapay zekâ tarzı).',
    lines: 'Sadece kenar çizgilerini ince fırçayla çizer (siyah çizgi sanatı).'
  };
  function ui() {
    $('p').classList.toggle('min', !S.open);
    $('tg').textContent = S.open ? '–' : '+';
    root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    root.querySelectorAll('[data-sec]').forEach(s => s.classList.toggle('on', s.dataset.sec === S.tab));
    $('vis').textContent = S.visible ? 'Gizle' : 'Göster';
    $('pos').classList.toggle('on', S.posMode);
    $('op').value = Math.round(S.opacity * 100); $('opv').textContent = Math.round(S.opacity * 100) + '%';
    $('sz').value = Math.round(S.fw * 100); $('szv').textContent = Math.round(S.fw * 100) + '%';
    root.querySelectorAll('#mode [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
    root.querySelectorAll('#style [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === S.style));
    $('sth').textContent = STYLE_HINT[S.style];
    $('auto').checked = S.auto; $('dit').checked = S.dither;
    $('cell').value = S.cell; $('cellv').textContent = S.cell + 'px';
    $('li').value = S.lighten; $('liv').textContent = S.lighten + '%';
    $('ed').value = S.edge; $('edv').textContent = S.edge + '%';
    $('sp').value = S.speed; $('spv').textContent = S.speed;
    $('cell').disabled = S.auto && S.style !== 'fill' ? true : S.auto;
    $('li').disabled = S.auto; $('ed').disabled = S.auto;
    $('rli').style.display = S.style === 'lines' ? 'none' : 'grid';
    $('red').style.display = S.style === 'lines' ? 'grid' : 'none';
    $('rdit').style.display = S.style === 'fill' ? 'flex' : 'none';
    const nb = thickBtns().length;
    root.querySelectorAll('#brs [data-b]').forEach(b => {
      const i = +b.dataset.b;
      b.classList.toggle('on', i === S.brushSel);
      b.disabled = i >= 0 && i >= nb;
    });
    $('brh').textContent = !nb ? 'Oyunun fırça düğmeleri bulunamadı; fırçayı oyunda elle seç.'
      : (S.brushR && S.brushR.length === nb ? 'Fırça boyutları ölçüldü.' : 'Fırça boyutları tahmini. "Fırçaları ölç" ile netleştirebilirsin.');
    $('pal').innerHTML = S.palette.map(p => '<i style="background:rgb(' + p.rgb.map(Math.round).join(',') + ')"></i>').join('');
    $('add').classList.toggle('on', S.capturing);
    $('mbtn').textContent = S.mirror ? 'Simetri açık' : 'Simetri kapalı';
    $('mbtn').classList.toggle('on', S.mirror);
    root.querySelectorAll('#maxis [data-a]').forEach(b => b.classList.toggle('on', b.dataset.a === S.mAxis));
    $('mguide').checked = S.mGuide;
    const mm = pending !== null ? pending : S.method;
    $('mhint').textContent = 'Açıkken çizdiğin her çizgi, sen bitirince eksenin öbür tarafına da çizilir. Alt+M ile aç/kapat. Kullanılan yöntem: ' + (mm + 1) + ' (' + METHODS[mm] + '). Çizilmezse Çizim sekmesinde Test çizgisi\'ne bas.';
    const run = S.run;
    $('go').disabled = run !== 'idle';
    $('ps').disabled = run === 'idle'; $('ps').textContent = run === 'paused' ? 'Devam' : 'Duraklat';
    $('stp').disabled = run === 'idle';
    $('test').disabled = run !== 'idle'; $('meas').disabled = run !== 'idle';
  }

  function bind() {
    $('tg').onclick = () => { S.open = !S.open; ui(); save(); };
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; ui(); save(); });
    $('file').onchange = (e) => { handleFile(e.target.files[0]); e.target.value = ''; };
    const drop = $('drop');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); };
    $('vis').onclick = () => { S.visible = !S.visible; ui(); save(); };
    $('pos').onclick = () => { S.posMode = !S.posMode; ui(); };
    $('fit').onclick = fit;
    $('op').oninput = (e) => { S.opacity = e.target.value / 100; ui(); save(); };
    $('sz').oninput = (e) => {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      const cx = S.fx + S.fw / 2, cy = S.fy + (S.fw * r.width / S.aspect / r.height) / 2;
      S.fw = e.target.value / 100;
      S.fx = cx - S.fw / 2; S.fy = cy - (S.fw * r.width / S.aspect / r.height) / 2; ui(); save();
    };
    $('rm').onclick = () => {
      S.img = null; ov.removeAttribute('src'); $('fname').textContent = 'Görsel seç ya da buraya bırak';
      if (store) try { store.remove(IMGKEY); } catch (e) { /* yok say */ }
      ui();
    };
    root.querySelectorAll('#mode [data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; S.dither = S.mode === 'bw'; ui(); save(); });
    root.querySelectorAll('#style [data-s]').forEach(b => b.onclick = () => { S.style = b.dataset.s; ui(); save(); });
    root.querySelectorAll('#brs [data-b]').forEach(b => b.onclick = async () => {
      S.brushSel = +b.dataset.b; ui(); save();
      if (S.brushSel >= 0) await setBrush(S.brushSel);
    });
    $('auto').onchange = (e) => { S.auto = e.target.checked; ui(); save(); };
    $('dit').onchange = (e) => { S.dither = e.target.checked; save(); };
    $('cell').oninput = (e) => { S.cell = +e.target.value; ui(); save(); };
    $('li').oninput = (e) => { S.lighten = +e.target.value; ui(); save(); };
    $('ed').oninput = (e) => { S.edge = +e.target.value; ui(); save(); };
    $('sp').oninput = (e) => { S.speed = +e.target.value; ui(); save(); };
    $('scan').onclick = () => {
      const r = scanPalette();
      if (r.length < 2) return msg('Palet bulunamadı. "Renk ekle" ile oyundaki renkleri tek tek tıkla.');
      S.palette = r; ui(); msg(r.length + ' renk bulundu');
    };
    $('add').onclick = () => { S.capturing = !S.capturing; ui(); if (S.capturing) msg('Oyunda eklemek istediğin rengin üstüne tıkla'); };
    $('clr').onclick = () => { S.palette = []; S.capturing = false; ui(); };
    $('go').onclick = startDraw;
    $('ps').onclick = () => { S.run = S.run === 'paused' ? 'running' : 'paused'; ui(); };
    $('stp').onclick = () => { stopFlag = true; if (S.run === 'paused') S.run = 'running'; };
    $('test').onclick = testLine;
    $('meas').onclick = measureBrushes;
    $('dbg').onclick = report;
    $('mbtn').onclick = toggleMirror;
    root.querySelectorAll('#maxis [data-a]').forEach(b => b.onclick = () => { S.mAxis = b.dataset.a; ui(); save(); });
    $('mguide').onchange = (e) => { S.mGuide = e.target.checked; save(); };

    const hd = $('hd');
    let d = null;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = host.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      hd.setPointerCapture(e.pointerId);
    });
    hd.addEventListener('pointermove', (e) => {
      if (!d) return;
      host.style.left = clamp(e.clientX - d.dx, 0, innerWidth - 60) + 'px';
      host.style.top = clamp(e.clientY - d.dy, 0, innerHeight - 40) + 'px';
      host.style.right = 'auto';
    });
    hd.addEventListener('pointerup', () => { d = null; });

    window.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      if (e.code === 'KeyO') { S.visible = !S.visible; ui(); save(); e.preventDefault(); }
      if (e.code === 'KeyP') { S.open = !S.open; ui(); save(); e.preventDefault(); }
      if (e.code === 'KeyM') { toggleMirror(); e.preventDefault(); }
      if (e.code === 'KeyS' && S.run !== 'idle') { stopFlag = true; if (S.run === 'paused') S.run = 'running'; e.preventDefault(); }
    }, true);
  }

  /* ───────────── Başlat ───────────── */
  function mount() {
    document.body.appendChild(wrap);
    document.body.appendChild(host);
    const lg = $('logo');
    lg.onerror = () => { lg.style.display = 'none'; $('ttl').style.display = 'block'; };
    try { lg.src = chrome.runtime.getURL('logo.svg'); } catch (e) { lg.onerror(); }
    bind(); ui();
    requestAnimationFrame(loop);
    setInterval(() => {
      if (!host.isConnected) document.body.appendChild(host);
      if (!wrap.isConnected) document.body.appendChild(wrap);
      if (cv && S.run === 'idle' && S.palette.filter(p => p.el && p.el.isConnected).length < 4 && !S.capturing) {
        const r = scanPalette();
        if (r.length >= 4) { S.palette = r; ui(); }
      }
      if (S.run === 'idle') ui();
    }, 1500);
  }

  function init() {
    if (!document.body) return setTimeout(init, 100);
    const finish = (r) => {
      const o = r && r[KEY];
      if (o) Object.keys(o).forEach(k => { if (SAVE.indexOf(k) > -1) S[k] = o[k]; });
      mount();
      if (r && r[IMGKEY]) loadImage(r[IMGKEY], 'Kayıtlı görsel', false);
    };
    if (store) { try { store.get([KEY, IMGKEY], finish); } catch (e) { finish(null); } } else finish(null);
  }
  init();
})();
