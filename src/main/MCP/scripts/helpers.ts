/**
 * scripts/helpers.ts — reusable renderer-JS snippets for the MCP scripts.
 *
 * These are JS *source strings* (not Node functions): the Figma webapp renderer
 * cannot `import`, so `HELPERS_PREAMBLE` is inlined into each executeJavaScript
 * IIFE (after `const figma = window.figma`). Every helper is written to be
 * behaviorally identical to the inline boilerplate it replaces — in particular:
 *
 * - `assignClone` reproduces `try { obj[k] = JSON.parse(JSON.stringify(v)); } catch {}`
 *   exactly: the key stays ABSENT on failure (not set to undefined).
 * - `appendChildOrdered` does NOT catch — like the inline code, a throw bubbles
 *   to the script's outer try/catch and becomes `{error}`.
 * - `escapeXml` matches METADATA's `esc`; `escapeAttrQuote` matches FIGJAM's
 *   quote-only escaping (do NOT swap them — FIGJAM must not gain &amp;/&lt;).
 *
 * Helpers reference `window.figma` directly (not the script-local `figma`
 * const) so they are independent of where the preamble is inlined.
 */

export const HELPERS_PREAMBLE = `
    // ── injected MCP script helpers (run in Figma renderer) ──
    function safeClone(v) {
      try { return JSON.parse(JSON.stringify(v)); } catch (e) { return undefined; }
    }
    function assignClone(obj, key, v) {
      try { obj[key] = JSON.parse(JSON.stringify(v)); } catch (e) {}
    }
    function escapeXml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeAttrQuote(s) {
      return String(s == null ? '' : s).replace(/"/g, '&quot;');
    }
    function safeGet(obj, prop, fallback) {
      try { return (prop in obj) ? obj[prop] : fallback; } catch (e) { return fallback; }
    }
    function appendChildOrdered(node, parentId) {
      if (!parentId) return;
      var parent = window.figma.getNodeById(parentId);
      if (parent && 'appendChild' in parent) parent.appendChild(node);
    }
    function bindFill(node, fills) { try { node.fills = fills; } catch (e) {} }
    function bindStroke(node, strokes) { try { node.strokes = strokes; } catch (e) {} }
    function withFonts(node) {
      var figma = window.figma;
      try {
        if (node.fontName === figma.mixed && typeof node.getRangeAllFontNames === 'function') {
          var fonts = node.getRangeAllFontNames(0, node.characters.length);
          return Promise.all(fonts.map(function (f) { return figma.loadFontAsync(f); }));
        }
      } catch (e) {}
      return figma.loadFontAsync(node.fontName || { family: 'Inter', style: 'Regular' });
    }
    function setText(node, chars) {
      return withFonts(node).then(function () { node.characters = chars; return node; });
    }
    function findNodes(root, opts) {
      opts = opts || {};
      var q = opts.query ? String(opts.query).toLowerCase() : null;
      var typeFilter = opts.type ? String(opts.type).toUpperCase() : null;
      var textFilter = opts.text ? String(opts.text).toLowerCase() : null;
      var limit = (typeof opts.limit === 'number' && opts.limit > 0) ? opts.limit : 100;
      var matches = [];
      var truncated = false;
      function walk(node, path) {
        if (matches.length >= limit) { truncated = true; return; }
        var nameOk = !q || (node.name && node.name.toLowerCase().indexOf(q) !== -1);
        var typeOk = !typeFilter || (node.type && node.type.indexOf(typeFilter) === 0);
        var textOk = true;
        if (textFilter) {
          textOk = node.type === 'TEXT' && typeof node.characters === 'string' &&
                   node.characters.toLowerCase().indexOf(textFilter) !== -1;
        }
        if (nameOk && typeOk && textOk) {
          matches.push({ id: node.id, name: node.name, type: node.type, path: path });
        }
        if ('children' in node && node.children) {
          var childPath = path ? (path + '/' + node.name) : node.name;
          for (var i = 0; i < node.children.length; i++) {
            if (matches.length >= limit) { truncated = true; break; }
            try { walk(node.children[i], childPath); } catch (e) {}
          }
        }
      }
      try { walk(root, ''); } catch (e) {}
      return { matches: matches, count: matches.length, truncated: truncated };
    }
    function dumpTree(node, maxDepth) {
      var lines = [];
      function walk(n, depth) {
        if (!n || depth > maxDepth) return;
        var indent = '';
        for (var i = 0; i < depth; i++) indent += '  ';
        lines.push(indent + (n.type || 'NODE') + ' ' + (n.name || '') + ' #' + n.id);
        if ('children' in n && n.children && depth < maxDepth) {
          for (var j = 0; j < n.children.length; j++) {
            try { walk(n.children[j], depth + 1); } catch (e) {}
          }
        }
      }
      walk(node, 0);
      return lines.join('\\n');
    }
`;

/**
 * JS expression (renderer side) evaluating to the error for a tab without
 * `window.figma`, naming the reason instead of a generic "not available".
 *
 * Figma installs `window.figma` itself (early.js + the plugin-permission check
 * that gates "Run plugin"), and only when all of these hold: the page is a
 * file, the file is editable — `INITIAL_OPTIONS.editing_file.can_edit === false`
 * makes the property permanently undefined — the editor has finished loading,
 * and the account may run plugins in this file. A background tab that has not
 * been shown yet never gets that far. Issue #67: a single generic message
 * covered all of these and left the reporter nothing to act on.
 *
 * Each message carries its own advice, so errorHints has no entry for it — a
 * generic "open a file" hint would contradict the view-only case.
 */
export const PLUGIN_API_UNAVAILABLE = `(function () {
      var base = "Figma Plugin API not available — ";
      try {
        var options = window.INITIAL_OPTIONS;
        var file = options && options.editing_file;
        if (!file) {
          return base + "the active tab is not a Figma file (" + location.pathname + "). Open a design file and make it the active tab.";
        }
        if (file.can_edit === false) {
          return base + "this file is open view-only, and Figma does not expose its Plugin API in view-only files. Open a file you can edit, or duplicate this one to your drafts.";
        }
        if (document.visibilityState !== "visible") {
          return base + "the tab is in the background and Figma has not finished loading its editor. Switch to the tab in the app and retry.";
        }
      } catch (e) {}
      return base + "Figma exposes it only once the editor has finished loading and plugins are allowed for this file and account. Wait for the canvas to load; if it persists, check that running a plugin (Plugins menu) works in this file.";
    })()`;
