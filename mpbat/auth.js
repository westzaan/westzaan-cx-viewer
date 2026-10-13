// Autodesk login (3-legged OAuth, PKCE, no client secret) + tiny APS/ACC client.
(function () {
  const C = window.CX_CONFIG;
  const B = 'https://developer.api.autodesk.com';
  const REDIRECT = location.origin + location.pathname;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('cx.' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('cx.' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('cx.' + k); } catch {} },
  };
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rnd = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function login(scopes) {
    scopes = typeof scopes === 'string' && scopes ? scopes : C.scopes;   // a click event is not a scope list
    const verifier = rnd(48), state = rnd(12);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    store.set('pkce', { verifier, state, back: location.search, scopes });
    const q = new URLSearchParams({ response_type: 'code', client_id: C.clientId, redirect_uri: REDIRECT, scope: scopes,
      code_challenge: challenge, code_challenge_method: 'S256', state });
    location.href = `${B}/authentication/v2/authorize?${q}`;
  }
  async function tokenCall(params, scopes) {
    const r = await fetch(`${B}/authentication/v2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: C.clientId, ...params }) });
    if (!r.ok) throw new Error('Login failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    const t = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000, scope: scopes || C.scopes };
    store.set('tok', t); return t;
  }
  // call once at start: finishes a redirect, or returns the stored session, or null
  async function init() {
    const p = new URLSearchParams(location.search);
    if (p.get('code')) {
      const s = store.get('pkce'); store.del('pkce');
      if (!s || s.state !== p.get('state')) throw new Error('Login state mismatch — please sign in again.');
      await tokenCall({ grant_type: 'authorization_code', code: p.get('code'), code_verifier: s.verifier, redirect_uri: REDIRECT }, s.scopes);
      history.replaceState(null, '', location.pathname + (s.back || ''));
    }
    return store.get('tok') ? token() : null;
  }
  let refreshing = null;
  async function token() {
    let t = store.get('tok'); if (!t) return null;
    if (t.exp - Date.now() < 5 * 60 * 1000) {
      const sc = t.scope || C.scopes;
      refreshing ||= tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh, scope: sc }, sc).finally(() => (refreshing = null));
      try { t = await refreshing; } catch (e) { store.del('tok'); return null; }
    }
    return t;
  }
  function logout() { store.del('tok'); location.href = location.pathname; }
  async function api(path, opts = {}) {
    const t = await token(); if (!t) throw new Error('Not signed in');
    const r = await fetch(path.startsWith('http') ? path : B + path, { ...opts, headers: { Authorization: 'Bearer ' + t.access, ...(opts.headers || {}) } });
    if (!r.ok) { const e = new Error(`${r.status} ${path.slice(0, 80)}`); e.status = r.status; throw e; }
    return r.json();
  }
  // ---- ACC data folder: name -> storage object, then signed S3 download
  let folderPromise = null;                       // one shared listing, also for parallel callers
  function listDataFolder() { return (folderPromise ||= fetchListing().catch((e) => { folderPromise = null; throw e; })); }
  async function fetchListing() {
    const folderIdx = {};
    let url = `/data/v1/projects/${C.projectId}/folders/${encodeURIComponent(C.dataFolderId)}/contents?page[limit]=200`;
    while (url) {
      const j = await api(url);
      const inc = Object.fromEntries((j.included || []).map((v) => [v.relationships?.item?.data?.id, v]));
      for (const it of j.data || []) {
        const v = inc[it.id]; if (!v) continue;
        folderIdx[it.attributes.displayName] = { item: it.id, storage: v.relationships?.storage?.data?.id, modified: v.attributes.lastModifiedTime, version: v.attributes.versionNumber };
      }
      url = j.links?.next?.href || null;
    }
    return folderIdx;
  }
  async function readDataFile(name) {
    const f = (await listDataFolder())[name]; if (!f) return null;
    const m = f.storage.match(/^urn:adsk\.objects:os\.object:([^/]+)\/(.+)$/);
    const s = await api(`/oss/v2/buckets/${m[1]}/objects/${encodeURIComponent(m[2])}/signeds3download`);
    const r = await fetch(s.url); if (!r.ok) throw new Error('download ' + name + ' ' + r.status);
    return r.json();
  }
  async function readDataBlob(name) {
    const f = (await listDataFolder())[name]; if (!f) return null;
    const m = f.storage.match(/^urn:adsk\.objects:os\.object:([^/]+)\/(.+)$/);
    const s = await api(`/oss/v2/buckets/${m[1]}/objects/${encodeURIComponent(m[2])}/signeds3download`);
    const r = await fetch(s.url); if (!r.ok) throw new Error('download ' + name + ' ' + r.status);
    return r.blob();
  }
  // upload a file into the data folder (new item, or new version when it exists). Needs data:write data:create.
  async function uploadDataFile(name, blob) {
    const J = { 'Content-Type': 'application/vnd.api+json' }, P = `/data/v1/projects/${C.projectId}`;
    const st = (await api(`${P}/storage`, { method: 'POST', headers: J, body: JSON.stringify({ jsonapi: { version: '1.0' }, data: { type: 'objects', attributes: { name },
      relationships: { target: { data: { type: 'folders', id: C.dataFolderId } } } } }) })).data.id;
    const m = st.match(/^urn:adsk\.objects:os\.object:([^/]+)\/(.+)$/); const ou = `/oss/v2/buckets/${m[1]}/objects/${encodeURIComponent(m[2])}/signeds3upload`;
    const su = await api(ou);
    const put = await fetch(su.urls[0], { method: 'PUT', body: blob }); if (!put.ok) throw new Error('S3 upload ' + put.status);
    await api(ou, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey: su.uploadKey }) });
    folderPromise = null; const ex = (await listDataFolder())[name];
    const ext = { type: 'versions:autodesk.bim360:File', version: '1.0' };
    if (ex) await api(`${P}/versions`, { method: 'POST', headers: J, body: JSON.stringify({ jsonapi: { version: '1.0' }, data: { type: 'versions', attributes: { name, extension: ext },
      relationships: { item: { data: { type: 'items', id: ex.item } }, storage: { data: { type: 'objects', id: st } } } } }) });
    else await api(`${P}/items`, { method: 'POST', headers: J, body: JSON.stringify({ jsonapi: { version: '1.0' },
      data: { type: 'items', attributes: { displayName: name, extension: { type: 'items:autodesk.bim360:File', version: '1.0' } },
        relationships: { tip: { data: { type: 'versions', id: '1' } }, parent: { data: { type: 'folders', id: C.dataFolderId } } } },
      included: [{ type: 'versions', id: '1', attributes: { name, extension: ext }, relationships: { storage: { data: { type: 'objects', id: st } } } }] }) });
    folderPromise = null;
  }
  // newest version of a model: version urn (base64) -> lineage -> tip
  async function latestUrn(b64urn) {
    try {
      const v = atob(b64urn.replace(/-/g, '+').replace(/_/g, '/'));             // urn:adsk.wipemea:fs.file:vf.XXX?version=N
      const lineage = v.replace(/:fs\.file:vf\./, ':dm.lineage:').replace(/\?version=\d+$/, '');
      const tip = await api(`/data/v1/projects/${C.projectId}/items/${encodeURIComponent(lineage)}/tip`);
      const nv = tip.data.id; if (nv === v) return b64urn;
      return btoa(nv).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return b64urn; }
  }
  window.CX_AUTH = { init, login, logout, token, api, readDataFile, readDataBlob, uploadDataFile, listDataFolder, latestUrn };
})();
