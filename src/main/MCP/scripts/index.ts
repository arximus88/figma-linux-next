/**
 * scripts/index.ts -- Figma Plugin API query/mutation snippets.
 *
 * Each template returns a string of JS that runs inside the Figma webapp
 * renderer context via webContents.executeJavaScript(). Common boilerplate
 * (frozen-array cloning, XML escaping, appendChild ordering, font loading, tree
 * walking) lives in scripts/helpers.ts as the inlined HELPERS_PREAMBLE.
 */

import { HELPERS_PREAMBLE, PLUGIN_API_UNAVAILABLE } from "./helpers";
import { LIB_PREAMBLE } from "./libraries";

// ── Figma Plugin API Queries ───────────────────────────────────────────────────
// These JS snippets run inside the Figma webapp's renderer context via
// webContents.executeJavaScript(). They use the internal Figma scene graph
// that's available in the global scope.

export { DESIGN_CONTEXT_SCRIPT } from "./designContext";

export const FILE_INFO_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };

    const pages = figma.root.children;
    const currentPage = figma.currentPage;
    const selection = currentPage.selection;

    let componentCount = 0;
    let instanceCount = 0;
    let textCount = 0;
    let frameCount = 0;

    function countNodes(node) {
      if (node.type === 'COMPONENT') componentCount++;
      if (node.type === 'INSTANCE') instanceCount++;
      if (node.type === 'TEXT') textCount++;
      if (node.type === 'FRAME') frameCount++;
      if ('children' in node) node.children.forEach(countNodes);
    }
    currentPage.children.forEach(countNodes);

    return {
      fileName: figma.root.name,
      currentPage: currentPage.name,
      pageCount: pages.length,
      pageNames: pages.map(p => p.name),
      selectionCount: selection.length,
      selectedNodeIds: selection.map(n => n.id),
      selectedNodeNames: selection.map(n => n.name),
      currentPageStats: {
        components: componentCount,
        instances: instanceCount,
        textNodes: textCount,
        frames: frameCount,
      },
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const METADATA_XML_SCRIPT = (nodeId: string | null, depth: number) => `
(async function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: ${PLUGIN_API_UNAVAILABLE} });
${HELPERS_PREAMBLE}
    function nodeToXml(node, indent, currentDepth) {
      if (!node || currentDepth > ${depth}) return '';
      try {
        const pad = '  '.repeat(indent);
        const tag = (node.type || 'node').toLowerCase().replace(/_/g, '-');
        const attrs = [];
        try { attrs.push('id="' + escapeXml(node.id) + '"'); } catch(_) {}
        try { attrs.push('name="' + escapeXml(node.name) + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          // Most text layers are named after their text; repeat it only when not.
          if (node.type === 'TEXT' && 'characters' in node && node.characters !== node.name) {
            attrs.push('text="' + escapeXml(String(node.characters).substring(0, 80)) + '"');
          }
        } catch(_) {}

        // An instance is outlined as one element, as Figma's remote tool does:
        // its insides belong to the component (get_design_context shows them).
        if (node.type !== 'INSTANCE' && 'children' in node && node.children && node.children.length > 0 && currentDepth < ${depth}) {
          let xml = pad + '<' + tag + ' ' + attrs.join(' ') + '>\\n';
          for (let i = 0; i < node.children.length; i++) {
            try { xml += nodeToXml(node.children[i], indent + 1, currentDepth + 1); } catch(_) {}
          }
          xml += pad + '</' + tag + '>\\n';
          return xml;
        } else {
          return pad + '<' + tag + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) { return ''; }
    }

    // Selection first, as Figma's remote get_metadata does, so the caller can
    // tell whether what it asked for is what the user is pointing at.
    let selectionBlock = '';
    try {
      const sel = figma.currentPage.selection;
      if (sel && sel.length) {
        selectionBlock = 'Currently selected nodes:\\n' + sel.slice(0, 50).map(function (n) {
          return '- ' + n.id + ' ' + n.name + ' (' + n.type + ')';
        }).join('\\n') + (sel.length > 50 ? '\\n- … ' + (sel.length - 50) + ' more' : '') + '\\n\\n';
      }
    } catch (_) {}

    const getNode = async function (id) {
      if (typeof figma.getNodeByIdAsync === 'function') return figma.getNodeByIdAsync(id);
      return figma.getNodeById(id);
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n';
    ${
      nodeId
        ? `
      const target = await getNode(${JSON.stringify(nodeId)});
      if (!target) return JSON.stringify({ error: "Node not found: " + ${JSON.stringify(nodeId)} + ". Call get_metadata without nodeId to list the pages." });
      if (target.type === 'PAGE') {
        // Pages load on demand; a page that was never opened has no children yet.
        if (typeof target.loadAsync === 'function') await target.loadAsync();
        xml += '<canvas id="' + escapeXml(target.id) + '" name="' + escapeXml(target.name) + '" file="' + escapeXml(figma.root.name) + '">\\n';
        for (let i = 0; i < target.children.length; i++) {
          try { xml += nodeToXml(target.children[i], 1, 0); } catch(_) {}
        }
        xml += '</canvas>\\n';
      } else {
        xml += '<canvas name="' + escapeXml(figma.currentPage.name) + '" file="' + escapeXml(figma.root.name) + '">\\n';
        xml += nodeToXml(target, 1, 0);
        xml += '</canvas>\\n';
      }
    `
        : `
      // No nodeId: the pages of the document, like Figma's remote tool. Drill in
      // with a page id (it loads the page) or a node id.
      xml += '<document name="' + escapeXml(figma.root.name) + '">\\n';
      for (const page of figma.root.children) {
        xml += '  <page id="' + escapeXml(page.id) + '" name="' + escapeXml(page.name) + '"' + (page === figma.currentPage ? ' current="true"' : '') + '/>\\n';
      }
      xml += '</document>\\n';
    `
    }

    return JSON.stringify({ xml: selectionBlock + xml });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;

export { VARIABLE_DEFS_SCRIPT } from "./variableDefs";

export const FIGJAM_SCRIPT = (nodeId: string | null) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    function nodeToXml(node, indent) {
      try {
        if (!node) return '';
        const pad = '  '.repeat(indent);
        const attrs = [];
        try { attrs.push('id="' + node.id + '"'); } catch(_) {}
        try { attrs.push('name="' + escapeAttrQuote(node.name) + '"'); } catch(_) {}
        try { attrs.push('type="' + node.type + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT') {
            var text = ('characters' in node) ? node.characters : (node.text ? node.text.characters : null);
            if (text) attrs.push('text="' + escapeAttrQuote(text) + '"');
          }
        } catch(_) {}
        try {
          if (node.type === 'CONNECTOR') {
            try { if (node.connectorStart && node.connectorStart.endpointNodeId) attrs.push('startNodeId="' + node.connectorStart.endpointNodeId + '"'); } catch(_) {}
            try { if (node.connectorEnd && node.connectorEnd.endpointNodeId) attrs.push('endNodeId="' + node.connectorEnd.endpointNodeId + '"'); } catch(_) {}
            try { if (node.text && node.text.characters) attrs.push('label="' + escapeAttrQuote(node.text.characters) + '"'); } catch(_) {}
          }
        } catch(_) {}
        var nodeType = node.type || 'NODE';
        if ('children' in node && node.children && node.children.length > 0) {
          var xml = pad + '<' + nodeType + ' ' + attrs.join(' ') + '>\\n';
          for (var ci = 0; ci < node.children.length; ci++) {
            try { xml += nodeToXml(node.children[ci], indent + 1); } catch(_) {}
          }
          xml += pad + '</' + nodeType + '>\\n';
          return xml;
        } else {
          return pad + '<' + nodeType + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) {
        return '';
      }
    }

    var targetNodes;
    ${
      nodeId
        ? `
      var target = figma.getNodeById(${JSON.stringify(nodeId)});
      if (!target) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };
      targetNodes = [target];
    `
        : `
      var sel = figma.currentPage.selection;
      targetNodes = (sel && sel.length > 0) ? sel : figma.currentPage.children;
    `
    }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\\n<figjam fileName="' + figma.root.name + '" page="' + figma.currentPage.name + '">\\n';
    for (var i = 0; i < targetNodes.length; i++) {
      xml += nodeToXml(targetNodes[i], 1);
    }
    xml += '</figjam>\\n';

    var nodeIds = [];
    function collectIds(n) {
      if (n.type !== 'DOCUMENT' && n.type !== 'CANVAS') nodeIds.push(n.id);
      if ('children' in n && nodeIds.length < 20) { for (var k = 0; k < n.children.length; k++) { try { collectIds(n.children[k]); } catch(_) {} } }
    }
    for (var j = 0; j < targetNodes.length; j++) { try { collectIds(targetNodes[j]); } catch(_) {} }

    return { xml: xml, nodeIds: nodeIds.slice(0, 20), nodeCount: targetNodes.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const GENERATE_DIAGRAM_SCRIPT = (nodesJson: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
    if (typeof figma.createShapeWithText !== 'function') {
      return { error: "This command requires a FigJam file. Open or create a FigJam file first." };
    }
    const nodes = ${nodesJson};
    const createdNodes = {};
    const SPACING_X = 250;
    const SPACING_Y = 120;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const shape = figma.createShapeWithText();
      shape.shapeType = n.shape || 'ROUNDED_RECTANGLE';
      shape.x = (i % cols) * SPACING_X + 100;
      shape.y = Math.floor(i / cols) * SPACING_Y + 100;
      shape.resize(200, 60);
      try {
        if (shape.text) {
          figma.loadFontAsync(shape.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
            shape.text.characters = n.label || n.id;
          }).catch(() => {});
        }
      } catch(_) {}
      createdNodes[n.id] = shape.id;
      figma.currentPage.appendChild(shape);
    }
    const edgeList = nodes.filter(n => n._edges).flatMap(n => n._edges);
    const connectors = [];
    for (const edge of edgeList) {
      if (createdNodes[edge.from] && createdNodes[edge.to]) {
        try {
          const connector = figma.createConnector();
          connector.connectorStart = { endpointNodeId: createdNodes[edge.from], magnet: 'AUTO' };
          connector.connectorEnd = { endpointNodeId: createdNodes[edge.to], magnet: 'AUTO' };
          if (edge.label && connector.text) {
            figma.loadFontAsync(connector.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
              connector.text.characters = edge.label;
            }).catch(() => {});
          }
          connectors.push(connector.id);
        } catch(e) {}
      }
    }
    const allCreated = Object.values(createdNodes).map(id => figma.getNodeById(id)).filter(Boolean);
    if (allCreated.length > 0) {
      figma.currentPage.selection = allCreated;
      figma.viewport.scrollAndZoomIntoView(allCreated);
    }
    return { success: true, nodesCreated: Object.keys(createdNodes).length, connectorsCreated: connectors.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const DESIGN_SYSTEM_RULES_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };

${HELPERS_PREAMBLE}
    // Collect all local variable collections and their variables
    const collections = [];
    try {
      const localCollections = figma.variables.getLocalVariableCollections();
      for (const coll of localCollections) {
        const vars = [];
        for (const varId of coll.variableIds) {
          const v = figma.variables.getVariableById(varId);
          if (v) {
            const values = {};
            for (const mode of coll.modes) {
              assignClone(values, mode.name, v.valuesByMode[mode.modeId]);
            }
            vars.push({ name: v.name, type: v.resolvedType, values });
          }
        }
        collections.push({ name: coll.name, modes: coll.modes.map(m => m.name), variables: vars });
      }
    } catch(e) {}

    // Collect local styles with full values
    const allStyles = [];
    try {
      const paintStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
      for (const s of paintStyles) {
        const entry = { name: s.name, type: 'PAINT', description: s.description || null };
        assignClone(entry, 'paints', s.paints);
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const textStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
      for (const s of textStyles) {
        const entry = { name: s.name, type: 'TEXT', description: s.description || null };
        try { entry.fontSize = s.fontSize; } catch(e) {}
        assignClone(entry, 'fontName', s.fontName);
        assignClone(entry, 'lineHeight', s.lineHeight);
        assignClone(entry, 'letterSpacing', s.letterSpacing);
        try { entry.textDecoration = s.textDecoration; } catch(e) {}
        try { entry.textCase = s.textCase; } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const effectStyles = figma.getLocalEffectStyles ? figma.getLocalEffectStyles() : [];
      for (const s of effectStyles) {
        const entry = { name: s.name, type: 'EFFECT', description: s.description || null };
        assignClone(entry, 'effects', s.effects);
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const gridStyles = figma.getLocalGridStyles ? figma.getLocalGridStyles() : [];
      for (const s of gridStyles) {
        const entry = { name: s.name, type: 'GRID', description: s.description || null };
        assignClone(entry, 'layoutGrids', s.layoutGrids);
        allStyles.push(entry);
      }
    } catch(e) {}

    // Collect component sets (variants)
    const components = [];
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET') {
        const props = {};
        try { Object.assign(props, JSON.parse(JSON.stringify(node.componentPropertyDefinitions))); } catch(e) {}
        components.push({ name: node.name, type: 'COMPONENT_SET', properties: props });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')) {
        components.push({ name: node.name, type: 'COMPONENT' });
      }
      if ('children' in node) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    return {
      fileName: figma.root.name,
      collections,
      styles: allStyles,
      components: components.slice(0, 100), // limit
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

/**
 * Export a node as PNG. Sizing follows Figma's remote get_screenshot: the
 * longer edge is capped at `maxDimension` (default 1024), and a small node is
 * rendered at up to 2x rather than blown up. An explicit `scale` (this
 * server's older parameter) wins over the cap. `contentsOnly: false` (the
 * default, as remote) renders what the canvas shows, overlapping layers
 * included; true renders the node in isolation.
 */
export const SCREENSHOT_SCRIPT = (
  nodeId: string | null,
  opts: { scale: number | null; maxDimension: number; contentsOnly: boolean },
) => `
(async function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };

    let target;
    ${
      nodeId
        ? `
      target = typeof figma.getNodeByIdAsync === 'function'
        ? await figma.getNodeByIdAsync(${JSON.stringify(nodeId)})
        : figma.getNodeById(${JSON.stringify(nodeId)});
      if (!target) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };
    `
        : `
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) return { error: "No node selected", noSelection: true };
      target = sel[0];
    `
    }
    if (typeof target.exportAsync !== 'function') {
      return { error: "Node " + target.id + " (" + target.type + ") cannot be exported as an image" };
    }

    const w = target.width || 0, h = target.height || 0;
    const longer = Math.max(w, h);
    const explicitScale = ${opts.scale === null ? "null" : JSON.stringify(opts.scale)};
    const maxDimension = ${JSON.stringify(opts.maxDimension)};
    const scale = explicitScale !== null
      ? explicitScale
      : (longer > 0 ? Math.min(2, maxDimension / longer) : 1);

    const bytes = await target.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
      contentsOnly: ${opts.contentsOnly ? "true" : "false"},
    });
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return {
      base64: btoa(binary),
      nodeId: target.id,
      nodeName: target.name,
      width: Math.round(w * scale),
      height: Math.round(h * scale),
      original_width: Math.round(w),
      original_height: Math.round(h),
      scale: Math.round(scale * 1000) / 1000,
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

/**
 * search_design_system with Figma's remote shape: `queries` is a list of
 * {entity: component|variable|style, query}, answered in the same order.
 *
 * Sources: this file's components, styles and variables; the library
 * components it already uses (through its instances); variables of enabled
 * team libraries (figma.teamLibrary); and two searches of Figma's own page —
 * the Assets panel's team-library search (/api/search/components) and its
 * UI-kit search (/api/search/community_libraries/library_assets). The second
 * is the only place the default kits (Simple Design System, iOS, Material…)
 * show up: figma.teamLibrary lists none of their variables and the team search
 * none of their components (measured 2026-11-06 in a file with SDS enabled).
 * Library names come from the same list as list_libraries, so
 * includeLibraryKeys takes a name or a key, and hits from libraries enabled in
 * this file come first. Each hit carries the ids/keys a follow-up use_figma
 * call needs.
 */
export const SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT = (
  queriesJson: string,
  libraryKeysJson: string,
) => `
(async function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    const queries = ${queriesJson};
    const onlyLibraries = ${libraryKeysJson};
    const LIMIT = 20;
    // Descriptions come HTML-escaped from Figma (m&#39;ята); one line, plain.
    const plainText = function (s) {
      return String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim();
    };
    const notes = [];
    const matches = function (name, q) { return String(name || '').toLowerCase().indexOf(q) !== -1; };

    // Library names, and which libraries this file has on — the list_libraries
    // data (libraries.ts). null when Figma moved those internals: the search
    // then works as before, without names for UI-kit hits or enabled-first order.
    let libInfoP = null;
    function libraryInfo() {
      if (!libInfoP) libInfoP = (async function () {
        try {
${LIB_PREAMBLE}
          const r = await libraryList();
          const names = {}, enabled = {};
          r.list.forEach(function (l) { names[l.key] = l.name; if (l.on) enabled[l.key] = true; });
          return { names: names, enabled: enabled, pick: function (w) { return pickLibrary(r.list, w); } };
        } catch (e) { return null; }
      })();
      return libInfoP;
    }
    // includeLibraryKeys holds names or keys; a name also stands for its key.
    let wantedP = null;
    function wanted() {
      if (!onlyLibraries) return Promise.resolve(null);
      if (!wantedP) wantedP = libraryInfo().then(function (info) {
        const set = {};
        onlyLibraries.forEach(function (w) {
          set[w] = true;
          const l = info && info.pick(w);
          if (l) set[l.key] = true;
        });
        return set;
      });
      return wantedP;
    }
    function allowed(set, libraryKey, libraryName) {
      return !set || !!set[libraryKey] || (!!libraryName && !!set[libraryName]);
    }
    /** Library hits from libraries enabled in this file first; order kept otherwise. */
    function enabledFirst(list, info) {
      if (!info) return list;
      return list.map(function (h, i) { return { h: h, i: i, on: info.enabled[h.libraryKey] ? 0 : 1 }; })
        .sort(function (a, b) { return a.on - b.on || a.i - b.i; })
        .map(function (x) { return x.h; });
    }
    function bundlerExport(needle, method) {
      let req = null;
      window.rspackChunk_figma_web_bundler.push([[Math.random()], {}, function (r) { req = r; }]);
      for (const id of Object.keys((req && req.m) || {})) {
        let src = '';
        try { src = String(req.m[id]); } catch (e) { continue; }
        if (src.indexOf(needle) === -1) continue;
        try {
          const mod = req(id);
          for (const k of Object.keys(mod || {})) { if (mod[k] && typeof mod[k][method] === 'function') return mod[k]; }
        } catch (e) {}
      }
      return null;
    }
    // The Assets panel's UI-kit search, once per query text per call.
    const kitResults = {};
    function searchKits(q) {
      if (kitResults[q]) return kitResults[q];
      kitResults[q] = (async function () {
        let api = window.__flnKitSearch;
        if (!api) {
          try { api = bundlerExport('community_libraries/library_assets', 'getCommunityLibraryAssets'); } catch (e) {}
          if (!api) { notes.push("Figma's UI kit search was not found in this page; default kits such as Simple Design System were not searched."); return null; }
          window.__flnKitSearch = api;
        }
        try {
          const res = await api.getCommunityLibraryAssets({ query: q });
          return (res && res.data && res.data.meta && res.data.meta.results) || null;
        } catch (e) {
          notes.push('UI kit search failed: ' + (e.message || e));
          return null;
        }
      })();
      return kitResults[q];
    }

    // ── Load each source once, lazily ──
    let localVars = null, libVars = null, styles = null, components = null;

    async function getLocalVariables() {
      if (localVars) return localVars;
      localVars = [];
      try {
        const collections = typeof figma.variables.getLocalVariableCollectionsAsync === 'function'
          ? await figma.variables.getLocalVariableCollectionsAsync()
          : figma.variables.getLocalVariableCollections();
        for (const coll of collections) {
          for (const varId of coll.variableIds) {
            try {
              const v = typeof figma.variables.getVariableByIdAsync === 'function'
                ? await figma.variables.getVariableByIdAsync(varId)
                : figma.variables.getVariableById(varId);
              if (!v) continue;
              const values = {};
              for (const mode of coll.modes) assignClone(values, mode.name, v.valuesByMode[mode.modeId]);
              localVars.push({ source: 'local', id: v.id, key: v.key, name: v.name, type: v.resolvedType, collection: coll.name, valuesByMode: values });
            } catch (e) {}
          }
        }
      } catch (e) { notes.push('local variables unavailable: ' + (e.message || e)); }
      return localVars;
    }

    async function getLibraryVariables() {
      if (libVars) return libVars;
      libVars = [];
      try {
        if (!figma.teamLibrary || typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync !== 'function') {
          notes.push('library variables are not available in this tab');
          return libVars;
        }
        const colls = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        for (const coll of colls) {
          if (onlyLibraries && onlyLibraries.indexOf(coll.libraryName) === -1 && onlyLibraries.indexOf(coll.key) === -1) continue;
          try {
            const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(coll.key);
            for (const v of vars) {
              libVars.push({ source: 'library', library: coll.libraryName, collection: coll.name, collectionKey: coll.key, key: v.key, name: v.name, type: v.resolvedType });
            }
          } catch (e) {}
        }
      } catch (e) { notes.push('library variables unavailable: ' + (e.message || e)); }
      return libVars;
    }

    async function getStyles() {
      if (styles) return styles;
      styles = [];
      const fns = [['PAINT', 'getLocalPaintStyles'], ['TEXT', 'getLocalTextStyles'], ['EFFECT', 'getLocalEffectStyles'], ['GRID', 'getLocalGridStyles']];
      for (const [type, fn] of fns) {
        try {
          const list = typeof figma[fn + 'Async'] === 'function' ? await figma[fn + 'Async']() : figma[fn]();
          for (const st of list) styles.push({ source: 'local', id: st.id, key: st.key, name: st.name, type: type, description: st.description || undefined });
        } catch (e) {}
      }
      return styles;
    }

    // Pages load on demand, and an unloaded page reports no children and finds
    // nothing without any error (measured live 2026-11-04). So each page is
    // loaded before it is searched, within a time budget; pages the budget did
    // not reach are named instead of silently counted as empty.
    const PAGE_BUDGET_MS = 15000;
    async function getComponents() {
      if (components) return components;
      components = [];
      const MAX_INSTANCES = 3000;
      const instances = [];
      const started = Date.now();
      const skipped = [];
      for (const page of figma.root.children) {
        if (page !== figma.currentPage && typeof page.loadAsync === 'function') {
          const left = PAGE_BUDGET_MS - (Date.now() - started);
          if (left <= 0) { skipped.push(page.name); continue; }
          const loaded = await Promise.race([
            page.loadAsync().then(function () { return true; }, function () { return false; }),
            new Promise(function (r) { setTimeout(function () { r(false); }, left); }),
          ]);
          if (!loaded) { skipped.push(page.name); continue; }
        }
        try {
          for (const node of page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })) {
            if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') continue;
            components.push({ source: 'local', id: node.id, key: node.key, name: node.name, type: node.type, description: plainText(node.description).slice(0, 300) || undefined, page: page.name });
          }
          for (const inst of page.findAllWithCriteria({ types: ['INSTANCE'] })) {
            if (instances.length >= MAX_INSTANCES) break;
            instances.push(inst);
          }
        } catch (e) { skipped.push(page.name); }
      }

      // Library components cannot be listed, but the ones this file already
      // uses can be reached through its instances' main components — with the
      // key importComponentByKeyAsync needs. Variants are reported under their
      // component set.
      const seenKeys = {};
      for (let i = 0; i < instances.length; i += 50) {
        const mains = await Promise.all(instances.slice(i, i + 50).map(function (inst) {
          return (typeof inst.getMainComponentAsync === 'function' ? inst.getMainComponentAsync() : Promise.resolve(inst.mainComponent)).catch(function () { return null; });
        }));
        for (const main of mains) {
          if (!main || !main.remote) continue;
          const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
          const owner = set || main;
          const description = plainText(owner.description || main.description).slice(0, 300) || undefined;
          const entry = set
            ? { source: 'library (used in this file)', key: set.key, name: set.name, type: 'COMPONENT_SET', variantKey: main.key, variant: main.name, description: description }
            : { source: 'library (used in this file)', key: main.key, name: main.name, type: 'COMPONENT', description: description };
          if (!entry.key || seenKeys[entry.key]) continue;
          seenKeys[entry.key] = true;
          components.push(entry);
        }
      }
      if (instances.length >= MAX_INSTANCES) notes.push('Only the first ' + MAX_INSTANCES + ' instances were inspected for library components.');
      if (skipped.length) notes.push('Not searched for components (did not load in time): ' + skipped.join(', ') + '. Retry, or narrow with get_metadata on those pages.');
      return components;
    }

    // Figma's own asset search (POST /api/search/components), the one the
    // Assets panel and the remote MCP use: ranked components from every team
    // library and community library the user can reach, used or not. It is an
    // internal module, found by its method name and cached; if a Figma deploy
    // moves it, the search falls back to this file and its instances.
    function libraryEntry(c, library, isSet, key) {
      const entry = { source: 'library', library: library, name: c.name, type: isSet ? 'COMPONENT_SET' : 'COMPONENT', key: key };
      const d = plainText(c.description);
      if (d) entry.description = d.slice(0, 160);
      if (c.containing_frame && c.containing_frame.pageName) entry.page = c.containing_frame.pageName;
      Object.defineProperty(entry, 'libraryKey', { value: c.library_key, enumerable: false });
      return entry;
    }
    async function searchKitComponents(q) {
      const kit = await searchKits(q);
      if (!kit) return [];
      const info = await libraryInfo();
      const set = await wanted();
      const out = [];
      (kit.state_groups || []).forEach(function (c) {
        const name = info && info.names[c.library_key];
        if (allowed(set, c.library_key, name)) out.push(libraryEntry(c, name || 'UI kit', true, c.key));
      });
      (kit.components || []).forEach(function (c) {
        if (c.state_group_id) return;
        const name = info && info.names[c.library_key];
        if (allowed(set, c.library_key, name)) out.push(libraryEntry(c, name || 'UI kit', false, c.component_key || c.key));
      });
      return out;
    }
    async function searchKitVariables(q) {
      const kit = await searchKits(q);
      if (!kit) return [];
      const info = await libraryInfo();
      const set = await wanted();
      return (kit.variables || []).filter(function (v) {
        return allowed(set, v.library_key, info && info.names[v.library_key]);
      }).map(function (v) {
        const entry = { source: 'library', library: (info && info.names[v.library_key]) || 'UI kit', key: v.key, name: v.name, type: v.variable_type };
        Object.defineProperty(entry, 'libraryKey', { value: v.library_key, enumerable: false });
        return entry;
      });
    }

    async function searchLibraryComponents(q) {
      let api = window.__flnAssetSearch;
      if (!api) {
        try {
          let req = null;
          window.rspackChunk_figma_web_bundler.push([[Math.random()], {}, function (r) { req = r; }]);
          for (const id of Object.keys(req.m || {})) {
            let src = '';
            try { src = String(req.m[id]); } catch (e) { continue; }
            if (src.indexOf('postComponents(') === -1 || src.indexOf('/api/search/components') === -1) continue;
            const mod = req(id);
            for (const k of Object.keys(mod || {})) {
              try { if (mod[k] && typeof mod[k].postComponents === 'function') { api = mod[k]; break; } } catch (e) {}
            }
            if (api) break;
          }
        } catch (e) {}
        if (!api) { notes.push("Figma's library search was not found in this page; only this file and the library components it uses were searched."); return null; }
        window.__flnAssetSearch = api;
      }
      try {
        const res = await api.postComponents({ query: q, openFileKey: figma.fileKey, fv: 0 });
        const meta = res && res.data && res.data.meta;
        if (!Array.isArray(meta)) return null;
        const set = await wanted();
        return meta.filter(function (c) { return allowed(set, c.library_key, c.file_name); }).map(function (c) {
          return libraryEntry(c, c.file_name, c.type === 'state_group', c.key);
        });
      } catch (e) {
        notes.push('library search failed: ' + (e.message || e));
        return null;
      }
    }

    const results = [];
    for (const item of queries) {
      const q = String(item.query || '').toLowerCase();
      let hits = [];
      if (item.entity === 'variable') {
        const own = (onlyLibraries ? [] : (await getLocalVariables())).concat(await getLibraryVariables()).filter(function (v) { return matches(v.name, q) || matches(v.collection, q); });
        const seenVars = {};
        hits = [];
        for (const v of own.concat(enabledFirst(await searchKitVariables(item.query), await libraryInfo()))) {
          if (v.key && seenVars[v.key]) continue;
          if (v.key) seenVars[v.key] = true;
          hits.push(v);
        }
      } else if (item.entity === 'style') {
        hits = onlyLibraries ? [] : (await getStyles()).filter(function (st) { return matches(st.name, q); });
      } else if (item.entity === 'component') {
        const local = onlyLibraries ? [] : (await getComponents()).filter(function (c) { return matches(c.name, q) || matches(c.description, q); });
        const library = enabledFirst(((await searchLibraryComponents(item.query)) || []).concat(await searchKitComponents(item.query)), await libraryInfo());
        const seen = {};
        hits = [];
        for (const c of local.concat(library)) {
          if (c.key && seen[c.key]) continue;
          if (c.key) seen[c.key] = true;
          hits.push(c);
        }
      } else {
        results.push({ entity: item.entity, query: item.query, error: 'entity must be component, variable or style' });
        continue;
      }
      results.push({ entity: item.entity, query: item.query, total: hits.length, results: hits.slice(0, LIMIT) });
    }
    const out = { results: results };
    if (notes.length) out.notes = notes.filter(function (n, i) { return notes.indexOf(n) === i; });
    out.scope = "Components: this file's, the library ones it uses, then Figma's ranked search over team libraries and UI kits, libraries enabled in this file first (import with importComponentByKeyAsync / importComponentSetByKeyAsync). Variables: this file, its enabled team libraries and UI kits (library ones: figma.variables.importVariableByKeyAsync(key)). Styles: this file only; for library styles use get_library_styles.";
    return out;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const SEARCH_DESIGN_SYSTEM_SCRIPT = (query: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    const q = ${JSON.stringify(query)}.toLowerCase();
    const results = { variables: [], styles: [], components: [] };

    // Search local variables
    try {
      const collections = figma.variables.getLocalVariableCollections();
      for (const coll of collections) {
        for (const varId of coll.variableIds) {
          try {
            const v = figma.variables.getVariableById(varId);
            if (v && v.name.toLowerCase().includes(q)) {
              const values = {};
              for (const mode of coll.modes) {
                assignClone(values, mode.name, v.valuesByMode[mode.modeId]);
              }
              results.variables.push({ name: v.name, type: v.resolvedType, collection: coll.name, valuesByMode: values });
            }
          } catch(e) {}
        }
      }
    } catch(e) {}

    // Search local styles
    const styleFns = [
      ['PAINT', 'getLocalPaintStyles'],
      ['TEXT', 'getLocalTextStyles'],
      ['EFFECT', 'getLocalEffectStyles'],
      ['GRID', 'getLocalGridStyles'],
    ];
    for (const [type, fn] of styleFns) {
      try {
        const localStyles = figma[fn]();
        for (const s of localStyles) {
          if (s.name.toLowerCase().includes(q)) {
            results.styles.push({ name: s.name, type: type, description: s.description || null });
          }
        }
      } catch(e) {}
    }

    // Search components on current page
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET' && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT_SET' });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET') && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT' });
      }
      if ('children' in node && results.components.length < 50) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    results.variables = results.variables.slice(0, 50);
    results.styles = results.styles.slice(0, 50);
    results.components = results.components.slice(0, 50);

    return results;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const USE_FIGMA_SCRIPT = (action: string, params: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    const params = ${params};
    const action = ${JSON.stringify(action)};

    switch (action) {
      case 'create_frame': {
        const frame = figma.createFrame();
        frame.name = params.name || 'New Frame';
        if (params.x !== undefined) frame.x = params.x;
        if (params.y !== undefined) frame.y = params.y;
        if (params.cornerRadius !== undefined) frame.cornerRadius = params.cornerRadius;
        // Resize BEFORE setting sizing modes — frame.resize() in Figma resets both sizing modes
        // to FIXED, so it must run first; AUTO/FIXED assignments below then override correctly.
        if (params.width && params.height) frame.resize(params.width, params.height);
        // Auto-layout (sizing mode assignments come AFTER resize so they are not clobbered)
        if (params.layoutMode) { try { frame.layoutMode = params.layoutMode; } catch(e) {} }
        if (params.layoutMode && params.layoutMode !== 'NONE') {
          if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { frame.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { frame.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { frame.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { frame.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        appendChildOrdered(frame, params.parentNodeId);
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) bindFill(frame, params.fills);
        if (params.strokes) bindStroke(frame, params.strokes);
        if (params.strokeWeight !== undefined) frame.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { frame.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
        return { success: true, nodeId: frame.id, name: frame.name, type: 'FRAME' };
      }
      case 'create_text': {
        const text = figma.createText();
        text.name = params.name || 'New Text';
        if (params.x !== undefined) text.x = params.x;
        if (params.y !== undefined) text.y = params.y;
        const family = params.fontFamily || 'Inter';
        const style = params.fontStyle || 'Regular';
        // Always load Regular first — new text nodes start with the default Regular font.
        // Without this, setting characters on a Bold node throws "Inter Regular unloaded".
        const fontLoads = [figma.loadFontAsync({ family, style: 'Regular' })];
        if (style !== 'Regular') fontLoads.push(figma.loadFontAsync({ family, style }));
        return Promise.all(fontLoads).then(() => {
          text.characters = params.characters || 'Text';
          if (params.fontSize) text.fontSize = params.fontSize;
          if (style !== 'Regular') { try { text.fontName = { family, style }; } catch(e) {} }
          appendChildOrdered(text, params.parentNodeId);
          // Apply fills after reparenting — appendChild resets fills
          if (params.fills) bindFill(text, params.fills);
          figma.currentPage.selection = [text];
          return { success: true, nodeId: text.id, name: text.name, type: 'TEXT' };
        });
      }
      case 'create_rectangle': {
        const rect = figma.createRectangle();
        rect.name = params.name || 'New Rectangle';
        rect.resize(params.width || 100, params.height || 100);
        if (params.x !== undefined) rect.x = params.x;
        if (params.y !== undefined) rect.y = params.y;
        if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
        appendChildOrdered(rect, params.parentNodeId);
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) bindFill(rect, params.fills);
        if (params.strokes) bindStroke(rect, params.strokes);
        if (params.strokeWeight !== undefined) rect.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { rect.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [rect];
        return { success: true, nodeId: rect.id, name: rect.name, type: 'RECTANGLE' };
      }
      case 'reparent_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        if (!params.parentNodeId) return { error: 'parentNodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const parent = figma.getNodeById(params.parentNodeId);
        if (!parent) return { error: 'Parent not found: ' + params.parentNodeId };
        if (!('appendChild' in parent)) return { error: 'Parent cannot have children' };
        parent.appendChild(node);
        return { success: true, nodeId: node.id, name: node.name, parentId: parent.id };
      }
      case 'update_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        if (params.name !== undefined) node.name = params.name;
        if (params.visible !== undefined) node.visible = params.visible;
        if (params.opacity !== undefined && 'opacity' in node) node.opacity = params.opacity;
        if (params.x !== undefined && 'x' in node) node.x = params.x;
        if (params.y !== undefined && 'y' in node) node.y = params.y;
        if (params.width !== undefined && params.height !== undefined && 'resize' in node) node.resize(params.width, params.height);
        if (params.fills && 'fills' in node) bindFill(node, params.fills);
        if (params.strokes && 'strokes' in node) bindStroke(node, params.strokes);
        if (params.strokeWeight !== undefined && 'strokeWeight' in node) node.strokeWeight = params.strokeWeight;
        if (params.strokeAlign && 'strokeAlign' in node) { try { node.strokeAlign = params.strokeAlign; } catch(e) {} }
        if (params.cornerRadius !== undefined && 'cornerRadius' in node) node.cornerRadius = params.cornerRadius;
        // Auto-layout (frames only)
        if (node.type === 'FRAME') {
          if (params.layoutMode) { try { node.layoutMode = params.layoutMode; } catch(e) {} }
          if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) node.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { node.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { node.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { node.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { node.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        if (params.characters !== undefined && node.type === 'TEXT') {
          return figma.loadFontAsync(node.fontName || { family: 'Inter', style: 'Regular' }).then(() => {
            node.characters = params.characters;
            return { success: true, nodeId: node.id, name: node.name };
          });
        }
        return { success: true, nodeId: node.id, name: node.name };
      }
      case 'delete_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const name = node.name;
        node.remove();
        return { success: true, deleted: params.nodeId, name: name };
      }
      case 'set_variable': {
        if (!params.name || !params.collectionName) return { error: 'name and collectionName are required' };
        let collection = null;
        try {
          const colls = figma.variables.getLocalVariableCollections();
          collection = colls.find(c => c.name === params.collectionName);
        } catch(e) {}
        if (!collection) {
          collection = figma.variables.createVariableCollection(params.collectionName);
        }
        const resolvedType = params.resolvedType || 'COLOR';
        const variable = figma.variables.createVariable(params.name, collection, resolvedType);
        if (params.value !== undefined) {
          const modeId = collection.modes[0].modeId;
          variable.setValueForMode(modeId, params.value);
        }
        return { success: true, variableId: variable.id, name: variable.name, collection: collection.name };
      }
      default:
        return { error: 'Unknown action: ' + action };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const CREATE_PAGE_SCRIPT = (pageName: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
    const page = figma.createPage();
    page.name = ${JSON.stringify(pageName)};
    // figma.currentPage = page is rejected ("Setting figma.currentPage is not
    // supported"); the async setter is the only way to switch pages.
    return Promise.resolve(figma.setCurrentPageAsync(page)).then(function () {
      return { success: true, pageId: page.id, pageName: page.name };
    }).catch(function (e) {
      return { error: (e && e.message) || String(e) };
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

// ── figma_find: locate nodes by name/type/text (read) ───────────────────────
export const FIND_NODES_SCRIPT = (nodeId: string | null, optsJson: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    var opts = ${optsJson};
    var root;
    ${
      nodeId
        ? `root = figma.getNodeById(${JSON.stringify(nodeId)});
    if (!root) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };`
        : `root = figma.currentPage;`
    }
    return findNodes(root, opts);
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

// ── figma_tree: compact indented outline (read; runs via execWithLogs) ──────
export const TREE_SCRIPT = (nodeId: string | null, maxDepth: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    var root;
    ${
      nodeId
        ? `root = figma.getNodeById(${JSON.stringify(nodeId)});
    if (!root) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };`
        : `root = figma.currentPage;`
    }
    var tree = dumpTree(root, ${maxDepth});
    try { print('walked tree under', root.name || root.id); } catch (e) {}
    return { tree: tree };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

// ── figma_text: set TEXT node characters with auto font-load (write) ────────
export const SET_TEXT_SCRIPT = (nodeId: string, charsJson: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${HELPERS_PREAMBLE}
    var node = figma.getNodeById(${JSON.stringify(nodeId)});
    if (!node) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };
    if (node.type !== 'TEXT') return { error: "Node is not a TEXT node (type: " + node.type + ")" };
    var chars = ${charsJson};
    return setText(node, chars).then(function () {
      return { success: true, nodeId: node.id, name: node.name };
    }).catch(function (e) {
      return { error: e.message || String(e) };
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;
