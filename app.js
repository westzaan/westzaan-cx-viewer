/* Westzaan Cx Viewer v5 — ACC-native: Autodesk login, data + models straight from ACC, nothing on a server.
   Data set (published weekly into ACC › Internal Check › Cx Viewer data):
     index.json            areas → models, KPIs (small, loads first)
     subsystems.json       status per subsystem (Subsystems Master, Data Hub)
     lines.json            spool status per line (spool tracker)
     area_<AREA>.json      element mapping for that area's models  {bySubsystem, byLine, ext}
*/
(async function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const A = window.CX_AUTH, CFG = window.CX_CONFIG;
  const status = (t) => ($('#status').textContent = t);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const gate = (msg, btn) => { $('#gate').style.display = 'flex'; $('#gatemsg').innerHTML = msg; $('#gatebtn').innerHTML = btn || ''; };

  // ------------------------------------------------------------------ sign in
  let tok;
  try { tok = await A.init(); } catch (e) { gate(esc(e.message), '<button class="btn" id="go">Sign in with Autodesk</button>'); $('#go').onclick = A.login; return; }
  if (CFG.clientId.startsWith('PASTE')) return gate('The APS Client ID is not set yet (config.js).');
  if (new URLSearchParams(location.search).has('harvest')) return window.CX_HARVEST();
  if (!tok) {
    gate('Sign in with your Autodesk account. You will see exactly what your ACC permissions allow on the Westzaan project.',
      '<button class="btn" id="go">Sign in with Autodesk</button>');
    $('#go').onclick = A.login; return;
  }
  $('#gate').style.display = 'none';
  A.api('/userprofile/v1/users/@me').then((u) => ($('#who').innerHTML = `${esc(u.firstName)} ${esc(u.lastName)} · <a href="#" id="out">sign out</a>`, $('#out').onclick = (e) => (e.preventDefault(), A.logout()))).catch(() => {});

  // ------------------------------------------------------------------ data
  status('loading data from ACC…');
  let index, subsystems, lines, legend, meta;
  try {
    [index, subsystems, lines, legend, meta] = await Promise.all(['index.json', 'subsystems.json', 'lines.json', 'legend.json', 'status_meta.json'].map((n) => A.readDataFile(n)));
    if (!index || !subsystems) throw new Error('Data files not found in the ACC data folder.');
  } catch (e) {
    return gate(`Could not read the data folder in ACC (${esc(e.message)}). Check that you have access to <i>Internal Check › Cx Viewer data</i>.`, '<button class="btn" onclick="CX_AUTH.logout()">Sign out</button>');
  }
  legend ||= {}; meta ||= {};
  const SS = Object.fromEntries(subsystems.map((s) => [s.ss, s]));
  const LN = Object.fromEntries(lines.map((l) => [l.line, l]));
  const ssLines = {}; for (const l of lines) for (const s of l.subsystems || []) (ssLines[s] ||= []).push(l);
  const linesOf = (s) => ssLines[s.ss] || [];
  $('#meta').textContent = `Status ${meta.subsystem_data_date || '?'} · spools week ${meta.spool_week || '?'}`; $('#meta').title = `app ${window.CX_VERSION || '?'} · models v${index.modelset_version} · data built ${index.built}`;

  // ------------------------------------------------------------------ state + URL
  const P = new URLSearchParams(location.search);
  const S = {
    open: new Set((P.get('open') || '').split(',').filter(Boolean)), area: P.get('area') || '', mode: P.get('mode') || 'mc',
    f: { prio: P.get('prio') || '', sprint: P.get('sprint') || '', typ: P.get('typ') || '', fluid: P.get('fluid') || '', phase: P.get('phase') || '', link: P.get('link') || '' },
    group: P.get('group') || '', q: P.get('q') || '', sel: P.get('sel') || null, gsel: null,
    sub: new Set((P.get('sub') || '').split(',').map((x) => x.trim()).filter(Boolean)),
    inm: P.get('inm') === '1', lbl: P.get('lbl') === '1', ctx: P.get('ctx') === '1', ei: P.get('ei') === '1', cam: P.get('cam') || '', alb: P.get('alb') !== '0',
    pf: { cls: P.get('pcls') || '', by: P.get('pby') || '', di: P.get('pdi') || '' }, pins: P.get('pins') !== '0', hov: P.get('hov') !== '0', cd: +(P.get('cd') || 7),
  };
  if (S.area) S.open.add(S.area);
  function pushUrl() {
    const q = new URLSearchParams();
    if (S.open.size) q.set('open', [...S.open].join(','));
    if (S.area) q.set('area', S.area);
    if (S.mode !== 'mc') q.set('mode', S.mode);
    for (const [k, v] of Object.entries(S.f)) if (v) q.set(k, v);
    if (S.group) q.set('group', S.group); if (S.q) q.set('q', S.q); if (S.sel) q.set('sel', S.sel);
    if (S.sub.size) q.set('sub', [...S.sub].join(','));
    if (S.inm) q.set('inm', '1'); if (S.lbl) q.set('lbl', '1'); if (S.ctx) q.set('ctx', '1'); if (S.ei) q.set('ei', '1'); if (!S.alb) q.set('alb', '0'); if (S.pf.cls) q.set('pcls', S.pf.cls); if (S.pf.by) q.set('pby', S.pf.by); if (S.pf.di) q.set('pdi', S.pf.di);
    if (!S.pins) q.set('pins', '0'); if (S.cd !== 7) q.set('cd', S.cd); if (!S.hov) q.set('hov', '0'); if (S.cam) q.set('cam', S.cam);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }
  $('#copy').onclick = async () => { S.cam = camToStr(); pushUrl(); S.cam = ''; try { await navigator.clipboard.writeText(location.href); $('#copy').textContent = 'Copied ✓'; } catch { prompt('Copy this link:', location.href); } setTimeout(() => ($('#copy').textContent = 'Copy link'), 1500); };

  // ------------------------------------------------------------------ colours
  const PH_ORDER = ['none', 'mc', 'pcx', 'ccx', 'hcx'];
  const SILVER = [0.76, 0.78, 0.81];                       // agreed base colour: everything without status
  const C = { grey: SILVER, red: [0.86, 0.22, 0.20], orange: [0.95, 0.55, 0.15], yellow: [0.93, 0.83, 0.20], green: [0.30, 0.72, 0.35],
    mc: [0.16, 0.66, 0.66], pcx: [0.25, 0.50, 0.95], ccx: [0.58, 0.36, 0.86], hcx: [0.10, 0.50, 0.25] };
  const PAL = [[0.95,0.45,0.2],[0.3,0.6,0.95],[0.55,0.8,0.3],[0.85,0.35,0.7],[0.95,0.8,0.25],[0.25,0.75,0.7],[0.7,0.5,0.9],[0.9,0.6,0.5],[0.4,0.85,0.6],[0.6,0.6,0.95]];
  const sprintNames = [...new Set(subsystems.flatMap((s) => s.sprints || []))].sort();
  const sprintColor = (n) => PAL[sprintNames.indexOf(n) % PAL.length];
  const rgb = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')})`;
  const PHASE_TXT = { none: 'not started', mc: 'MC', pcx: 'Pre-Cx', ccx: 'Cold Cx', hcx: 'Hot Cx' };
  function bestSS(o) { let b = null; for (const id of o.ss) { const s = SS[id]; if (!s) continue;
    if (!b || PH_ORDER.indexOf(s.phase) > PH_ORDER.indexOf(b.phase) || (s.phase === b.phase && (s.qcr_pct ?? 1) < (b.qcr_pct ?? 1))) b = s; } return b; }
  const ready = (pct, ph) => ph && ph !== 'none' ? C[ph] : pct == null ? C.grey : pct >= 1 ? C.green : pct >= 0.75 ? C.yellow : pct >= 0.25 ? C.orange : C.red;
  const MODES = {
    mc: { legend: [['QCR <25%', C.red], ['25–74%', C.orange], ['75–99%', C.yellow], ['QCR 100%', C.green], ['MC', C.mc], ['Pre-Cx', C.pcx], ['Cold Cx', C.ccx], ['Hot Cx', C.hcx], ['no data', C.grey]],
      color: (o) => { const s = bestSS(o); if (s) return ready(s.qcr_pct, s.phase); const l = LN[o.line]; return l ? ready(l.qcr_pct, null) : null; },
      value: (s) => s.phase !== 'none' ? PHASE_TXT[s.phase] : s.qcr_pct == null ? '–' : Math.round(s.qcr_pct * 100) + '%' },
    phase: { legend: [['not started', C.grey], ['MC', C.mc], ['Pre-Cx', C.pcx], ['Cold Cx', C.ccx], ['Hot Cx', C.hcx]],
      color: (o) => { const s = bestSS(o); return s ? (s.phase === 'none' ? C.grey : C[s.phase]) : null; }, value: (s) => PHASE_TXT[s.phase] },
    spool: { legend: [['0 installed', C.red], ['partly', C.orange], ['100% installed', C.green], ['handed over', C.hcx], ['no line', C.grey]],
      color: (o) => { const l = LN[o.line]; if (!l) return null; if (l.ho_pct >= 1) return C.hcx; return l.inst_pct >= 1 ? C.green : l.inst_pct > 0 ? C.orange : C.red; },
      value: (s) => { const ls = linesOf(s); const t = ls.reduce((a, l) => a + l.spools, 0), i = ls.reduce((a, l) => a + l.installed, 0); return t ? Math.round(100 * i / t) + '%' : '–'; } },
    punch: { legend: [['open A-punch', C.red], ['open B', C.orange], ['open C', C.yellow], ['punches on subsystem, not on this element', [0.45, 0.55, 0.72]], ['no open punches', C.green]],
      color: (o) => { if (!PU.ready) return null; const w = elemWorst(o); if (w) return SEV[w]; for (const ss of o.ss) if (ssOpen[ss]) return [0.45, 0.55, 0.72]; return o.ss.size ? C.green : null; },
      value: (s) => { if (!PU.ready) return '…'; const c = pCount(PU.bySs[s.ss] || []); return ['A', 'B', 'C'].filter((k) => c[k]).map((k) => k + c[k]).join(' ') || '0'; } },
    cleared: { legend: () => [[`punches cleared in last ${S.cd} days`, [0.15, 0.95, 0.45]], ['cleared on the subsystem', [0.6, 0.85, 0.65]], ['open punches, nothing cleared', [0.55, 0.3, 0.3]], ['no punches', SILVER]],
      color: (o) => { if (!PU.ready) return null; if (elemCleared(o)) return [0.15, 0.95, 0.45]; for (const x of o.ss) if (ssClr[x]) return [0.6, 0.85, 0.65]; return elemWorst(o) ? [0.55, 0.3, 0.3] : null; },
      value: (s) => PU.ready ? '✓ ' + (ssClr[s.ss] || 0) : '…' },
    qcr: { legend: [['QCR sheets 100% checked', C.green], ['75–99%', C.yellow], ['25–74%', C.orange], ['<25%', C.red], ['no QCR sheet on element', SILVER]],
      color: (o) => QC.ready ? qBand(elemQcr(o)) : null,
      value: (s) => { const q = QC.ready ? ssQcr(s.ss) : null; return q ? `${q[1]}/${q[0]}` : '–'; } },
    ready: { legend: [['MC or beyond', C.mc], ['ready for MC', C.green], ['minor: B/C punches or QCR <100%', C.orange], ['blocked: A-punch, spools or QCR <75%', C.red], ['no data', SILVER]],
      color: (o) => RDY[readiness(o).k] || null, value: (s) => ssReadiness(s) },
    sprint: { legend: () => [...new Set(listScope().flatMap((s) => s.sprints || []))].sort().map((n) => [n, sprintColor(n)]),
      color: (o) => { const n = bestSS(o)?.sprints?.[0]; return n ? sprintColor(n) : null; }, value: (s) => (s.sprints?.[0] || '–').replace(/^.*Sprint\s*(\w+).*$/i, 'S$1') },
  };

  // ------------------------------------------------------------------ area data + mapping
  const areaData = {};                 // area -> {bySubsystem, byLine, ext}
  const rawIdx = {};                   // docKey -> Map(dbId -> {ss:Set, line})  (ids of the mapped version)
  const docArea = {};                  // docKey -> area
  async function loadAreaData(a) {
    if (areaData[a] !== undefined) return areaData[a];
    areaData[a] = null;
    const d = await A.readDataFile(`area_${a}.json`).catch(() => null); if (!d) return null;
    areaData[a] = d;
    const ensure = (urn, id) => { const m = (rawIdx[urn] ||= new Map()); let o = m.get(id); if (!o) m.set(id, (o = { ss: new Set(), line: null })); return o; };
    for (const [ss, byUrn] of Object.entries(d.bySubsystem)) for (const [urn, ids] of Object.entries(byUrn)) { docArea[urn] = a; for (const id of ids) ensure(urn, id).ss.add(ss); }
    for (const [line, byUrn] of Object.entries(d.byLine)) for (const [urn, ids] of Object.entries(byUrn)) { docArea[urn] = a; for (const id of ids) { const o = ensure(urn, id); o.line = line; for (const s of LN[line]?.subsystems || []) o.ss.add(s); } }
    return d;
  }
  const inModel = (s) => (s.link ? s.link.startsWith('in model') : null);

  // ------------------------------------------------------------------ Co-Consol punches (punches.json)
  const PU = { byLine: {}, byEq: {}, bySs: {}, all: [], ready: false, date: '' };
  const SEV = { A: C.red, B: C.orange, C: C.yellow };
  const ssEq = {}; for (const s of subsystems) { const m = /([A-Z]{1,4})\s?-?(\d{3,5}[A-Z]?)/.exec(s.eq || ''); if (s.area && m) ssEq[s.ss] = `${s.area}-${m[1]}${m[2]}`.toUpperCase(); }
  const punchReady = A.readDataFile('punches.json').then((j) => {
    if (!j) return; PU.date = j.data_date; PU.all = j.punches;
    for (const p of j.punches) { (PU.bySs[p.ss] ||= []).push(p); if (p.l) (PU.byLine[p.l] ||= []).push(p); if (p.e) (PU.byEq[p.e] ||= []).push(p); }
    PU.ready = true; recomputePunch(); recomputeCleared(); if (window.__cxUp) { renderPunchFacets(); refresh(false); if (S.mode === 'punch') colorAll(); }
  }).catch((e) => console.warn('no punches', e));
  const pOk = (p) => p.o && (!S.pf.cls || p.s === S.pf.cls) && (!S.pf.by || p.by === S.pf.by) && (!S.pf.di || p.di === S.pf.di);
  const pFilterOn = () => !!(S.pf.cls || S.pf.by || S.pf.di);
  const worst = (ps) => { let w = null; for (const p of ps) if (pOk(p) && (!w || p.s < w)) w = p.s; return w; };   // 'A' < 'B' < 'C'
  let lineWorst = {}, eqWorst = {}, ssOpen = {};
  function recomputePunch() {
    lineWorst = {}; eqWorst = {}; ssOpen = {};
    for (const [k, ps] of Object.entries(PU.byLine)) { const w = worst(ps); if (w) lineWorst[k] = w; }
    for (const [k, ps] of Object.entries(PU.byEq)) { const w = worst(ps); if (w) eqWorst[k] = w; }
    for (const [k, ps] of Object.entries(PU.bySs)) { const n = ps.filter(pOk).length; if (n) ssOpen[k] = n; }
  }
  // punches cleared recently (Co-Consol 'Cleared Date' within the window before the data date)
  let lineClr = {}, eqClr = {}, ssClr = {};
  function recomputeCleared() {
    lineClr = {}; eqClr = {}; ssClr = {}; if (!PU.ready) return;
    const lim = new Date(new Date(PU.date).getTime() - S.cd * 864e5).toISOString().slice(0, 10);
    for (const p of PU.all) { if (p.o || !p.cd || p.cd < lim) continue;
      ssClr[p.ss] = (ssClr[p.ss] || 0) + 1; if (p.l) lineClr[p.l] = (lineClr[p.l] || 0) + 1; if (p.e) eqClr[p.e] = (eqClr[p.e] || 0) + 1; }
  }
  const elemCleared = (o) => o.line ? (lineClr[o.line] || 0) : [...o.ss].reduce((a, x) => a + (eqClr[ssEq[x]] || 0), 0);
  // QCR sheets (qcr.json): per element key and per subsystem/type
  const QC = { ready: false, byKey: {}, bySs: {} };
  const qcrReady = A.readDataFile('qcr.json').then((j) => { if (!j) return; QC.byKey = j.byKey; QC.bySs = j.bySs; QC.ready = true;
    if (window.__cxUp) { refresh(false); if (S.mode === 'qcr' || S.mode === 'ready') colorAll(); } }).catch(() => {});
  const elemQcr = (o) => { if (!o) return null; if (o.line) return QC.byKey[o.line] || null; for (const x of o.ss) { const e = QC.byKey[ssEq[x]]; if (e) return e; } return null; };
  const qBand = (e) => { if (!e || !e[0]) return null; const r = e[1] / e[0]; return r >= 1 ? C.green : r >= 0.75 ? C.yellow : r >= 0.25 ? C.orange : C.red; };
  const ssQcr = (ss) => { const t = QC.bySs[ss]; if (!t) return null; let a = 0, b = 0; for (const v of Object.values(t)) { a += v[0]; b += v[1]; } return [a, b]; };
  // sprint readiness per element / subsystem
  function readiness(o) {
    const s = bestSS(o); if (s && s.phase !== 'none') return { k: 'done', why: [PHASE_TXT[s.phase] + ' reached'] };
    const why = []; let k = 'ready';
    const ps = elemPunches(o).filter(pOk); const a = ps.filter((p) => p.s === 'A').length, bc = ps.length - a;
    const l = LN[o.line], e = elemQcr(o);
    if (a) { k = 'blocked'; why.push(`${a} open A-punch${a > 1 ? 'es' : ''}`); }
    if (l && l.spools && l.inst_pct < 1) { k = 'blocked'; why.push(`spools ${l.installed}/${l.spools} installed`); }
    if (e && e[0] && e[1] / e[0] < 0.75) { k = 'blocked'; why.push(`QCR ${e[1]}/${e[0]} checked`); }
    if (k !== 'blocked') { if (bc) { k = 'minor'; why.push(`${bc} open B/C punches`); } if (e && e[1] < e[0]) { k = 'minor'; why.push(`QCR ${e[1]}/${e[0]} checked`); } }
    return { k, why };
  }
  function ssReadiness(s) {
    if (s.phase !== 'none') return 'MC+';
    const c = PU.ready ? pCount(PU.bySs[s.ss] || []) : { A: 0, B: 0, C: 0 }; const ls = linesOf(s);
    const sp = ls.reduce((a, l) => a + (l.spools || 0), 0), si = ls.reduce((a, l) => a + (l.installed || 0), 0);
    if (c.A || (sp && si < sp) || (s.qcr_pct != null && s.qcr_pct < 0.75)) return 'blocked';
    if (c.B || c.C || (s.qcr_pct != null && s.qcr_pct < 1)) return 'minor';
    return 'ready';
  }
  const RDY = { done: C.mc, ready: C.green, minor: C.orange, blocked: C.red };

  function elemPunches(o) {                              // punches that sit on this element (line or equipment tag)
    if (!o) return [];
    if (o.line) return PU.byLine[o.line] || [];
    const out = []; for (const ss of o.ss) { const k = ssEq[ss]; if (k && PU.byEq[k]) out.push(...PU.byEq[k]); } return [...new Set(out)];
  }
  function elemWorst(o) { if (o.line) return lineWorst[o.line] || null; let w = null; for (const ss of o.ss) { const x = eqWorst[ssEq[ss]]; if (x && (!w || x < w)) w = x; } return w; }
  const pCount = (ps) => { const c = { A: 0, B: 0, C: 0 }; for (const p of ps) if (pOk(p)) c[p.s]++; return c; };
  const pBadges = (c) => ['A', 'B', 'C'].filter((k) => c[k]).map((k) => `<span class="pb pb${k}">${k} ${c[k]}</span>`).join('') || '<span class="pb pb0">no open punches</span>';
  const pRows = (ps, max = 40) => {
    const list = ps.filter(pOk).sort((a, b) => a.s.localeCompare(b.s) || String(a.n).localeCompare(String(b.n)));
    return list.slice(0, max).map((p) => `<div class="pr"><span class="pb pb${p.s}">${esc(p.c)}</span><div><b>${esc(p.n)}</b> ${esc(p.d)}<div class="meta">${esc(p.t)} · ${esc(p.tt || '')} · action ${esc(p.by || '–')} · raised ${esc(p.rb || '–')} · ${esc(p.di || '')}</div></div></div>`).join('') +
      (list.length > max ? `<div class="meta">… ${list.length - max} more</div>` : '');
  };
  function renderPunchFacets() {
    const el = $('#pfacets'); if (!el) return;
    const on = ['punch', 'cleared', 'qcr', 'ready'].includes(S.mode); el.style.display = on ? 'grid' : 'none'; if (!on) return;
    if (S.mode === 'cleared') {
      const scope = new Set(listScope().map((s) => s.ss)); const n = Object.entries(ssClr).filter(([k]) => scope.has(k)).reduce((a, [, v]) => a + v, 0);
      el.innerHTML = `<label>Cleared within<select id="cdw">${[7, 14, 35].map((d) => `<option ${d === S.cd ? 'selected' : ''} value="${d}">last ${d} days</option>`).join('')}</select></label>
        <label>&nbsp;<span class="meta" style="padding-top:5px"><b style="color:#27f273">${n}</b> punches cleared in this selection · Co-Consol ${esc(PU.date)}</span></label>`;
      $('#cdw').onchange = (e) => { S.cd = +e.target.value; recomputeCleared(); refresh(false); colorAll(); }; return;
    }
    if (S.mode === 'qcr') {
      const rows = listScope(); let a = 0, b = 0; for (const s of rows) { const q = ssQcr(s.ss); if (q) { a += q[0]; b += q[1]; } }
      el.innerHTML = `<label style="grid-column:1/3"><span class="meta">QCR sheets in this selection: <b>${b}/${a}</b> checked (${a ? Math.round(100 * b / a) : 0}%). Elements show the sheets of their own line / equipment; test packs & E&I sheets count on the subsystem.</span></label>`; return;
    }
    if (S.mode === 'ready') {
      const cnt = {}; for (const s of filtered()) { const r = ssReadiness(s); cnt[r] = (cnt[r] || 0) + 1; }
      el.innerHTML = `<label style="grid-column:1/3"><span class="meta">${S.f.sprint ? `<b>${esc(S.f.sprint)}</b>: ` : 'Tip: pick a <b>Sprint</b> above. '}${['MC+', 'ready', 'minor', 'blocked'].map((k) => `${k} <b>${cnt[k] || 0}</b>`).join(' · ')} subsystems</span></label>`; return;
    }
    if (!PU.ready) return;
    const scope = new Set(listScope().map((s) => s.ss)); const open = PU.all.filter((p) => p.o && scope.has(p.ss));
    const opt = (k, key, lab) => { const cnt = {}; for (const p of open) if ((k !== 'cls' || true) && p[key]) cnt[p[key]] = (cnt[p[key]] || 0) + 1;
      return `<label>${lab}<select data-pf="${k}"><option value="">all</option>${Object.keys(cnt).sort().map((v) => `<option ${v === S.pf[k] ? 'selected' : ''} value="${esc(v)}">${esc(v)} (${cnt[v]})</option>`).join('')}</select></label>`; };
    el.innerHTML = opt('cls', 's', 'Punch severity') + opt('by', 'by', 'Action by') + opt('di', 'di', 'Discipline') +
      `<label>&nbsp;<span class="meta" style="padding-top:5px">${open.length} open · ${PU.all.filter((p) => !p.o && scope.has(p.ss)).length} cleared ≤35 d · Co-Consol ${esc(PU.date)} <button class="btn" id="ctrl">Links per contractor</button></span></label>`;
    el.querySelectorAll('select').forEach((x) => (x.onchange = () => { S.pf[x.dataset.pf] = x.value; recomputePunch(); refresh(true); colorAll(); }));
    $('#ctrl').onclick = () => {
      const by = {}; for (const p of open) { const c = (by[p.by || '–'] ||= { A: 0, B: 0, C: 0 }); c[p.s]++; }
      const base = new URL(location.href); ['pby', 'sel', 'cam', 'sub'].forEach((k) => base.searchParams.delete(k)); base.searchParams.set('mode', 'punch');
      const rows = Object.entries(by).sort((a, b) => (b[1].A - a[1].A) || (b[1].B - a[1].B));
      $('#info').style.display = 'block';
      $('#info').innerHTML = `<h2>Open punches per contractor <a href="#" id="infox" style="float:right">✕</a></h2><div class="meta">Each link opens this selection filtered to that contractor, punches in 3D. Send it as-is.</div>
        <table class="ct">${rows.map(([k, c]) => { const u = new URL(base); u.searchParams.set('pby', k); return `<tr><td><b>${esc(k)}</b></td><td>${pBadges(c)}</td><td><button class="btn" data-u="${esc(u.toString())}">Copy link</button></td></tr>`; }).join('')}</table>`;
      $('#infox').onclick = (e) => { e.preventDefault(); $('#info').style.display = 'none'; };
      $('#info').querySelectorAll('[data-u]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.u); b.textContent = 'Copied ✓'; } catch { prompt('Copy:', b.dataset.u); } }));
    };
  }

  // ------------------------------------------------------------------ overview tiles (no models)
  function renderTiles() {
    const rows = Object.entries(index.areas).filter(([a, v]) => v.subsystems > 0 && /^\d\d[A-Z]$/.test(a)).sort();
    $('#tiles').innerHTML = rows.map(([a, v]) => {
      const n = v.subsystems, ph = v.phase || {}; const pct = n ? Math.round(100 * v.in_model / n) : 0;
      const seg = ['mc', 'pcx', 'ccx', 'hcx'].map((k) => `<i style="width:${100 * (ph[k] || 0) / n}%;background:${rgb(C[k])}"></i>`).join('');
      const can = v.docs.length > 0;
      return `<div class="tile ${can ? '' : 'none'}" data-a="${a}" title="${can ? 'Open ' + a : 'No mapped models for this area'}">
        <h3>${a} ${S.open.has(a) ? '<small style="color:var(--accent)">● loaded</small>' : ''}</h3>
        <div class="k"><span>${n} subsystems</span><span>${v.docs.length} models</span></div>
        <div class="k"><span title="Share of this area's subsystems with at least one element found in the 3D model">linked to model ${pct}%</span><span title="Subsystems with an actual MC date or later phase">${n - (ph.none || 0)} MC or beyond</span></div>
        <div class="ph4" title="MC / Pre-Cx / Cold Cx / Hot Cx">${seg}</div></div>`;
    }).join('');
  }
  // tile click = show only that area; several areas at once = the Areas menu (tick boxes)
  $('#tiles').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t && !t.classList.contains('none')) setAreas([t.dataset.a]); });
  function showOverview(on) {
    $('#ovhint').innerHTML = 'Pick an area below, or tick several in the <b>Areas</b> menu above.';
    $('#overview').style.display = on ? 'flex' : 'none'; $('#work').style.display = on ? 'none' : 'flex'; if (on) renderTiles();
  }
  // ---------------------------------------------------------------- Areas menu: tick boxes, like the ACC model browser
  const pickable = () => Object.entries(index.areas).filter(([a, v]) => /^\d\d[A-Z]$/.test(a) && v.subsystems > 0).sort();
  let pick = new Set();
  function renderAreaMenu() {
    const q = ($('#areaq').value || '').trim().toUpperCase();
    $('#alist').innerHTML = pickable().filter(([a, v]) => !q || a.includes(q)).map(([a, v]) => {
      const can = (v.docs || []).length > 0, pct = v.subsystems ? Math.round(100 * v.in_model / v.subsystems) : 0;
      return `<label class="arow ${can ? '' : 'none'}" title="${can ? '' : 'No mapped models for this area'}"><input type="checkbox" data-a="${a}" ${pick.has(a) ? 'checked' : ''} ${can ? '' : 'disabled'}>
        <b>${a}</b><span class="meta">${v.subsystems} subsystems · ${(v.docs || []).length} models · ${pct}% linked</span>${can ? `<button class="only" data-only="${a}" title="Show only ${a}">only</button>` : ''}</label>`;
    }).join('');
    const nm = [...pick].reduce((n, a) => n + (index.areas[a]?.docs || []).length, 0);
    $('#acount').textContent = pick.size ? `${pick.size} area${pick.size > 1 ? 's' : ''} · ${nm} models${nm > 90 ? ' · large, loading takes a while' : ''}` : 'Nothing selected';
    $('#aapply').disabled = !pick.size;
  }
  function openAreaMenu(on) {
    const m = $('#areamenu'); if (on === undefined) on = !m.classList.contains('show');
    if (on) { pick = new Set(S.open); $('#areaq').value = ''; renderAreaMenu(); }
    m.classList.toggle('show', on); if (on) setTimeout(() => $('#areaq').focus(), 0);
  }
  $('#areabtn').onclick = (e) => { e.stopPropagation(); openAreaMenu(); };
  $('#areamenu').addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => openAreaMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openAreaMenu(false); });
  $('#areaq').oninput = renderAreaMenu;
  $('#areaq').onkeydown = (e) => { if (e.key === 'Enter' && pick.size) { openAreaMenu(false); setAreas([...pick]); } };
  $('#alist').addEventListener('change', (e) => { const c = e.target.closest('input[data-a]'); if (!c) return; c.checked ? pick.add(c.dataset.a) : pick.delete(c.dataset.a); renderAreaMenu(); });
  $('#alist').addEventListener('click', (e) => { const o = e.target.closest('[data-only]'); if (!o) return; e.preventDefault(); openAreaMenu(false); setAreas([o.dataset.only]); });
  $('#aall').onclick = () => { $$('#alist input[data-a]:not(:disabled)').forEach((c) => pick.add(c.dataset.a)); renderAreaMenu(); };
  $('#anone').onclick = () => { pick.clear(); renderAreaMenu(); };
  $('#aapply').onclick = () => { openAreaMenu(false); setAreas([...pick]); };
  $('#home').onclick = () => showOverview($('#overview').style.display === 'none');

  // ------------------------------------------------------------------ filters + list
  const listScope = () => subsystems.filter((s) => S.sub.size ? S.sub.has(s.ss) : (S.area ? s.area === S.area : S.open.has(s.area)));
  const FKEY = { prio: (s) => s.prio, sprint: (s) => s.sprints || [], typ: (s) => s.typ, fluid: (s) => s.fluid, phase: (s) => PHASE_TXT[s.phase], area: (s) => s.area, link: (s) => s.link || '?' };
  const has = (s, k, v) => { const x = FKEY[k](s); return Array.isArray(x) ? x.includes(v) : x === v; };
  function filtered(except) {
    const q = S.q.trim().toLowerCase();
    return listScope().filter((s) => Object.entries(S.f).every(([k, v]) => !v || k === except || has(s, k, v)) && (!S.inm || inModel(s)) &&
      (!q || [s.ss, s.tag, s.desc, ...linesOf(s).map((l) => l.line)].join(' ').toLowerCase().includes(q)) &&
      (S.mode !== 'punch' || !pFilterOn() || !!ssOpen[s.ss]));
  }
  function renderFacets() {
    for (const k of Object.keys(S.f)) {
      const cnt = {}; for (const s of filtered(k)) { let x = FKEY[k](s); for (const v of Array.isArray(x) ? x : [x]) if (v) cnt[v] = (cnt[v] || 0) + 1; }
      if (S.f[k] && !cnt[S.f[k]]) cnt[S.f[k]] = 0;
      const el = $('#f_' + k);
      el.innerHTML = `<option value="">all</option>` + Object.keys(cnt).sort().map((v) => `<option value="${esc(v)}" ${v === S.f[k] ? 'selected' : ''}>${esc(k === 'fluid' && legend[v] ? v + ' – ' + legend[v] : v)} (${cnt[v]})</option>`).join('');
      el.classList.toggle('set', !!S.f[k]);
    }
  }
  function renderAreaSelect() {
    const l = [...S.open].sort();
    $('#arealbl').textContent = !l.length ? 'Choose areas' : l.length === 1 ? `Area ${l[0]}` : l.length <= 4 ? `Areas ${l.join(', ')}` : `${l.length} areas`;
    $('#areabtn').title = l.length ? 'Shown: ' + l.join(', ') : 'Choose which areas to show';
  }
  function renderLegend() { const L = MODES[S.mode].legend; $('#legend').innerHTML = (typeof L === 'function' ? L() : L).map(([n, c]) => `<span style="--c:${rgb(c)}">${esc(n)}</span>`).join(''); }
  const collapsed = new Set();
  function renderList() {
    const rows = filtered().sort((x, y) => (x.area || '').localeCompare(y.area || '') || (x.tag || '').localeCompare(y.tag || ''));
    const M = MODES[S.mode];
    $('#counts').textContent = `${rows.length} subsystems · ${rows.filter((s) => inModel(s)).length} linked to model · ${rows.filter((s) => s.phase !== 'none').length} MC or beyond · ${PU.ready ? (() => { const c = { A: 0, B: 0, C: 0 }; for (const s of rows) { const x = pCount(PU.bySs[s.ss] || []); c.A += x.A; c.B += x.B; c.C += x.C; } return `open punches A ${c.A} · B ${c.B} · C ${c.C}`; })() : rows.reduce((a, s) => a + (s.punch_a_open || 0), 0) + ' Punch-A open'}`;
    const item = (s) => { const c = M.color({ ss: new Set([s.ss]), line: linesOf(s)[0]?.line }) || C.grey;
      return `<div class="ss ${inModel(s) === false ? 'dim' : ''} ${S.sel === s.ss ? 'sel' : ''}" data-ss="${s.ss}"><div class="dot" style="background:${rgb(c)}"></div>
        <div><div class="t">${esc(s.tag || s.ss)}</div><div class="d">${s.ss} · ${esc(s.desc || '')}${s.sprints?.length ? ' · ' + esc(s.sprints[0]) : ''}</div></div>
        <div class="v"><b>${M.value(s)}</b><br>${s.punch_a_open ? s.punch_a_open + ' A' : ''}${s.punch_b_open ? ' · ' + s.punch_b_open + ' B' : ''}</div></div>`; };
    if (!S.group) { $('#list').innerHTML = rows.slice(0, 1500).map(item).join(''); return; }
    const groups = {};
    for (const s of rows) { let k = FKEY[S.group](s); for (const v of (Array.isArray(k) ? (k.length ? k : ['–']) : [k || '–'])) (groups[v] ||= []).push(s); }
    $('#list').innerHTML = Object.keys(groups).sort().map((g) => {
      const arr = groups[g], past = arr.filter((s) => s.phase !== 'none').length, open = !collapsed.has(g), on = S.gsel === g;
      const label = S.group === 'fluid' && legend[g] ? `${g} – ${legend[g]}` : g;
      return `<div class="grp ${on ? 'on' : ''}" data-g="${esc(g)}"><span>${open ? '▾' : '▸'}</span><div><b>${esc(label)}</b><div class="bar"><i style="width:${100 * past / arr.length}%"></i></div></div>
        <span class="n">${arr.length} · ${past} past MC <button class="btn" data-iso="${esc(g)}" title="Show only this group in 3D">${on ? '✕' : '3D'}</button></span></div>` + (open ? arr.map(item).join('') : '');
    }).join('');
  }
  $('#list').addEventListener('click', (e) => {
    const iso = e.target.closest('[data-iso]'); if (iso) { S.gsel = S.gsel === iso.dataset.iso ? null : iso.dataset.iso; S.sel = null; refresh(true); return; }
    const g = e.target.closest('.grp'); if (g) { collapsed.has(g.dataset.g) ? collapsed.delete(g.dataset.g) : collapsed.add(g.dataset.g); renderList(); return; }
    const el = e.target.closest('.ss'); if (el) selectSubsystem(el.dataset.ss);
  });
  for (const k of Object.keys(S.f)) $('#f_' + k).addEventListener('change', (e) => { S.f[k] = e.target.value; S.gsel = null; refresh(true); });
  $('#group').value = S.group; $('#group').onchange = (e) => { S.group = e.target.value; S.gsel = null; collapsed.clear(); refresh(false); };
  $('#q').value = S.q; $('#q').addEventListener('input', (e) => { S.q = e.target.value; refresh(true); });
  $('#inm').checked = S.inm; $('#inm').onchange = (e) => { S.inm = e.target.checked; refresh(false); };
  $('#lbl').checked = S.lbl; $('#lbl').onchange = (e) => { S.lbl = e.target.checked; pushUrl(); updateLabels(); };
  $('#ctx').checked = S.ctx; $('#ctx').onchange = (e) => { S.ctx = e.target.checked; pushUrl(); syncContext(); };
  $('#pins').checked = S.pins; $('#pins').onchange = (e) => { S.pins = e.target.checked; pushUrl(); updatePins(); };
  $('#hov').checked = S.hov; $('#hov').onchange = (e) => { S.hov = e.target.checked; pushUrl(); if (!S.hov) card.style.display = 'none'; };
  $('#alb').checked = S.alb; $('#alb').onchange = (e) => { S.alb = e.target.checked; pushUrl(); updateAreaLabels(); };
  $('#ei').checked = S.ei; $('#ei').onchange = (e) => { S.ei = e.target.checked; pushUrl(); syncEI(); };
  $('#clear').onclick = () => { for (const k in S.f) S.f[k] = ''; S.q = ''; $('#q').value = ''; S.sel = null; S.gsel = null; S.inm = false; $('#inm').checked = false; $('#info').style.display = 'none'; refresh(true); };
  $$('.modes .btn').forEach((b) => { b.classList.toggle('on', b.dataset.mode === S.mode); b.onclick = () => { $$('.modes .btn').forEach((x) => x.classList.toggle('on', x === b)); S.mode = b.dataset.mode; refresh(false); colorAll(); updatePins(); }; });
  if (S.sub.size) {
    $('#pbi').style.display = 'flex'; $('#pbi span').textContent = `Shared selection: ${S.sub.size} subsystem${S.sub.size > 1 ? 's' : ''}`;
    $('#pbi .btn').onclick = () => { S.sub.clear(); $('#pbi').style.display = 'none'; refresh(true); };
  }
  function refresh(model) { renderAreaSelect(); renderFacets(); renderPunchFacets(); renderLegend(); renderList(); pushUrl(); if (model) applyFilterToModel(); updatePins(); }

  // ------------------------------------------------------------------ viewer
  const getToken = async (cb) => { const t = await A.token(); if (!t) return A.login(); cb(t.access, Math.floor((t.exp - Date.now()) / 1000)); };
  await new Promise((res) => Autodesk.Viewing.Initializer({ env: 'AutodeskProduction2', api: CFG.viewerApi, getAccessToken: getToken }, res));
  // Navigation = Autodesk's construction (AEC) profile, the defaults ACC/Forma uses for construction models:
  // zoom direction, orbit style and pivot behaviour match what the project team is used to. Visual settings stay ours (speed).
  const P_AEC = Autodesk.Viewing.ProfileSettings?.AEC, P_DEF = Autodesk.Viewing.ProfileSettings?.Default;
  const profileSettings = P_AEC ? { ...P_AEC, settings: { ...P_AEC.settings, edgeRendering: false, envMapBackground: false, ambientShadows: false, groundShadow: false, groundReflection: false },
    extensions: { load: [], unload: [] } } : undefined;
  const viewer = new Autodesk.Viewing.GuiViewer3D($('#fv'), { extensions: [], ...(profileSettings ? { profileSettings } : {}) });
  const NAV_KEYS = ['reverseMouseZoomDir', 'reverseHorizontalLookDirection', 'reverseVerticalLookDirection', 'fusionOrbit', 'fusionOrbitConstrained',
    'orbitPastWorldPoles', 'zoomTowardsPivot', 'wheelSetsPivot', 'clickToSetCOI', 'leftHandedMouseSetup', 'alwaysUsePivot'];
  function applyFormaNavigation() {             // enforce: overrides anything a user flipped earlier in this browser
    for (const k of NAV_KEYS) { const v = P_AEC?.settings?.[k] ?? P_DEF?.settings?.[k]; if (v !== undefined) try { viewer.prefs.set(k, v); } catch (e) {} }
  }
  viewer.start(); viewer.setTheme('dark-theme'); viewer.setGhosting(true); viewer.setGroundShadow(false); viewer.setLightPreset(1);
  viewer.setQualityLevel(false, true);            // no ambient occlusion (expensive on big plant models), keep anti-aliasing
  viewer.setOptimizeNavigation(true);             // lighter rendering while orbiting/zooming
  // Orbit the way Revit / Navisworks / ACC do it: the model follows the mouse (turntable).
  // CX_CONFIG.orbitSign = -1 flips it if a team prefers the other convention.
  const BUSY_EXT = ['Autodesk.Section', 'Autodesk.Measure', 'Autodesk.Viewing.MarkupsCore', 'Autodesk.BoxSelection', 'Autodesk.Explode', 'Autodesk.BimWalk'];
  function ownsOrbit() {
    const tc = viewer.toolController;
    const nav = tc.getActiveToolName ? tc.getActiveToolName() : '';
    if (nav && !/orbit/i.test(nav)) return false;                            // pan, zoom, walk, fly … belong to the viewer
    for (const id of BUSY_EXT) { const x = viewer.getExtension && viewer.getExtension(id); if (x && x.isActive && x.isActive()) return false; }
    const act = (tc.getActiveTools ? tc.getActiveTools() : []).map((t) => (t.getName ? t.getName() : '') || '');
    return !act.some((n) => /measure|calibrat|section|markup|box-?select|gizmo/i.test(n));
  }
  const shiftOrbit = {
    names: ['cx-shift-orbit'], getNames() { return this.names; }, getName() { return this.names[0]; }, getPriority() { return 1000; },
    activate() {}, deactivate() {}, drag: false,
    // left drag (and Shift + left / Shift + middle) = turntable orbit: left/right turns the plant around the vertical axis,
    // up/down tilts it. No roll, never upside down. A click without movement still selects.
    handleButtonDown(e, button) { if (!ownsOrbit()) return false; if (button === 0 || (e.shiftKey && button === 1)) { this.drag = true; this.moved = false; this.x = this.x0 = e.canvasX; this.y = this.y0 = e.canvasY; return true; } return false; },
    handleButtonUp() { if (this.drag) { this.drag = false; return this.moved; } return false; },
    handleMouseMove(e) {
      if (!this.drag) return false;
      if (!this.moved) { if (Math.abs(e.canvasX - this.x0) + Math.abs(e.canvasY - this.y0) < 4) return true; this.moved = true; }
      const dx = e.canvasX - this.x, dy = e.canvasY - this.y; this.x = e.canvasX; this.y = e.canvasY;
      const k = 0.006 * (CFG.orbitSign || 1), nav = viewer.navigation, up = new THREE.Vector3(0, 0, 1);
      const piv = nav.getPivotPoint(), eye = nav.getPosition().clone(), tgt = nav.getTarget().clone();
      const rot = (v, axis, ang) => v.sub(piv).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, ang)).add(piv);
      rot(eye, up, -dx * k); rot(tgt, up, -dx * k);                                       // turn around the vertical
      const dir = tgt.clone().sub(eye).normalize(), right = dir.clone().cross(up).normalize();
      const e2 = rot(eye.clone(), right, -dy * k), t2 = rot(tgt.clone(), right, -dy * k);   // tilt around the screen horizontal
      const d2 = t2.clone().sub(e2).normalize();
      const ok = Math.abs(d2.dot(up)) < 0.995;                                            // never flip over the top
      nav.setView(ok ? e2 : eye, ok ? t2 : tgt); nav.setCameraUpVector(up);
      return true;
    },
    handleButtonDoubleClick() { return false; }, handleSingleClick() { return false; }, handleWheelInput() { return false; },
    handleKeyDown() { return false; }, handleKeyUp() { return false; }, handleGesture() { return false; }, handleBlur() { return false; }, handleResize() {},
  };
  try { viewer.toolController.registerTool(shiftOrbit); viewer.toolController.activateTool('cx-shift-orbit'); } catch (e) { console.warn('shift orbit', e); }
  // plant models are Z-up: tell the navigation and the ViewCube, so the cube reads TOP when looking down
  function zUp() {
    try {
      const up = new THREE.Vector3(0, 0, 1);
      viewer.navigation.setWorldUpVector(up, false, true);
      if (viewer.autocam && viewer.autocam.setWorldUpVector) viewer.autocam.setWorldUpVector(up.clone());
    } catch (e) { console.warn('[cx] world up', e); }
  }
  zUp();
  applyFormaNavigation(); console.info('[cx] navigation profile', P_AEC ? 'AEC' : 'default', NAV_KEYS.map((k) => k + '=' + viewer.prefs?.get?.(k)).join(' '));
  viewer.setGroundReflection(false); viewer.setEnvMapBackground(false);
  window.viewer = viewer;
  $('#toggle').onclick = () => { $('#app').classList.toggle('collapsed'); viewer.resize(); };

  const models = {}, idx = {}, ctxModels = {};       // docKey -> model ; docKey -> Map(currentDbId -> {ss,line}) ; context
  let globalOffset = null, nLoaded = 0, nWanted = 0, failed = 0;
  const latestCache = {};
  const latest = (u) => (latestCache[u] ||= CFG.latestVersions ? A.latestUrn(u) : Promise.resolve(u));
  function loadDoc(docKey, name, isCtx, needProps) {
    return new Promise(async (res) => {
      const urn = await latest(docKey);
      const done = () => { nLoaded++; status(`loaded ${nLoaded}/${nWanted}${failed ? ` (${failed} not accessible)` : ''}  ${name}`); res(); };
      Autodesk.Viewing.Document.load('urn:' + urn, async (doc) => {
        const g = doc.getRoot().search({ type: 'geometry', role: '3d' })[0]; if (!g) { done(); return; }
        const opts = { keepCurrentModels: true, applyRefPoint: true, preserveView: true }; if (globalOffset) opts.globalOffset = globalOffset;
        // the property database is only needed to re-map a newer model version or for E&I handles; skipping it saves a lot of load time
        if (CFG.fastLoad && !needProps && urn === docKey) opts.skipPropertyDb = true;   // fastLoad: no Properties panel / Model Browser
        try {
          const m = await viewer.loadDocumentNode(doc, g, opts); if (!globalOffset) globalOffset = m.getData().globalOffset; m._cxName = name; m._cxKey = docKey;
          zUp();
          if (isCtx) { ctxModels[docKey] = m; ghostModel(m); }
          else { models[docKey] = m; idx[docKey] = urn === docKey ? rawIdx[docKey] || new Map() : await remap(docKey, m); }
        } catch (e) { failed++; console.warn('load failed', name, e); }
        done();
      }, () => { if (urn !== docKey) { console.warn('latest version not viewable, using mapped version', name); } failed++; done(); });
    });
  }
  // context (architecture / structure): shown as the viewer's own ghost (see-through, not clickable).
  // Ghosting needs the object tree, so context models load with their property database;
  // if a tree is not available, a transparent material on every fragment is the fallback.
  const ghostMats = {};
  function ghostMaterial(m) {
    const otg = !!(m.isOTG && m.isOTG()), k = otg ? 'otg' : 'svf';
    if (!ghostMats[k]) {
      const mat = new THREE.MeshPhongMaterial({ color: 0xaab4bf, opacity: 0.12, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      if (otg) mat.packedNormals = true;
      viewer.impl.matman().addMaterial('cx-context-ghost-' + k, mat, true); ghostMats[k] = mat;
    }
    const apply = () => { const fl = m.getFragmentList(); if (!fl) return; const n = fl.getCount ? fl.getCount() : 0;
      for (let f = 0; f < n; f++) fl.setMaterial(f, ghostMats[k]);
      viewer.impl.invalidate(true, true, true); };
    apply();
    if (!(m.isLoadDone && m.isLoadDone())) {
      const h = (e) => { if (e.model === m) { viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, h); apply(); } };
      viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, h);
    }
  }
  function ghostModel(m) {
    let done = false; const fallback = () => { if (!done) { done = true; console.info('[cx] context ghost via material', m._cxName); ghostMaterial(m); } };
    const t = setTimeout(fallback, 60000);
    if (!m.getObjectTree) { clearTimeout(t); fallback(); return; }
    m.getObjectTree((tree) => { if (done) return; done = true; clearTimeout(t);
      viewer.hide(tree.getRootId(), m); viewer.impl.invalidate(true, true, true); }, () => { clearTimeout(t); fallback(); });
  }
  // newer model version: translate mapped dbIds through the DWG handles (externalId)
  async function remap(docKey, m) {
    const raw = rawIdx[docKey] || new Map(); const ext = areaData[docArea[docKey]]?.ext?.[docKey] || {};
    const e2id = await new Promise((r) => m.getExternalIdMapping(r, () => r({})));
    const out = new Map(); for (const [id, o] of raw) { const nid = e2id[ext[id]]; if (nid) out.set(nid, o); }
    return out;
  }
  async function loadDocs(list, isCtx, needProps) {
    list = list.filter((d) => !(isCtx ? ctxModels : models)[d.urn]); if (!list.length) return;
    nWanted += list.length; const q = [...list]; const t0 = performance.now();
    list.forEach((d) => latest(d.urn));                                   // resolve newest versions for all models at once
    while (q.length && !globalOffset) { const d = q.shift(); await loadDoc(d.urn, d.name, isCtx, needProps); }
    await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const d = q.shift(); await loadDoc(d.urn, d.name, isCtx, needProps); } }));
    console.info(`[cx] ${list.length} models in ${Math.round(performance.now() - t0) / 1000} s`);
    updateAreaLabels(); renderViews(); renderMap();
    status(`${Object.keys(models).length} models${Object.keys(ctxModels).length ? ` + ${Object.keys(ctxModels).length} context` : ''} · data ${meta.subsystem_data_date || ''}${failed ? ` · ${failed} not accessible` : ''}`);
  }
  // show only area a: unload models of all other areas (their data stays cached, so switching back is fast)
  function unloadOtherAreas(a) {
    const keep = new Set((index.areas[a]?.docs || []).map((d) => d.urn));
    for (const [k, m] of Object.entries(models)) if (!keep.has(k)) { viewer.unloadModel(m); delete models[k]; delete idx[k]; delete eiModels[k]; }
    const ctxKeep = new Set((CFG.contextAreas[a] || [a]).flatMap((x) => (index.areas[x]?.context || []).map((d) => d.urn)));
    for (const [k, m] of Object.entries(ctxModels)) if (!ctxKeep.has(k)) { viewer.unloadModel(m); delete ctxModels[k]; }
    S.open = new Set([a]); S.sub.clear(); S.sel = null; $('#info').style.display = 'none';
    nLoaded = 0; nWanted = 0; failed = 0;
  }
  // show exactly these areas: unload the rest, load what is missing, frame them all
  let setBusy = null;
  async function setAreas(list) {
    const T = new Set(list.filter((a) => (index.areas[a]?.docs || []).length)); if (!T.size) return;
    if (setBusy) await setBusy;
    let done; setBusy = new Promise((r) => (done = r));
    try {
      const keep = new Set([...T].flatMap((a) => [...(index.areas[a]?.docs || []), ...(index.areas[a]?.ei || [])].map((d) => d.urn)));
      for (const [k, m] of Object.entries(models)) if (!keep.has(k)) { viewer.unloadModel(m); delete models[k]; delete idx[k]; delete eiModels[k]; }
      const ctxKeep = new Set([...T].flatMap((a) => CFG.contextAreas[a] || [a]).flatMap((x) => (index.areas[x]?.context || []).map((d) => d.urn)));
      for (const [k, m] of Object.entries(ctxModels)) if (!ctxKeep.has(k)) { viewer.unloadModel(m); delete ctxModels[k]; }
      S.open = new Set(T); S.area = T.size === 1 ? [...T][0] : ''; S.sub.clear(); S.sel = null; S.gsel = null; $('#info').style.display = 'none';
      nLoaded = 0; nWanted = 0; failed = 0;
      showOverview(false); status(`loading ${[...T].sort().join(', ')}…`);
      await Promise.all([...T].map(loadAreaData)); refresh(false);
      await loadDocs([...T].flatMap((a) => index.areas[a]?.docs || []), false);
      if (S.ctx) await syncContext();
      if (S.ei) await syncEI();
      colorAll(); fitArea(T.size === 1 ? [...T][0] : null);
    } finally { done(); setBusy = null; }
  }
  async function openArea(a, focus, add = true) {
    if (!add) return setAreas([a]);
    showOverview(false); S.open.add(a); if (focus) { S.area = a; S.gsel = null; }
    status(`loading ${a} mapping…`); await loadAreaData(a); refresh(false);
    await loadDocs(index.areas[a]?.docs || [], false);
    if (S.ctx) await syncContext();
    if (S.ei) await syncEI();
    colorAll(); if (focus && !S.sel) fitArea(a);
  }
  async function syncContext() {
    if (!S.ctx) { for (const [k, m] of Object.entries(ctxModels)) { viewer.unloadModel(m); delete ctxModels[k]; } return; }
    const areas = new Set([...S.open].flatMap((a) => CFG.contextAreas[a] || [a]));
    await loadDocs([...areas].flatMap((a) => index.areas[a]?.context || []), true, true);   // with properties: needed for ghosting
  }

  const eiModels = {};
  async function syncEI() {
    if (!S.ei) { for (const [k, m] of Object.entries(eiModels)) { viewer.unloadModel(m); delete eiModels[k]; delete models[k]; } return; }
    const list = [...S.open].flatMap((a) => index.areas[a]?.ei || []).filter((d) => !models[d.urn]);
    await loadDocs(list, false, true); for (const d of list) if (models[d.urn]) eiModels[d.urn] = models[d.urn];
    colorAll();
  }
  // subsystems whose elements sit in models of other areas: load those models only when the selection needs them
  let extraBusy = false;
  async function ensureExtraModels(keep) {
    if (extraBusy || !index.xlinks) return; const need = new Set();
    for (const ss of keep) for (const u of index.xlinks[ss] || []) if (!models[u]) need.add(u);
    if (!need.size) return;
    if (need.size > 45) { status(`selection also has elements in ${need.size} models of other areas — narrow the filter to load them`); return; }
    extraBusy = true;
    try {
      const areas = [...new Set([...need].map((u) => index.docArea[u]).filter(Boolean))];
      await Promise.all(areas.map(loadAreaData));
      const byUrn = Object.fromEntries(areas.flatMap((a) => (index.areas[a]?.docs || []).map((d) => [d.urn, d])));
      await loadDocs([...need].map((u) => byUrn[u]).filter(Boolean), false);
      colorAll();
    } finally { extraBusy = false; }
  }

  function colorAll() {
    const M = MODES[S.mode];
    const silver = new THREE.Vector4(SILVER[0], SILVER[1], SILVER[2], 1), cache = new Map();
    const v4 = (c) => { let v = cache.get(c); if (!v) cache.set(c, (v = new THREE.Vector4(c[0], c[1], c[2], 1))); return v; };
    for (const [k, m] of Object.entries(models)) {
      viewer.clearThemingColors(m); viewer.setThemingColor(m.getRootId(), silver, m, true);
      for (const [id, o] of idx[k] || []) { const c = M.color(o); if (c) viewer.setThemingColor(id, v4(c), m, true); }
    }
    applyFilterToModel();
  }
  const isFiltering = () => S.sel || S.gsel || S.sub.size || S.q || S.inm || Object.values(S.f).some(Boolean) || (S.area && S.open.size > 1);
  function keepSet() {
    if (S.sel) return new Set([S.sel]);
    let rows = filtered(); if (S.gsel) rows = rows.filter((s) => { const k = FKEY[S.group](s); return Array.isArray(k) ? (k.length ? k.includes(S.gsel) : S.gsel === '–') : (k || '–') === S.gsel; });
    return new Set(rows.map((s) => s.ss));
  }
  function applyFilterToModel() {
    if (!Object.keys(models).length) return;
    if (!isFiltering()) { for (const m of Object.values(models)) viewer.isolate([], m); updateLabels(); return; }
    const keep = keepSet(); const fit = [];
    for (const [k, m] of Object.entries(models)) {
      const ids = []; for (const [id, o] of idx[k] || []) for (const s of o.ss) if (keep.has(s)) { ids.push(id); break; }
      if (ids.length) { viewer.isolate(ids, m); fit.push({ model: m, selection: ids }); } else { viewer.isolate([], m); viewer.hide(m.getRootId(), m); }
    }
    if (fit.length && (S.sel || S.gsel || S.sub.size)) viewer.fitToView(fit);
    updateLabels(); updatePins();
    if (S.sel || S.gsel || S.sub.size || Object.values(S.f).some(Boolean) || S.q) ensureExtraModels(keep);
  }
  function selectSubsystem(ss) {
    S.sel = S.sel === ss ? null : ss; renderList(); pushUrl(); applyFilterToModel();
    if (S.sel) showInfo(SS[S.sel]); else $('#info').style.display = 'none';
  }

  // ------------------------------------------------------------------ camera in links (global coordinates, independent of which model loaded first)
  const off = () => globalOffset || { x: 0, y: 0, z: 0 };
  function camToStr() {
    if (!Object.keys(models).length) return '';
    const n = viewer.navigation, o = off(), r = (v) => Math.round(v * 100) / 100;
    const e = n.getPosition(), t = n.getTarget(), u = n.getCameraUpVector();
    return [e.x + o.x, e.y + o.y, e.z + o.z, t.x + o.x, t.y + o.y, t.z + o.z, u.x, u.y, u.z].map(r).join(',');
  }
  function applyCam(str) {
    const v = String(str).split(',').map(Number); if (v.length !== 9 || v.some(isNaN)) return false; const o = off();
    viewer.navigation.setView(new THREE.Vector3(v[0] - o.x, v[1] - o.y, v[2] - o.z), new THREE.Vector3(v[3] - o.x, v[4] - o.y, v[5] - o.z));
    viewer.navigation.setCameraUpVector(new THREE.Vector3(v[6], v[7], v[8])); return true;
  }
  // robust extent of an area: 2nd–98th percentile of fragment centres (stray objects far away are ignored)
  const pctl = (arr, q) => { const t = [...arr].sort((a, b) => a - b); return t[Math.max(0, Math.min(t.length - 1, Math.floor(q * (t.length - 1))))]; };
  function areaBox(a) {
    const xs = [], ys = [], zs = [], bb = new THREE.Box3();
    for (const m of Object.values(models)) {
      if (a && docAreaOf(m) !== a) continue;
      const fl = m.getFragmentList(); const n = fl.getCount(); const step = Math.max(1, Math.floor(n / 5000));
      for (let f = 0; f < n; f += step) { fl.getWorldBounds(f, bb); if (bb.isEmpty()) continue; xs.push((bb.min.x + bb.max.x) / 2); ys.push((bb.min.y + bb.max.y) / 2); zs.push((bb.min.z + bb.max.z) / 2); }
    }
    if (!xs.length) return null;
    return new THREE.Box3(new THREE.Vector3(pctl(xs, 0.02), pctl(ys, 0.02), pctl(zs, 0.02)), new THREE.Vector3(pctl(xs, 0.98), pctl(ys, 0.98), pctl(zs, 0.98)));
  }
  function fitArea(a, mode = 'iso') {
    const b = areaBox(a); if (!b) return viewer.fitToView();
    const c = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 20);
    const dir = mode === 'top' ? new THREE.Vector3(0, -0.001, 1) : new THREE.Vector3(-1, -1, 0.9);   // iso = from south-west, above
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z), d = r * 1.1;
    viewer.navigation.toPerspective();
    viewer.navigation.setView(new THREE.Vector3(c.x + dir.x / len * d, c.y + dir.y / len * d, c.z + dir.z / len * d), c);
    viewer.navigation.setCameraUpVector(new THREE.Vector3(0, 0, 1));
    viewer.navigation.setPivotPoint(c);
    viewer.navigation.fitBounds(false, b);
  }
  // named viewpoints: views.json in the ACC data folder (from the "Views" sheet of Cx manual links.xlsx)
  let views = [];
  A.readDataFile('views.json').then((v) => { views = v || []; renderViews(); }).catch(() => {});
  // ---------------------------------------------------------------- documents in ACC (docs.json: tag / line / P&ID -> files with ACC links)
  const DOCS = { ready: false, byTag: {}, byLine: {}, byPid: {} };
  A.readDataFile('docs.json').then((d) => { if (d) { Object.assign(DOCS, d, { ready: true }); if (S.sel && SS[S.sel]) showInfo(SS[S.sel]); } }).catch(() => {});
  const KIND_TXT = { vendor: 'Vendor', pid: 'P&ID', iso: 'Isometric', mech: 'Mechanical', ei: 'E&I', csa: 'CSA', other: 'Other' };
  // documents of a subsystem (+ the clicked element's line): equipment tag, P&ID, lines
  function docsFor(s, o) {
    if (!DOCS.ready) return [];
    const out = [], seen = new Set(), add = (list, via) => { for (const d of list || []) if (!seen.has(d.u)) { seen.add(d.u); out.push({ ...d, via }); } };
    const eq = s && ssEq[s.ss]; if (eq) add(DOCS.byTag[eq], eq);
    if (o?.line) add(DOCS.byLine[o.line], o.line);
    if (s?.pid) for (const [k, v] of Object.entries(DOCS.byPid)) if (String(s.pid).includes(k) || k.includes(String(s.pid))) add(v, k);
    if (s) for (const l of linesOf(s).slice(0, 30)) add(DOCS.byLine[l.line], l.line);
    return out;
  }
  function docRows(list, max = 40) {
    const groups = {}; for (const d of list) (groups[d.k] ||= []).push(d);
    const order = ['pid', 'vendor', 'mech', 'iso', 'ei', 'csa', 'other'];
    return order.filter((k) => groups[k]).map((k) => `<div class="meta" style="margin-top:6px"><b>${KIND_TXT[k]}</b> · ${groups[k].length}</div>` +
      groups[k].slice(0, max).map((d) => `<div class="pr"><span class="pb pb0">${esc(d.d ? d.d.slice(0, 7) : '')}</span><div><a href="${d.u}" target="_blank" rel="noopener">${esc(d.n)}</a> <span class="meta">${esc(d.f)}</span></div></div>`).join('') +
      (groups[k].length > max ? `<div class="meta">… +${groups[k].length - max} more</div>` : '')).join('');
  }
  function renderViews() {
    const el = $('#views'); if (!el) return;
    const areaViews = [...S.open].sort().flatMap((a) => [{ name: `Area ${a} – 3D overview`, area: a, mode: 'iso' }, { name: `Area ${a} – top view`, area: a, mode: 'top' }]);
    const list = [...areaViews, ...views.filter((v) => !v.area || S.open.has(v.area) || true)];
    el.innerHTML = `<option value="">Viewpoints…</option>` + list.map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join('');
    el.onchange = async () => {
      const v = list[+el.value]; el.value = ''; if (!v) return;
      if (v.cam) { if (v.area && !S.open.has(v.area)) await openArea(v.area, true, false); applyCam(v.cam); }
      else if (v.area) { if (!S.open.has(v.area)) await openArea(v.area, true, false); fitArea(v.area, v.mode || 'iso'); }
    };
  }
  const docAreaOf = (m) => docArea[m._cxKey] || index.docArea?.[m._cxKey] || Object.keys(index.areas).find((a) => (index.areas[a].docs || []).some((d) => d.urn === m._cxKey) || (index.areas[a].ei || []).some((d) => d.urn === m._cxKey));

  // ------------------------------------------------------------------ site plan minimap (site_plan.jpg/json made by ?harvest=1)
  let plan = null;
  (async () => {
    try {
      const [pj, img] = await Promise.all([A.readDataFile('site_plan.json'), A.readDataBlob('site_plan.jpg')]);
      if (!pj || !img) return; plan = pj; plan.url = URL.createObjectURL(img); renderMap();
    } catch (e) { console.warn('no site plan', e); }
  })();
  const bandCol = (f) => f >= 1 ? C.green : f >= 0.75 ? C.yellow : f >= 0.25 ? C.orange : C.red;
  function renderMap() {
    if (!plan) return; const m = $('#map'); m.style.display = 'block';
    const [x0, y0, x1, y1] = plan.extent, W = plan.size[0], H = plan.size[1], sx = (x) => (x - x0) / (x1 - x0) * W, sy = (y) => (y1 - y) / (y1 - y0) * H;
    const rects = Object.entries(plan.areas).map(([a, v]) => {
      const ia = index.areas[a] || {}; const n = ia.subsystems || 0; const done = n ? (n - (ia.phase?.none || 0)) / n : 0;
      const b = v.box, c = n ? rgb(bandCol(done)) : '#8a94a3', on = S.open.has(a);
      return `<g class="ar" data-a="${a}"><rect x="${sx(b[0])}" y="${sy(b[3])}" width="${sx(b[2]) - sx(b[0])}" height="${sy(b[1]) - sy(b[3])}" fill="${c}" fill-opacity="${on ? 0.12 : 0.28}" stroke="${on ? '#4cc3ff' : c}" stroke-width="${on ? 8 : 4}"/>
        <text x="${(sx(b[0]) + sx(b[2])) / 2}" y="${(sy(b[1]) + sy(b[3])) / 2}" font-size="${Math.max(28, W / 60)}" text-anchor="middle" dominant-baseline="middle" fill="#111" stroke="#fff" stroke-width="6" paint-order="stroke" font-weight="700">${a}${n ? ' ' + Math.round(done * 100) + '%' : ''}</text></g>`;
    }).join('');
    m.innerHTML = `<div class="mh"><b>Site plan</b><span class="meta">colour = % subsystems MC or beyond · click an area to open</span><button class="btn" id="mapx">–</button></div>
      <div class="mb"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><image href="${plan.url}" width="${W}" height="${H}"/>${rects}<circle id="mcam" r="${W / 90}" fill="#4cc3ff" stroke="#fff" stroke-width="4" style="display:none"/></svg></div>`;
    m.querySelectorAll('.ar').forEach((g) => (g.onclick = (ev) => openArea(g.dataset.a, true, ev.shiftKey || ev.ctrlKey)));
    $('#mapx').onclick = () => { m.classList.toggle('min'); $('#mapx').textContent = m.classList.contains('min') ? '+' : '–'; };
    m.classList.toggle('big', !Object.keys(models).length); placeCamOnMap();
    plan._sx = sx; plan._sy = sy;
  }
  function placeCamOnMap() {
    const c = document.getElementById('mcam'); if (!c || !plan?._sx || !Object.keys(models).length) { if (c) c.style.display = 'none'; return; }
    const t = viewer.navigation.getTarget(), o = off(); c.setAttribute('cx', plan._sx(t.x + o.x)); c.setAttribute('cy', plan._sy(t.y + o.y)); c.style.display = '';
  }
  viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, placeCamOnMap);

  // ------------------------------------------------------------------ area labels (big area codes floating above each loaded area)
  let areaPts = [];
  function updateAreaLabels() {
    areaPts = []; if (!S.alb) return placeLabels();
    const boxes = {};
    for (const m of Object.values(models)) {
      const a = docAreaOf(m); if (a && !boxes[a]) boxes[a] = areaBox(a) || null;
    }
    for (const k of Object.keys(boxes)) if (!boxes[k]) delete boxes[k];
    for (const [a, b] of Object.entries(boxes)) areaPts.push({ p: new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z + 3), t: a });
    renderLabelEls();
  }

  // ------------------------------------------------------------------ labels (equipment tags of the current selection)
  let labelPts = [];
  function updateLabels() {
    labelPts = []; if (!S.lbl || !Object.keys(models).length) return renderLabelEls();
    const keep = isFiltering() ? keepSet() : null; const seen = new Set();
    for (const [k, m] of Object.entries(models)) {
      const fl = m.getFragmentList(), it = m.getInstanceTree(); if (!it) continue;
      const bySs = {};                                            // current-version ids per equipment subsystem (tag-matched only)
      for (const [id, o] of idx[k] || []) if (!o.line) for (const ss of o.ss) (bySs[ss] ||= []).length < 50 && bySs[ss].push(id);
      for (const [ss, ids] of Object.entries(bySs)) {
        if (seen.has(ss) || (keep && !keep.has(ss))) continue;
        const s = SS[ss]; if (!s?.eq || !/[A-Z]/.test(s.eq)) continue;
        const box = new THREE.Box3(), fb = new THREE.Box3();
        for (const id of ids) it.enumNodeFragments(id, (f) => { fl.getWorldBounds(f, fb); box.union(fb); }, true);
        if (box.isEmpty()) continue;
        const c = MODES[S.mode].color({ ss: new Set([ss]), line: null }) || C.grey;
        labelPts.push({ p: new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z), t: s.eq, c, ss });
        seen.add(ss); if (labelPts.length >= 120) break;
      }
    }
    renderLabelEls();
  }
  function renderLabelEls() {
    $('#labels').innerHTML = labelPts.map((l) => `<div style="--c:${rgb(l.c)}">${esc(l.t)}</div>`).join('') +
      areaPts.map((l) => `<div class="area">${esc(l.t)}</div>`).join('') +
      pinPts.map((l) => `<div class="pin ${l.cls}" title="${esc(l.k)}">${esc(l.t)}</div>`).join('');
    placeLabels();
  }
  function placeLabels() {
    const els = $('#labels').children;
    [...labelPts, ...areaPts, ...pinPts].forEach((l, i) => { const p = viewer.worldToClient(l.p); const el = els[i]; if (!el) return;
      const vis = p.z < 1 && p.x > 0 && p.y > 0 && p.x < viewer.container.clientWidth && p.y < viewer.container.clientHeight;
      el.style.display = vis ? 'block' : 'none'; if (vis) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; } });
  }
  viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, () => (labelPts.length || areaPts.length || pinPts.length) && placeLabels());

  // ------------------------------------------------------------------ hover card: what is under the mouse, without clicking
  const card = document.createElement('div'); card.id = 'hcard'; $('#viewer').appendChild(card);
  let hovRaf = 0, lastKey = '';
  $('#fv').addEventListener('mousemove', (ev) => {
    if (!S.hov || hovRaf) return;
    hovRaf = requestAnimationFrame(() => {
      hovRaf = 0; const r = viewer.canvas.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const hit = viewer.impl.hitTest(x, y, true);
      const o = hit && hit.model && idx[hit.model._cxKey]?.get(hit.dbId);
      if (!o) { card.style.display = 'none'; lastKey = ''; return; }
      const key = hit.model._cxKey + ':' + hit.dbId;
      if (key !== lastKey) {
        lastKey = key; const s = bestSS(o), l = LN[o.line];
        const ep = elemPunches(o), ec = pCount(ep), sc = s ? pCount(PU.bySs[s.ss] || []) : { A: 0, B: 0, C: 0 };
        const top = ep.filter(pOk).sort((a, b) => a.s.localeCompare(b.s)).slice(0, 3);
        card.innerHTML = `<div class="ht">${esc(o.line ? (l?.iso || o.line) : (s?.tag || '–'))}</div>
          ${s ? `<div class="meta">${s.ss} · ${esc((s.desc || '').slice(0, 48))}</div>
          <div class="hrow"><span class="ph" style="background:${rgb(s.phase === 'none' ? C.grey : C[s.phase])};color:#000">${PHASE_TXT[s.phase]}</span>${s.qcr_pct != null ? `<span class="meta">QCR ${Math.round(s.qcr_pct * 100)}%</span>` : ''}${l ? `<span class="meta">spools ${l.installed}/${l.spools}</span>` : ''}</div>` : ''}
          ${PU.ready ? `<div class="hrow"><span class="meta">here</span>${pBadges(ec)}</div><div class="hrow"><span class="meta">subsystem</span>${pBadges(sc)}</div>
          ${QC.ready && elemQcr(o) ? `<div class="hrow"><span class="meta">QCR here</span><b>${elemQcr(o)[1]}/${elemQcr(o)[0]}</b> checked</div>` : ''}
          ${S.mode === 'ready' ? (() => { const r = readiness(o); return `<div class="hrow"><span class="pb" style="background:${rgb(RDY[r.k])}">${r.k}</span><span class="meta">${esc(r.why.join(' · '))}</span></div>`; })() : ''}
          ${S.mode === 'cleared' && elemCleared(o) ? `<div class="hrow" style="color:#27f273">✓ ${elemCleared(o)} punches cleared in last ${S.cd} days</div>` : ''}
          ${top.map((p) => `<div class="hp"><span class="pb pb${p.s}">${p.s}</span>${esc(p.d.slice(0, 70))} <span class="meta">→ ${esc(p.by || '')}</span></div>`).join('')}` : ''}
          ${DOCS.ready ? (() => { const n = docsFor(s, o).length; return n ? `<div class="hrow"><span class="meta">documents</span><b>${n}</b> in ACC</div>` : ''; })() : ''}
          <div class="meta" style="margin-top:3px">click for details</div>`;
      }
      const vw = $('#viewer').clientWidth; card.style.display = 'block';
      card.style.left = Math.min(ev.clientX - $('#viewer').getBoundingClientRect().left + 16, vw - 300) + 'px';
      card.style.top = (ev.clientY - $('#viewer').getBoundingClientRect().top + 16) + 'px';
    });
  });
  $('#fv').addEventListener('mouseleave', () => (card.style.display = 'none'));

  // ------------------------------------------------------------------ punch pins: floating badges where open A/B punches sit
  let pinPts = [];
  function updatePins() {
    pinPts = [];
    if (!(S.pins && S.mode === 'punch' && PU.ready && Object.keys(models).length)) return renderLabelEls();
    const keep = isFiltering() ? keepSet() : null;
    const groups = {};                                   // key -> {ids per model, punches}
    for (const [k, m] of Object.entries(models)) for (const [id, o] of idx[k] || []) {
      if (keep && ![...o.ss].some((x) => keep.has(x))) continue;
      const w = elemWorst(o); if (!w || w === 'C') continue;
      const gk = o.line || [...o.ss].map((x) => ssEq[x]).find((e) => e && eqWorst[e]); if (!gk) continue;
      const g = (groups[gk] ||= { k: gk, w, parts: new Map(), ps: o.line ? PU.byLine[o.line] : PU.byEq[gk] });
      const arr = g.parts.get(m) || []; if (arr.length < 40) arr.push(id); g.parts.set(m, arr);
    }
    const list = Object.values(groups).map((g) => ({ ...g, c: pCount(g.ps || []) })).sort((a, b) => (b.c.A - a.c.A) || (b.c.B - a.c.B)).slice(0, 150);
    const bb = new THREE.Box3();
    for (const g of list) {
      const box = new THREE.Box3();
      for (const [m, ids] of g.parts) { const fl = m.getFragmentList(), it = m.getInstanceTree(); if (!it) continue; for (const id of ids) it.enumNodeFragments(id, (f) => { fl.getWorldBounds(f, bb); box.union(bb); }, true); }
      if (box.isEmpty()) continue;
      pinPts.push({ p: new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z), t: g.c.A ? `A ${g.c.A}${g.c.B ? ' · B ' + g.c.B : ''}` : `B ${g.c.B}`, cls: g.c.A ? 'pinA' : 'pinB', k: g.k });
    }
    renderLabelEls();
  }

  // ------------------------------------------------------------------ info panel + picking
  function showInfo(s, extra = {}) {
    if (!s) return; const p6 = s.p6 || {}; const ls = linesOf(s);
    const ph = ['mc', 'pcx', 'ccx', 'hcx'].map((k) => `<span class="ph" style="${s.actual?.[k] ? 'background:' + rgb(C[k]) + ';color:#000' : ''}">${k.toUpperCase()} ${s.actual?.[k] || (s.planned?.[k] && s.planned[k] !== 'None' ? 'plan ' + s.planned[k] : '–')}</span>`).join('');
    $('#info').style.display = 'block';
    $('#info').innerHTML = `<h2>${esc(s.tag)} <small style="color:var(--muted)">${s.ss}</small> <a href="#" id="infox" style="float:right">✕</a></h2><div style="margin-bottom:6px">${ph}</div><dl>
      <dt>Description</dt><dd>${esc(s.desc || '')} (${esc(legend[s.fluid] || s.fluid || '')})</dd>
      <dt>Model link</dt><dd>${esc(s.link || '?')}</dd>
      <dt>Area / type / prio</dt><dd>${s.area} · ${esc(s.typ || '')} · ${esc(s.prio || '')}</dd>
      ${s.sprints?.length ? `<dt>Sprint</dt><dd>${esc(s.sprints.join('; '))}</dd>` : ''}
      <dt>QCR</dt><dd>${s.qcr_done ?? 0} / ${s.qcr_total ?? 0} checked${s.qcr_pct != null ? ' (' + Math.round(s.qcr_pct * 100) + '%)' : ''}</dd>
      <dt>Punches open</dt><dd>${PU.ready ? pBadges(pCount(PU.bySs[s.ss] || [])) : `A: ${s.punch_a_open || 0} · B: ${s.punch_b_open || 0}`}</dd>
      <dt>P6</dt><dd>${p6.mc_act ? `MC ${esc(p6.mc_act)} (${p6.mc_date || ''}) · CCx ${esc(p6.ccx_act || '')} (${p6.ccx_date || ''})` : '–'}</dd>
      <dt>P&amp;ID</dt><dd>${esc(s.pid || '–')}</dd>
      ${ls.length ? `<dt>Lines</dt><dd>${ls.slice(0, 12).map((l) => `${l.line} (${l.installed}/${l.spools})`).join(', ')}${ls.length > 12 ? ` … +${ls.length - 12}` : ''}</dd>` : ''}
      ${extra.line ? `<dt>Clicked line</dt><dd>${esc(extra.line.iso)} · ${extra.line.installed}/${extra.line.spools} spools installed · ${extra.line.handed_over} handed over</dd>` : ''}
      ${extra.model ? `<dt>Model</dt><dd>${esc(extra.model)}</dd>` : ''}
      <dt>Source</dt><dd>Subsystems Master ${meta.subsystem_data_date || ''} · spool tracker wk ${meta.spool_week || ''} · Co-Consol punches ${esc(PU.date)}</dd></dl>
      ${extra.o ? (() => { const r = readiness(extra.o); return `<h3>Readiness here: <span style="color:${rgb(RDY[r.k])}">${r.k}</span></h3><div class="meta">${esc(r.why.join(' · ') || 'no open blockers')}</div>`; })() : `<h3>Readiness: ${ssReadiness(s)}</h3>`}
      ${QC.ready && extra.o && elemQcr(extra.o) ? (() => { const e = elemQcr(extra.o); return `<h3>QCR sheets on this element: ${e[1]}/${e[0]} checked</h3>` + e[2].map((q) => `<div class="pr"><span class="pb pb0">${esc(q[2] || '')}</span><div>${esc(q[0])} <span class="meta">${esc(q[1])}</span></div></div>`).join(''); })() : ''}
      ${QC.ready && QC.bySs[s.ss] ? `<h3>QCR of ${esc(s.ss)} by object type</h3><div class="meta">${Object.entries(QC.bySs[s.ss]).map(([t, v]) => `${esc(t)} ${v[1]}/${v[0]}`).join(' · ')}</div>` : ''}
      ${extra.elemP ? `<h3>Punches on this element <small class="meta">${esc(extra.elemKey || '')}</small></h3>${pRows(extra.elemP) || '<div class="meta">none open</div>'}` : ''}
      ${PU.ready ? `<h3>All open punches of ${esc(s.ss)}</h3>${pRows(PU.bySs[s.ss] || [], extra.elemP ? 15 : 60) || '<div class="meta">none open</div>'}` : ''}
      ${DOCS.ready ? (() => { const dl = docsFor(s, extra.o); return `<h3>Documents in ACC <small class="meta">${dl.length}${ssEq[s.ss] ? ' · ' + esc(ssEq[s.ss]) : ''}</small></h3>${docRows(dl) || '<div class="meta">none found by tag, line or P&amp;ID</div>'}`; })() : ''}`;
    $('#infox').onclick = (e) => { e.preventDefault(); if (S.sel) selectSubsystem(S.sel); else $('#info').style.display = 'none'; };
  }
  viewer.addEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, (ev) => {
    const sel = ev.selections?.[0]; if (!sel || !sel.dbIdArray?.length) return;
    const k = sel.model._cxKey; const o = idx[k]?.get(sel.dbIdArray[0]);
    if (!o) {
      const dbId = sel.dbIdArray[0];
      $('#info').style.display = 'block';
      $('#info').innerHTML = `<h2>Not linked</h2><div class="meta">No tag or line number of this element matches the commissioning data.</div><dl><dt>Model</dt><dd>${esc(sel.model._cxName)}</dd><dt>Handle</dt><dd id="hdl">…</dd><dt>Name</dt><dd id="hnm">…</dd></dl>
        <button class="btn" id="cpl" style="margin-top:6px" title="Paste into the manual link list next to the subsystem code">Copy model + handle</button>`;
      const setH = (h, nm) => { $('#hdl').textContent = h; $('#hnm').textContent = nm || ''; $('#cpl').onclick = async () => { const t = `${sel.model._cxName}\t${h}`; try { await navigator.clipboard.writeText(t); $('#cpl').textContent = 'Copied ✓'; } catch { prompt('Copy:', t); } }; };
      const hx = areaData[docAreaOf(sel.model)]?.ext?.[k]?.[dbId];
      if (hx) setH(hx); else sel.model.getProperties(dbId, (p) => setH((p.properties || []).find((x) => x.displayName === 'Handle')?.displayValue || p.externalId || '?', p.name), () => setH('? (open E&I models to read handles)'));
      return;
    }
    const s = bestSS(o), l = LN[o.line];
    if (s) showInfo(s, { o, line: l, model: sel.model._cxName, elemP: elemPunches(o), elemKey: o.line || [...o.ss].map((x) => ssEq[x]).filter(Boolean)[0] });
    else if (l) { $('#info').style.display = 'block'; $('#info').innerHTML = `<h2>${esc(l.iso)}</h2><dl><dt>Spools</dt><dd>${l.installed}/${l.spools} installed · ${l.handed_over} handed over</dd><dt>Subsystem</dt><dd>none linked in QCR</dd><dt>Priority</dt><dd>${esc(l.prio)}</dd></dl>`; }
  });

  // ------------------------------------------------------------------ start
  renderTiles();
  if (S.sub.size) {                                   // shared selection: load only the models that hold it
    const areas = [...new Set([...S.sub].map((c) => SS[c]?.area).filter(Boolean))];
    showOverview(false); areas.forEach((a) => S.open.add(a)); if (areas.length === 1) S.area = areas[0];
    await Promise.all(areas.map(loadAreaData)); refresh(false);
    const urns = new Set();
    for (const c of S.sub) { const d = areaData[SS[c]?.area]; if (!d) continue; Object.keys(d.bySubsystem[c] || {}).forEach((u) => urns.add(u)); for (const l of ssLines[c] || []) Object.keys(d.byLine[l.line] || {}).forEach((u) => urns.add(u)); }
    await loadDocs(areas.flatMap((a) => index.areas[a]?.docs || []).filter((d) => urns.has(d.urn)), false);
    if (S.ctx) await syncContext();
    if (S.ei) await syncEI();
    colorAll(); if (S.sel && SS[S.sel]) showInfo(SS[S.sel]);
  } else if (S.open.size) {
    showOverview(false); const first = S.area || [...S.open][0];
    for (const a of S.open) await openArea(a, a === first);
    if (S.sel && SS[S.sel]) { applyFilterToModel(); showInfo(SS[S.sel]); }
  } else { showOverview(true); status('pick an area'); }
  if (S.cam) { applyCam(S.cam); S.cam = ''; }
  window.__cxUp = true; if (PU.ready) { renderPunchFacets(); refresh(false); if (S.mode === 'punch') colorAll(); }
})();
