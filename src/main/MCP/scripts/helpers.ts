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
 * Renderer-side function body shared by PLUGIN_API_STATE and
 * PLUGIN_API_UNAVAILABLE: why `window.figma` is missing, as
 * `{ blocked, reason }`. `blocked` means it will not appear however long we
 * wait; otherwise the editor is still on its way.
 *
 * Figma installs `window.figma` itself, and the rules below are read from its
 * bundle (2026-10-15), not guessed:
 *   - early.js defines the property with a getter that returns undefined
 *     forever when `editing_file.can_edit === false` — Dev Mode included, so
 *     Dev seats and files shared as "can view" never get it;
 *   - the installer waits for the editor to load, then requires, in the design
 *     editor: a team or org file, not read-only, `canRunExtensions` (the org
 *     may turn plugins off); in Dev Mode: full Dev Mode access and
 *     `can_export`; Sites files are excluded.
 * `canRunExtensions` is not on the page, so "plugins are off" stays the
 * fallback. Issue #67: one generic message used to cover all of these.
 */
const PLUGIN_API_DIAGNOSIS = `
      try {
        var options = window.INITIAL_OPTIONS;
        var file = options && options.editing_file;
        if (!file) {
          return { blocked: true, reason: "the active tab is not a Figma file (" + location.pathname + "). Open a design file and make it the active tab." };
        }
        if (file.can_edit === false) {
          return { blocked: true, reason: "you can only view this file (a Dev or View seat, or a file shared with you as \\"can view\\"). Figma never exposes its Plugin API without edit access, Dev Mode included, so this local server cannot read the file. Ask for edit access, duplicate the file to your drafts, or use Figma's own remote MCP server, which works with view access." };
        }
        if (file.editor_type === "sites") {
          return { blocked: true, reason: "Figma does not expose its Plugin API in Sites files." };
        }
        var devMode = new URLSearchParams(location.search).get("m") === "dev";
        if (devMode && file.can_access_full_dev_mode === false) {
          return { blocked: true, reason: "the file is open in Dev Mode and your seat has no full Dev Mode access, which Figma requires for its Plugin API there. Switch to the design editor (Shift+D)." };
        }
        if (devMode && file.can_export === false) {
          return { blocked: true, reason: "the file is open in Dev Mode and copying/exporting is restricted in it; Figma then withholds its Plugin API. Switch to the design editor (Shift+D)." };
        }
        if (file.team_id == null && file.parent_org_id == null) {
          return { blocked: true, reason: "the file belongs to no team or organization, and Figma exposes its Plugin API only in team and org files. Move it into a team." };
        }
        if (document.visibilityState !== "visible") {
          return { blocked: false, reason: "the tab is in the background and Figma has not finished loading its editor. Switch to the tab in the app and retry." };
        }
      } catch (e) {}
      return { blocked: false, reason: "Figma exposes it only once the editor has finished loading and plugins are allowed for this file and account. Wait for the canvas to load; if it persists, check that running a plugin (Plugins menu) works in this file — an organization can turn plugins off." };
`;

/** JS expression (renderer side): `"ready"`, `"blocked"` or `"pending"`. */
export const PLUGIN_API_STATE = `(function () {
      if (window.figma) return "ready";
      return (function () {${PLUGIN_API_DIAGNOSIS}})().blocked ? "blocked" : "pending";
    })()`;

/**
 * Wrap a tool script so it first waits, in the page, for `window.figma`.
 *
 * Figma installs it a second or two after a tab comes to the front or a file
 * finishes loading; a call landing in that gap used to fail with "not
 * available" though a retry would have worked. The wait runs in the same
 * page as the script: polling from main as a separate call raced tab
 * switches — the probe saw the old tab ready, the script then ran in the new
 * one. Stops early when the API is never coming (PLUGIN_API_STATE "blocked");
 * after `waitMs` the script runs anyway and reports why.
 */
export function withPluginApiWait(script: string, waitMs: number): string {
  return `(function () {
  var deadline = Date.now() + ${waitMs};
  return new Promise(function (resolve) {
    (function poll() {
      if (${PLUGIN_API_STATE} !== "pending" || Date.now() >= deadline) resolve();
      else setTimeout(poll, 250);
    })();
  }).then(function () {
    return (${script});
  });
})()`;
}

/**
 * JS expression (renderer side) evaluating to the error for a tab without
 * `window.figma`, naming the reason. Each message carries its own advice, so
 * errorHints has no entry for it — a generic "open a file" hint would
 * contradict the view-only case.
 */
export const PLUGIN_API_UNAVAILABLE = `("Figma Plugin API not available — " + (function () {${PLUGIN_API_DIAGNOSIS}})().reason)`;
