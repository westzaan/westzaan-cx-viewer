/* Site plan harvest — open  <viewer>/?harvest=1  once (≈20 min). Loads every area's models one area at a time,
   takes an orthographic top-view render of each area, measures the area outline in site coordinates,
   stitches everything into one site plan and uploads  site_plan.jpg + site_plan.json  to the ACC data folder.
   ?harvest=1&areas=20A,20B   limits the run (test). Result: two downloads to drop into the ACC data folder (no write permission needed). */
window.CX_HARVEST = async function () {
  const A = window.CX_AUTH, CFG = window.CX_CONFIG, $ = (s) => document.querySelector(s);
  const P = new URLSearchParams(location.search);
  // No write permission needed: the result is offered as two downloads that you drop into the ACC data folder.
  const tok = await A.token();
  if (!tok) {
    $('#gate').style.display = 'flex';
    $('#gatemsg').innerHTML = 'Sign in with your Autodesk account to run the site plan harvest.';
    $('#gatebtn').innerHTML = '<button class="btn" id="go">Sign in with Autodesk</button>'; $('#go').onclick = () => A.login(); return;
  }
  // ---- UI: fixed square render canvas + log
  document.body.innerHTML = `<div style="display:flex;gap:16px;padding:12px;font:13px Segoe UI,sans-serif;color:#e6e9ee;background:#14181d;height:100vh;box-sizing:border-box">
    <div style="position:relative;width:1400px;height:1400px;max-height:calc(100vh - 24px);aspect-ratio:1;flex:none" id="hv"></div>
    <div style="flex:1;min-width:0;overflow:auto"><h2 style="margin:0 0 8px">Site plan harvest</h2><div id="hs">starting…</div><pre id="hl" style="font-size:11px;color:#8a94a3;white-space:pre-wrap"></pre><div id="hp"></div></div></div>`;
  const say = (t) => ($('#hs').textContent = t), log = (t) => ($('#hl').textContent += t + '\n');
  const index = await A.readDataFile('index.json');
  let areas = Object.entries(index.areas).filter(([a, v]) => /^\d\d[A-Z]$/.test(a) && ((v.docs || []).length || (v.context || []).length)).map(([a]) => a).sort();
  if (P.get('areas')) { const w = new Set(P.get('areas').split(',')); areas = areas.filter((a) => w.has(a)); }
  log(`areas: ${areas.join(', ')}`);

  const getToken = async (cb) => { const t = await A.token(); cb(t.access, Math.floor((t.exp - Date.now()) / 1000)); };
  await new Promise((res) => Autodesk.Viewing.Initializer({ env: 'AutodeskProduction2', api: CFG.viewerApi, getAccessToken: getToken }, res));
  const viewer = new Autodesk.Viewing.Viewer3D($('#hv'), { });           // no toolbar: clean renders
  viewer.start(); viewer.setBackgroundColor(255, 255, 255, 255, 255, 255); viewer.setGroundShadow(false); viewer.setGroundReflection(false);
  viewer.setQualityLevel(false, true); viewer.setEnvMapBackground(false); viewer.setLightPreset(0); viewer.setProgressiveRendering(false);
  let globalOffset = null;
  const waitGeom = (m) => new Promise((res) => { if (m.isLoadDone && m.isLoadDone()) return res();
    const h = (e) => { if (e.model === m) { viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, h); res(); } };
    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, h); setTimeout(res, 120000); });
  const load = (d) => new Promise((res) => Autodesk.Viewing.Document.load('urn:' + d.urn, async (doc) => {
    const g = doc.getRoot().search({ type: 'geometry', role: '3d' })[0]; if (!g) return res(null);
    const o = { keepCurrentModels: true, applyRefPoint: true }; if (globalOffset) o.globalOffset = globalOffset;
    try { const m = await viewer.loadDocumentNode(doc, g, o); if (!globalOffset) globalOffset = m.getData().globalOffset; await waitGeom(m); res(m); } catch (e) { res(null); }
  }, () => res(null)));
  const frameDone = () => new Promise((res) => { let t = setTimeout(res, 15000);
    const h = (e) => { if (e.value && e.value.finalFrame) { clearTimeout(t); viewer.removeEventListener(Autodesk.Viewing.FINAL_FRAME_RENDERED_CHANGED_EVENT, h); setTimeout(res, 300); } };
    viewer.addEventListener(Autodesk.Viewing.FINAL_FRAME_RENDERED_CHANGED_EVENT, h); viewer.impl.invalidate(true, true, true); });
  const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(q * (s.length - 1))))]; };

  const out = { built: new Date().toISOString().slice(0, 16).replace('T', ' '), areas: {} }, shots = {};
  for (const [i, a] of areas.entries()) {
    const v = index.areas[a]; const list = [...(v.docs || []), ...(v.context || [])];
    say(`area ${a} (${i + 1}/${areas.length}) – loading ${list.length} models…`);
    const t0 = Date.now(); const ms = []; const q = [...list];
    while (q.length && !globalOffset) { const m = await load(q.shift()); if (m) ms.push(m); }
    await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const m = await load(q.shift()); if (m) ms.push(m); } }));
    if (!ms.length) { log(`${a}: nothing loaded`); continue; }
    // robust outline: 2nd–98th percentile of fragment centres (drops stray geometry far away)
    const xs = [], ys = [], zs = []; const bb = new THREE.Box3();
    for (const m of ms) { const fl = m.getFragmentList(); const n = fl.getCount(); const step = Math.max(1, Math.floor(n / 20000));
      for (let f = 0; f < n; f += step) { fl.getWorldBounds(f, bb); if (bb.isEmpty()) continue; xs.push((bb.min.x + bb.max.x) / 2); ys.push((bb.min.y + bb.max.y) / 2); zs.push(bb.max.z); } }
    const pad = 4, box = { minx: pct(xs, 0.02) - pad, maxx: pct(xs, 0.98) + pad, miny: pct(ys, 0.02) - pad, maxy: pct(ys, 0.98) + pad, maxz: pct(zs, 0.99) };
    // orthographic top view, north (+Y) up, fitted to the outline
    const cx = (box.minx + box.maxx) / 2, cy = (box.miny + box.maxy) / 2;
    viewer.navigation.toOrthographic();
    viewer.navigation.setView(new THREE.Vector3(cx, cy, box.maxz + 500), new THREE.Vector3(cx, cy, box.maxz - 1));
    viewer.navigation.setCameraUpVector(new THREE.Vector3(0, 1, 0));
    viewer.navigation.fitBounds(true, new THREE.Box3(new THREE.Vector3(box.minx, box.miny, box.maxz - 50), new THREE.Vector3(box.maxx, box.maxy, box.maxz)));
    await frameDone();
    const W = viewer.container.clientWidth, H = viewer.container.clientHeight;
    const c1 = viewer.worldToClient(new THREE.Vector3(box.minx, box.miny, box.maxz)), c2 = viewer.worldToClient(new THREE.Vector3(box.maxx, box.maxy, box.maxz));
    const url = await new Promise((r) => viewer.getScreenShot(W, H, r));
    const o = globalOffset;
    out.areas[a] = { box: [box.minx + o.x, box.miny + o.y, box.maxx + o.x, box.maxy + o.y].map((x) => Math.round(x * 100) / 100), models: ms.length };
    shots[a] = { url, px: [c1.x, c2.y, c2.x - c1.x, c1.y - c2.y] };          // source rect of the outline inside the screenshot
    log(`${a}: ${ms.length} models, ${Math.round(box.maxx - box.minx)} × ${Math.round(box.maxy - box.miny)} m, ${Math.round((Date.now() - t0) / 1000)} s`);
    $('#hp').insertAdjacentHTML('beforeend', `<img src="${url}" title="${a}" style="width:120px;margin:2px;border:1px solid #2b333d;background:#fff">`);
    for (const m of ms) viewer.unloadModel(m);
    viewer.navigation.toPerspective();
  }
  // ---- stitch: one image in site coordinates, north up
  say('stitching site plan…');
  const bxs = Object.values(out.areas).map((x) => x.box);
  const ext = [Math.min(...bxs.map((b) => b[0])), Math.min(...bxs.map((b) => b[1])), Math.max(...bxs.map((b) => b[2])), Math.max(...bxs.map((b) => b[3]))];
  const mpp = Math.max((ext[2] - ext[0]) / 4000, (ext[3] - ext[1]) / 4000, 0.1);    // metres per pixel, max 4000 px
  const cw = Math.ceil((ext[2] - ext[0]) / mpp), ch = Math.ceil((ext[3] - ext[1]) / mpp);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.globalCompositeOperation = 'multiply';        // white = transparent where areas overlap
  for (const [a, s] of Object.entries(shots)) {
    const img = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = s.url; });
    const b = out.areas[a].box; const sc = img.naturalWidth / viewer.container.clientWidth;
    g.drawImage(img, s.px[0] * sc, s.px[1] * sc, s.px[2] * sc, s.px[3] * sc, (b[0] - ext[0]) / mpp, (ext[3] - b[3]) / mpp, (b[2] - b[0]) / mpp, (b[3] - b[1]) / mpp);
  }
  out.extent = ext.map((x) => Math.round(x * 100) / 100); out.size = [cw, ch]; out.image = 'site_plan.jpg';
  const jpg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
  $('#hp').insertAdjacentHTML('afterbegin', `<img src="${URL.createObjectURL(jpg)}" style="width:100%;background:#fff;margin-bottom:8px">`);
  const json = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const dl = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.textContent = 'Download ' + name;
    a.style.cssText = 'display:inline-block;margin:6px 10px 6px 0;padding:8px 14px;background:#4cc3ff;color:#000;border-radius:4px;font-weight:700;text-decoration:none'; return a; };
  const box = document.createElement('div'); box.style.margin = '10px 0';
  box.append(dl(jpg, 'site_plan.jpg'), dl(json, 'site_plan.json'));
  $('#hp').prepend(box);
  if (P.get('upload') === '0') { say('done (test run). Check the plan below.'); return; }
  say(`done ✓ ${Object.keys(out.areas).length} areas, ${cw}×${ch} px. Download both files and drag them into ACC › Internal Check › Cx Viewer data (replace if asked).`);
};
