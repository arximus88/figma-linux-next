/**
 * Design-system tools the Plugin API has no door to: which libraries exist
 * and which this file uses, pending library updates, library styles, and
 * Code Connect snippets.
 *
 * Everything goes through the page's own modules, located in its bundler by
 * endpoint or view names (ids change with every Figma deploy). Verified live
 * on 2026-11-06 (build e79b4ae) against a Pro team file, read-only. Library
 * usage analytics are left out on purpose: they need an Organization plan and
 * Figma signs those requests with a token built from "please_use_the_public_api".
 *
 * Library keys are ~130 characters; the outputs name libraries instead and the
 * tools accept a name.
 */

const LIB_PREAMBLE = `
    let req = null;
    window.rspackChunk_figma_web_bundler.push([[Math.random()], {}, function (r) { req = r; }]);
    if (!req || !req.m) throw new Error("Figma's page bundler is not reachable; Figma may have changed how it loads code.");
    function find(needle, pick) {
      for (const id of Object.keys(req.m)) {
        let s;
        try { s = String(req.m[id]); } catch (e) { continue; }
        if (s.indexOf(needle) === -1) continue;
        try {
          const m = req(id);
          for (const k of Object.keys(m || {})) { const v = m[k]; if (v && pick(v, k)) return v; }
        } catch (e) {}
      }
      return null;
    }
    function moduleWith(needles) {
      for (const id of Object.keys(req.m)) {
        let s;
        try { s = String(req.m[id]); } catch (e) { continue; }
        if (needles.every(function (n) { return s.indexOf(n) !== -1; })) { try { return req(id); } catch (e) { return null; } }
      }
      return null;
    }
    function need(parts) {
      const missing = Object.keys(parts).filter(function (k) { return !parts[k]; });
      if (missing.length) throw new Error("Figma internals not found in the page (" + missing.join(', ') + "). Figma changed them; this tool needs an update.");
    }
    const cache = window.__flnLib = window.__flnLib || {};
    function libs() {
      if (cache.ds) return cache;
      cache.ds = find('/api/design_systems/libraries_by_library_keys', function (v) { return typeof v.getLibrariesV2 === 'function'; });
      cache.store = find('globalReduxStore', function (v, k) { return k === 'globalReduxStore'; });
      const viewsMod = moduleWith(['"LibraryFileSubscriptions"', '"SubscribedLibrariesForFile"']);
      cache.views = viewsMod;
      cache.lg = find('settleTimeoutMs', function (v) { const s = String(v); return typeof v === 'function' && /subscribe\\(e,t,/.test(s) && s.indexOf('settleTimeoutMs') !== -1; });
      need({ 'library list API': cache.ds, 'editor store': cache.store, 'library views': cache.views, 'view fetcher': cache.lg });
      return cache;
    }
    function view(name) {
      const v = Object.keys(cache.views).map(function (k) { return cache.views[k]; }).find(function (x) { return x && x._name === name; });
      if (!v) throw new Error("Figma's " + name + " view was not found. Figma changed it; this tool needs an update.");
      return v;
    }
    const plain = function (s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim(); };
    // Every library the user can reach, and which of them this file has on.
    async function libraryList() {
      const c = libs();
      const st = c.store.getState();
      const file = st.openFile;
      const all = (await c.ds.getLibrariesV2({})).data.meta || [];
      const subs = await c.lg(view('LibraryFileSubscriptions'), { fileKey: file.key });
      const overrides = (subs && subs.file && subs.file.libraryFileSubscriptionOverrides) || [];
      const on = {}, off = {};
      for (const o of overrides) (o.isSubscribed ? on : off)[o.libraryKey] = true;
      const team = await c.lg(view('SubscribedLibrariesForFile'), { fileKey: file.key, group: null, orgId: file.parentOrgId || null, teamId: file.teamId, workspaceId: null });
      const teamSubs = (team && team.file && team.file.libraryTeamSubscriptions) || [];
      for (const s of teamSubs) {
        const k = (s.communityLibrary && s.communityLibrary.hubFile && s.communityLibrary.hubFile.libraryKey) || (s.library && s.library.libraryKey);
        if (k && !off[k]) on[k] = true;
      }
      const list = all.map(function (l) {
        return { key: l.library_key, name: l.library_name, fileKey: l.library_file_key, team: l.team_name, components: l.num_components, styles: l.num_styles, variables: l.num_variables, collections: l.num_variable_collections, on: !!on[l.library_key] };
      });
      for (const s of teamSubs) {
        const cl = s.communityLibrary;
        if (!cl || !cl.hubFile) continue;
        if (list.some(function (l) { return l.key === cl.hubFile.libraryKey; })) continue;
        list.push({ key: cl.hubFile.libraryKey, name: cl.name, fileKey: null, team: 'community', components: cl.numComponents, styles: cl.numStyles, variables: cl.numVariables, collections: null, on: !off[cl.hubFile.libraryKey] });
      }
      return { file: file, list: list };
    }
    function pickLibrary(list, wanted) {
      const w = String(wanted || '').toLowerCase();
      return list.find(function (l) { return l.key === wanted || l.fileKey === wanted || String(l.name).toLowerCase() === w; }) ||
        list.find(function (l) { return String(l.name).toLowerCase().indexOf(w) !== -1; });
    }
`;

export const LIST_LIBRARIES_SCRIPT = `
(async function() {
  try {
    ${LIB_PREAMBLE}
    const r = await libraryList();
    if (!r.list.length) return { text: 'No libraries are available to you.' };
    const rows = r.list
      .sort(function (a, b) { return (b.on - a.on) || String(a.name).localeCompare(String(b.name)); })
      .map(function (l) {
        const assets = [l.components + ' components', l.styles + ' styles', l.variables + ' variables' + (l.collections ? ' in ' + l.collections + ' collections' : '')].join(', ');
        return '- ' + (l.on ? '[on] ' : '[  ] ') + l.name + ' · ' + assets + ' · ' + (l.team || '?') + (l.fileKey ? ' · file ' + l.fileKey : '');
      });
    return { text: 'Libraries you can use in "' + r.file.name + '" ([on] = enabled in this file). Pass a name to search_design_system includeLibraryKeys or get_library_styles:\\n' + rows.join('\\n') };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;

export const LIBRARY_STYLES_SCRIPT = (library: string, query: string) => `
(async function() {
  try {
    ${LIB_PREAMBLE}
    const r = await libraryList();
    const lib = pickLibrary(r.list, ${JSON.stringify(library)});
    if (!lib) return { error: 'No library named ' + ${JSON.stringify(JSON.stringify(library))} + '. list_libraries shows the names.' };
    const api = find('getLibraryStylesByLibraryKey', function (v) { return typeof v.getLibraryStylesByLibraryKey === 'function'; });
    need({ 'library styles API': api });
    const res = await api.getLibraryStylesByLibraryKey({ libraryKey: lib.key });
    const meta = res && res.data && res.data.meta;
    const styles = (Array.isArray(meta) ? meta : (meta && meta.styles) || []);
    const q = ${JSON.stringify(query.toLowerCase())};
    const hits = styles.filter(function (s) { return !q || String(s.name).toLowerCase().indexOf(q) !== -1; });
    if (!hits.length) return { text: 'No styles' + (q ? ' matching "' + q + '"' : '') + ' in ' + lib.name + '.' };
    return { text: hits.length + ' style(s) in ' + lib.name + ' (import with importStyleByKeyAsync(key)):\\n' + hits.map(function (s) {
      const d = plain(s.description);
      return '- ' + s.name + ' · ' + String(s.style_type || s.styleType || '').toLowerCase() + ' · key ' + s.key + (d ? ' · ' + d.slice(0, 200) : '');
    }).join('\\n') };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;

export const LIBRARY_UPDATES_SCRIPT = `
(async function() {
  try {
    ${LIB_PREAMBLE}
    const mod = moduleWith(['library_updates_selectors', 'componentUpdatesForAllPages']);
    const atoms = find('zl:', function (v, k) { return k === 'zl' && typeof v.get === 'function' && typeof v.sub === 'function'; });
    need({ 'library update selectors': mod, 'atom store': atoms });
    let all = null;
    for (const k of Object.keys(mod)) {
      try { const x = atoms.get(mod[k]); if (x && 'componentUpdatesForAllPages' in x) { all = x; break; } } catch (e) {}
    }
    if (!all) throw new Error("Figma's library update list was not found. Figma changed it; this tool needs an update.");
    let names = {};
    try { names = Object.fromEntries((await libraryList()).list.map(function (l) { return [l.key, l.name]; })); } catch (e) {}
    const line = function (kind, a) { return '- ' + kind + ' · ' + a.name + ' · key ' + (a.component_key || a.key) + ' · ' + (names[a.library_key] || 'library'); };
    const out = [].concat(
      (all.componentUpdatesForAllPages || []).map(function (a) { return line('component', a); }),
      (all.stateGroupUpdatesForAllPages || []).map(function (a) { return line('component set', a); }),
      (all.styleUpdatesForAllPages || []).map(function (a) { return line('style', a); }),
      (all.variableSetUpdatesForAllPages || []).map(function (a) { return line('variable collection', a); })
    );
    if (!out.length) return { text: 'No pending library updates on the pages loaded so far.' };
    return { text: out.length + ' library update(s) waiting to be accepted (pages loaded so far; accept them in Figma: Assets > Updates):\\n' + out.join('\\n') };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;

export const CODE_CONNECT_SCRIPT = (nodeId: string, label: string | null) => `
(async function() {
  try {
    ${LIB_PREAMBLE}
    const c = libs();
    const mod = moduleWith(['mcp.code_connect_mapping_timed_out']);
    const resolve = mod && Object.keys(mod).map(function (k) { return mod[k]; }).find(function (f) { return typeof f === 'function' && f.length === 5; });
    need({ 'Code Connect resolver': resolve });
    // Pages load on demand: a node on a page never opened is not in the scene
    // graph yet, so load its page through the Plugin API first.
    try {
      const f = window.figma;
      const n = f && (typeof f.getNodeByIdAsync === 'function' ? await f.getNodeByIdAsync(${JSON.stringify(nodeId)}) : f.getNodeById(${JSON.stringify(nodeId)}));
      let page = n;
      while (page && page.type !== 'PAGE') page = page.parent;
      if (page && typeof page.loadAsync === 'function') await page.loadAsync();
    } catch (e) {}
    const node = c.store.getState().mirror.sceneGraph.get(${JSON.stringify(nodeId)});
    if (!node) return { error: 'Node not found: ' + ${JSON.stringify(nodeId)} };
    const r = await resolve(node, 'get_code_connect_map', ${JSON.stringify(label)}, c.store, 'figma-linux-next');
    const content = (r && r.nodeIdToCodeConnectContent) || {};
    const errors = (r && r.nodeIdToErrors) || {};
    const ids = Object.keys(content);
    const lines = [];
    for (const id of ids) {
      const x = content[id];
      lines.push('## ' + id + (x.component ? ' · ' + x.component : '') + (x.source ? ' · ' + x.source : ''));
      lines.push(String(x.snippet || x.code || JSON.stringify(x)).slice(0, 4000));
    }
    for (const id of Object.keys(errors)) lines.push('error ' + id + ': ' + errors[id]);
    if (!ids.length) {
      lines.unshift('No Code Connect mapping for ' + ${JSON.stringify(nodeId)} + ' or the instances inside it. Mappings are published with the figma CLI (npx figma connect publish); a Pro plan allows one library and framework pair.');
    }
    return { text: lines.join('\\n') };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;
