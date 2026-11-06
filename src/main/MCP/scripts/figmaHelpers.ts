/**
 * Helpers of Figma's remote use_figma runtime, for the page's own `figma`.
 *
 * Figma's `figma-use` skill teaches agents a few extensions that exist only in
 * the remote MCP's sandbox: `figma.createAutoLayout`, `figma.io.write`, and on
 * nodes `set`, `query`, `matches`, `screenshot`, `tree`, `placeholder`, plus
 * `PageNode.findPlacement`. Agents write them against this app too (12 of 16
 * writing runs in an agent benchmark against Figma's remote MCP, 2026-11-06)
 * and every one cost a round trip on "... is not a function". Semantics follow
 * the skill's typings and a live probe of the remote runtime on 2026-11-06:
 * createAutoLayout is a plain createFrame (white fill, 100×100, "Frame") with
 * the layout mode set and both axes AUTO; set() returns the node and routes
 * width/height through resize(), layoutMode first; query() returns a plain
 * object (no index access) that serializes as {length, _nodes}; tree() prints
 * "TYPE id" lines indented by two spaces, `fields` appended as {k=v ...} with
 * empty values left out; placeholder defaults to false.
 *
 * How it attaches, as measured in the page on 2026-11-06: `window.figma` is
 * frozen, so code gets a Proxy that forwards to it and adds the two figma-level
 * helpers. Nodes are non-extensible and every node type has its own prototype
 * straight on Object.prototype, with its own methods non-writable and
 * non-configurable — but the prototypes accept new properties. So the node
 * helpers are defined (non-enumerable, only where the name is free) on each
 * type's prototype as nodes of that type pass by: anything returned from or
 * passed to a `figma.*` call, the current page's subtree (bounded), and nodes
 * the helpers return. Types the code may reach without passing by (an
 * instance from component.createInstance(), say) are covered by a one-time
 * probe that creates one node of each creatable type and removes it in the
 * same step — run only when the code mentions a node helper, inside
 * use_figma's undo step, so it never outlives the call.
 *
 * The library is built once per page and kept on window; each call gets a
 * fresh sink for screenshots and io.write output.
 */

/** Node helpers whose mention in `code` justifies the one-time type probe. */
export const NODE_HELPER_PATTERN =
  /\.(?:set|query|matches|screenshot|tree|findPlacement)\s*\(|\.placeholder\b/;

/** Most images one use_figma call may return through screenshot()/io.write. */
export const USE_FIGMA_MAX_IMAGES = 10;

/**
 * JS source of an expression that evaluates to the page-wide helper library:
 * `{ begin(figma, wantProbe) -> { api, out } }`. Built once per page.
 */
export const FIGMA_HELPERS_LIBRARY = `(function () {
  var NAMES = ["set", "query", "matches", "screenshot", "tree", "placeholder"];
  var patchedProtos = new WeakSet();
  var patchedTypes = new Set();
  var scannedPages = new WeakSet();
  var placeholders = new WeakMap();
  var state = { out: null, figma: null, probed: false };

  function isNode(v) {
    return !!v && typeof v === "object" && typeof v.id === "string" &&
      typeof v.type === "string" && "removed" in v && "parent" in v;
  }

  function define(proto, name, desc) {
    if (name in proto) return;
    desc.configurable = true;
    desc.enumerable = false;
    if ("value" in desc) desc.writable = true;
    try { Object.defineProperty(proto, name, desc); } catch (e) {}
  }

  function adopt(v) {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length && i < 1000; i++) adopt(v[i]);
      return v;
    }
    if (!isNode(v)) return v;
    var proto = Object.getPrototypeOf(v);
    if (!proto || proto === Object.prototype || patchedProtos.has(proto)) return v;
    patchedProtos.add(proto);
    patchedTypes.add(v.type);
    define(proto, "set", { value: function (props) { return setProps(this, props); } });
    define(proto, "query", { value: function (selector) { return query(this, selector); } });
    define(proto, "matches", { value: function (selector) { return matchesList(this, parseSelector(selector), null); } });
    define(proto, "screenshot", { value: function (opts) { return screenshot(this, opts); } });
    define(proto, "tree", { value: function (opts) { return tree(this, opts); } });
    define(proto, "placeholder", {
      get: function () { return placeholders.get(this) === true; },
      set: function (on) { placeholders.set(this, !!on); },
    });
    if (v.type === "PAGE") define(proto, "findPlacement", { value: function (size) { return findPlacement(this, size); } });
    return v;
  }

  /** Adopt node types found in a subtree, visiting at most \`cap\` nodes. */
  function scan(root, cap) {
    if (!root) return;
    var stack = [root], seen = 0;
    while (stack.length && seen < cap) {
      var n = stack.pop(); seen++;
      adopt(n);
      var kids;
      try { kids = n.children; } catch (e) { kids = null; }
      if (kids) for (var i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }

  function scanPage(page) {
    if (!page || scannedPages.has(page)) return;
    scannedPages.add(page);
    scan(page, 3000);
  }

  /**
   * Create one node of every creatable type and remove it again, so their
   * prototypes get the helpers. Each attempt is guarded: FigJam-only creators
   * throw in Design and the other way round, and nothing can be created in a
   * file the user may only view.
   */
  function probe(figma) {
    if (state.probed) return;
    state.probed = true;
    var made = [];
    function keep(n) { if (n) { made.push(n); adopt(n); } return n; }
    function tryMake(type, fn) {
      if (patchedTypes.has(type)) return null;
      try { return keep(fn()); } catch (e) { return null; }
    }
    var simple = {
      FRAME: "createFrame", RECTANGLE: "createRectangle", ELLIPSE: "createEllipse", LINE: "createLine",
      POLYGON: "createPolygon", STAR: "createStar", VECTOR: "createVector", TEXT: "createText",
      SECTION: "createSection", SLICE: "createSlice", STICKY: "createSticky",
      SHAPE_WITH_TEXT: "createShapeWithText", CONNECTOR: "createConnector", CODE_BLOCK: "createCodeBlock",
    };
    Object.keys(simple).forEach(function (type) {
      tryMake(type, function () { return figma[simple[type]](); });
    });
    try {
      var page = figma.currentPage;
      var comp = null;
      try { comp = keep(figma.createComponent()); } catch (e) {}
      if (comp) tryMake("INSTANCE", function () { return comp.createInstance(); });
      tryMake("COMPONENT_SET", function () { return figma.combineAsVariants([keep(figma.createComponent())], page); });
      tryMake("GROUP", function () { return figma.group([keep(figma.createRectangle())], page); });
      tryMake("BOOLEAN_OPERATION", function () {
        return figma.union([keep(figma.createRectangle()), keep(figma.createRectangle())], page);
      });
      var table = tryMake("TABLE", function () { return figma.createTable(1, 1); });
      if (table) { try { adopt(table.cellAt(0, 0)); } catch (e) {} }
    } catch (e) {}
    for (var i = made.length - 1; i >= 0; i--) {
      try { if (!made[i].removed) made[i].remove(); } catch (e) {}
    }
  }

  // ── set ───────────────────────────────────────────────────────────────
  function setProps(node, props) {
    if (!props || typeof props !== "object") return node;
    if ("layoutMode" in props) node.layoutMode = props.layoutMode;
    var sized = false;
    Object.keys(props).forEach(function (k) {
      if (k === "layoutMode") return;
      if (k === "width" || k === "height") {
        if (sized) return;
        sized = true;
        node.resize("width" in props ? props.width : node.width, "height" in props ? props.height : node.height);
        return;
      }
      node[k] = props[k];
    });
    return node;
  }

  // ── selectors ─────────────────────────────────────────────────────────
  var ID_RE = /^I?\\d+:\\d+(?:;I?\\d+:\\d+)*/;
  var parseCache = new Map();

  function parseSelector(src) {
    if (typeof src !== "string" || !src.trim()) throw new Error("query: selector must be a non-empty string");
    var hit = parseCache.get(src);
    if (hit) return hit;
    var p = { s: src, i: 0 };
    var list = parseList(p);
    skipWs(p);
    if (p.i < p.s.length) fail(p, "unexpected '" + p.s[p.i] + "'");
    parseCache.set(src, list);
    return list;
  }
  function fail(p, msg) { throw new Error("query: " + msg + " at " + p.i + " in \\"" + p.s + "\\""); }
  function skipWs(p) { var had = false; while (p.i < p.s.length && /\\s/.test(p.s[p.i])) { p.i++; had = true; } return had; }
  function parseList(p) {
    var list = [parseComplex(p)];
    skipWs(p);
    while (p.s[p.i] === ",") { p.i++; list.push(parseComplex(p)); skipWs(p); }
    return list;
  }
  function parseComplex(p) {
    skipWs(p);
    var parts = [{ c: null, s: parseCompound(p) }];
    for (;;) {
      var ws = skipWs(p), ch = p.s[p.i], comb = null;
      if (ch === ">" || ch === "+" || ch === "~") { comb = ch; p.i++; skipWs(p); }
      else if (ws && ch !== undefined && ch !== "," && ch !== ")") comb = " ";
      else break;
      parts.push({ c: comb, s: parseCompound(p) });
    }
    return parts;
  }
  function parseCompound(p) {
    var c = { type: null, id: null, attrs: [], pseudos: [] }, any = false, m;
    for (;;) {
      var ch = p.s[p.i];
      if (ch === "*") { p.i++; any = true; continue; }
      if (ch === "#" || (!any && c.type === null && c.id === null && (m = ID_RE.exec(p.s.slice(p.i))))) {
        if (ch === "#") { p.i++; m = ID_RE.exec(p.s.slice(p.i)); if (!m) fail(p, "expected a node id after #"); }
        c.id = m[0]; p.i += m[0].length; any = true; continue;
      }
      if (ch !== undefined && /[A-Za-z_]/.test(ch) && c.type === null && !any) {
        m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(p.s.slice(p.i));
        c.type = m[0].toUpperCase(); p.i += m[0].length; any = true; continue;
      }
      if (ch === "[") { p.i++; c.attrs.push(parseAttr(p)); any = true; continue; }
      if (ch === ":") { p.i++; c.pseudos.push(parsePseudo(p)); any = true; continue; }
      break;
    }
    if (!any) fail(p, "expected a selector");
    return c;
  }
  function parseAttr(p) {
    skipWs(p);
    var start = p.i;
    // A path ends at "=", "]", whitespace, or the "*", "^", "$" of an operator
    // ("*" alone is a wildcard step: fills.*.type).
    while (p.i < p.s.length && !/[=\\]\\s]/.test(p.s[p.i]) &&
      !(/[*^$]/.test(p.s[p.i]) && p.s[p.i + 1] === "=")) p.i++;
    var path = p.s.slice(start, p.i);
    if (!path) fail(p, "expected an attribute name");
    skipWs(p);
    var op = null, value = null;
    var two = p.s.slice(p.i, p.i + 2);
    if (two === "*=" || two === "^=" || two === "$=") { op = two; p.i += 2; }
    else if (p.s[p.i] === "=") { op = "="; p.i++; }
    if (op) {
      skipWs(p);
      var q = p.s[p.i];
      if (q === '"' || q === "'") {
        var end = p.s.indexOf(q, p.i + 1);
        if (end < 0) fail(p, "unterminated string");
        value = p.s.slice(p.i + 1, end); p.i = end + 1;
      } else {
        var vs = p.i;
        while (p.i < p.s.length && p.s[p.i] !== "]") p.i++;
        value = p.s.slice(vs, p.i).trim();
      }
      skipWs(p);
    }
    if (p.s[p.i] !== "]") fail(p, "expected ]");
    p.i++;
    return { path: path.split("."), op: op, value: value };
  }
  function parsePseudo(p) {
    var m = /^[a-z-]+/.exec(p.s.slice(p.i));
    if (!m) fail(p, "expected a pseudo-class");
    var name = m[0]; p.i += name.length;
    if (name === "first-child" || name === "last-child") return { name: name };
    if (p.s[p.i] !== "(") fail(p, ":" + name + " needs (...)");
    p.i++;
    var arg;
    if (name === "not" || name === "is" || name === "where") { arg = parseList(p); skipWs(p); }
    else if (name === "nth-child") {
      var close = p.s.indexOf(")", p.i);
      if (close < 0) fail(p, "expected )");
      arg = parseNth(p.s.slice(p.i, close).trim(), p); p.i = close;
    } else fail(p, "unsupported pseudo-class :" + name);
    if (p.s[p.i] !== ")") fail(p, "expected )");
    p.i++;
    return { name: name, arg: arg };
  }
  function parseNth(t, p) {
    t = t.replace(/\\s+/g, "").toLowerCase();
    if (t === "odd") return { a: 2, b: 1 };
    if (t === "even") return { a: 2, b: 0 };
    if (/^[+-]?\\d+$/.test(t)) return { a: 0, b: parseInt(t, 10) };
    var m = /^([+-]?\\d*)n([+-]\\d+)?$/.exec(t);
    if (!m) fail(p, "bad :nth-child argument " + t);
    var a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : parseInt(m[1], 10);
    return { a: a, b: m[2] ? parseInt(m[2], 10) : 0 };
  }

  function read(obj, key) {
    try { return obj == null ? undefined : obj[key]; } catch (e) { return undefined; }
  }
  /** Every value at a dot path; "*" fans out over array items / object values. */
  function valuesAt(node, path) {
    var cur = [node];
    for (var i = 0; i < path.length; i++) {
      var next = [];
      for (var j = 0; j < cur.length; j++) {
        var o = cur[j];
        if (o == null) continue;
        if (path[i] === "*") {
          if (Array.isArray(o)) next.push.apply(next, o);
          else if (typeof o === "object") Object.keys(o).forEach(function (k) { next.push(read(o, k)); });
        } else next.push(read(o, path[i]));
      }
      cur = next;
    }
    return cur;
  }
  function valueAt(node, key) { return valuesAt(node, String(key).split("."))[0]; }
  function asText(v) {
    if (v && typeof v === "object") return typeof v.id === "string" ? v.id : JSON.stringify(v);
    return String(v);
  }
  function attrMatches(node, a) {
    var vals = valuesAt(node, a.path);
    if (!a.op) return vals.some(function (v) { return v !== undefined && v !== null; });
    return vals.some(function (v) {
      if (v === undefined || v === null) return false;
      var t = asText(v);
      if (a.op === "=") return t === a.value || (typeof v === "number" && v === Number(a.value));
      if (a.op === "*=") return t.indexOf(a.value) >= 0;
      if (a.op === "^=") return t.indexOf(a.value) === 0;
      return t.length >= a.value.length && t.slice(t.length - a.value.length) === a.value;
    });
  }
  function siblingIndex(node) {
    var parent = read(node, "parent"), kids = parent && read(parent, "children");
    if (!kids) return { i: 0, n: 1 };
    for (var i = 0; i < kids.length; i++) if (kids[i].id === node.id) return { i: i, n: kids.length };
    return { i: -1, n: kids.length };
  }
  function compoundMatches(node, c, scope) {
    if (c.type && node.type !== c.type) return false;
    if (c.id && node.id !== c.id) return false;
    for (var i = 0; i < c.attrs.length; i++) if (!attrMatches(node, c.attrs[i])) return false;
    for (var j = 0; j < c.pseudos.length; j++) {
      var ps = c.pseudos[j];
      if (ps.name === "not") { if (matchesList(node, ps.arg, scope)) return false; continue; }
      if (ps.name === "is" || ps.name === "where") { if (!matchesList(node, ps.arg, scope)) return false; continue; }
      var at = siblingIndex(node);
      if (ps.name === "first-child" && at.i !== 0) return false;
      if (ps.name === "last-child" && at.i !== at.n - 1) return false;
      if (ps.name === "nth-child") {
        var pos = at.i + 1, a = ps.arg.a, b = ps.arg.b;
        if (a === 0 ? pos !== b : ((pos - b) / a < 0 || (pos - b) % a !== 0)) return false;
      }
    }
    return true;
  }
  /** Parent within the query's scope: the scope node itself is the last ancestor. */
  function up(node, scope) { return node === scope ? null : read(node, "parent"); }
  function prevSiblings(node) {
    var parent = read(node, "parent"), kids = parent && read(parent, "children");
    if (!kids) return [];
    var out = [];
    for (var i = 0; i < kids.length && kids[i].id !== node.id; i++) out.unshift(kids[i]);
    return out;
  }
  function matchFrom(node, parts, k, scope) {
    if (!compoundMatches(node, parts[k].s, scope)) return false;
    if (k === 0) return true;
    var comb = parts[k].c, p;
    if (comb === ">") { p = up(node, scope); return !!p && matchFrom(p, parts, k - 1, scope); }
    if (comb === " ") {
      for (p = up(node, scope); p; p = up(p, scope)) if (matchFrom(p, parts, k - 1, scope)) return true;
      return false;
    }
    if (node === scope) return false;
    var prev = prevSiblings(node);
    if (comb === "+") return prev.length > 0 && matchFrom(prev[0], parts, k - 1, scope);
    for (var i = 0; i < prev.length; i++) if (matchFrom(prev[i], parts, k - 1, scope)) return true;
    return false;
  }
  function matchesList(node, list, scope) {
    for (var i = 0; i < list.length; i++) if (matchFrom(node, list[i], list[i].length - 1, scope)) return true;
    return false;
  }
  function query(scope, selector) {
    var list = parseSelector(selector), found = [];
    var kids = read(scope, "children");
    var stack = kids ? Array.prototype.slice.call(kids).reverse() : [];
    while (stack.length) {
      var n = stack.pop();
      if (matchesList(n, list, scope)) found.push(adopt(n));
      var c = read(n, "children");
      if (c) for (var i = c.length - 1; i >= 0; i--) stack.push(c[i]);
    }
    return makeResult(found);
  }

  // ── QueryResult ───────────────────────────────────────────────────────
  function makeResult(nodes) {
    var r = {
      length: nodes.length,
      _nodes: nodes,
      first: function () { return nodes[0] || null; },
      last: function () { return nodes[nodes.length - 1] || null; },
      toArray: function () { return nodes.slice(); },
      each: function (fn) { nodes.forEach(fn); return r; },
      map: function (fn) { return nodes.map(fn); },
      filter: function (fn) { return makeResult(nodes.filter(fn)); },
      values: function (keys) {
        return nodes.map(function (n) {
          var o = {};
          (keys || []).forEach(function (k) { o[k] = valueAt(n, k); });
          return o;
        });
      },
      set: function (props) { nodes.forEach(function (n) { setProps(n, props); }); return r; },
      query: function (selector) {
        var seen = new Set(), all = [];
        nodes.forEach(function (n) {
          query(n, selector)._nodes.forEach(function (x) { if (!seen.has(x.id)) { seen.add(x.id); all.push(x); } });
        });
        return makeResult(all);
      },
      toJSON: function () { return { length: nodes.length, _nodes: nodes }; },
    };
    r[Symbol.iterator] = function () { return nodes[Symbol.iterator](); };
    return r;
  }

  // ── screenshot / io ───────────────────────────────────────────────────
  function toBase64(bytes) {
    var bin = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function pushImage(name, mimeType, bytes) {
    var out = state.out;
    if (!out) return;
    if (out.images.length >= ${USE_FIGMA_MAX_IMAGES}) {
      out.notes.push("Image " + name + " was dropped: at most ${USE_FIGMA_MAX_IMAGES} images per use_figma call.");
      return;
    }
    out.images.push({ name: name, mimeType: mimeType, data: toBase64(bytes) });
  }
  function screenshot(node, opts) {
    opts = opts || {};
    var w = node.width || 0, h = node.height || 0, longer = Math.max(w, h);
    var scale = typeof opts.scale === "number" ? opts.scale : (longer > 0 ? Math.min(0.5, 1024 / longer) : 0.5);
    return node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
      contentsOnly: opts.contentsOnly !== false,
    }).then(function (bytes) {
      var caption = node.name + " (" + Math.round(w) + "x" + Math.round(h) + " at " +
        Math.round(node.x || 0) + "," + Math.round(node.y || 0) + ").png";
      pushImage(caption, "image/png", bytes);
    });
  }
  var IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  var io = Object.freeze({
    write: function (path, data) {
      path = String(path);
      var ext = path.split(".").pop().toLowerCase();
      var bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (bytes && IMAGE_TYPES[ext]) { pushImage(path, IMAGE_TYPES[ext], bytes); return; }
      if (state.out) state.out.files.push({ path: path, text: bytes ? "<" + bytes.length + " bytes>" : String(data) });
    },
  });

  // ── tree / findPlacement / createAutoLayout ───────────────────────────
  // Enum values (VERTICAL, SOLID) print bare, text quoted — as the remote
  // tree() does: {name="Col" layoutMode=VERTICAL}, and {name="R"} too.
  var TEXT_FIELDS = { name: 1, characters: 1, description: 1 };
  function fieldText(v, field) {
    var last = String(field).split(".").pop();
    if (typeof v === "string") return !TEXT_FIELDS[last] && /^[A-Z][A-Z0-9_]*$/.test(v) ? v : JSON.stringify(v);
    if (v && typeof v === "object") return typeof v.id === "string" && typeof v.type === "string" ? v.id : JSON.stringify(v);
    return String(v);
  }
  function tree(node, opts) {
    opts = opts || {};
    var maxDepth = typeof opts.maxDepth === "number" ? opts.maxDepth : 10;
    var maxChildren = typeof opts.maxChildren === "number" ? opts.maxChildren : 100;
    var fields = Array.isArray(opts.fields) ? opts.fields : [];
    var lines = [];
    (function walk(n, depth) {
      var pad = new Array(depth + 1).join("  ");
      var line = pad + n.type + " " + n.id;
      var parts = [];
      fields.forEach(function (f) {
        var v = valueAt(n, f);
        if (v === undefined || v === null || v === "") return;
        parts.push(f + "=" + fieldText(v, f));
      });
      if (parts.length) line += " {" + parts.join(" ") + "}";
      lines.push(line);
      var kids = read(n, "children");
      if (!kids || !kids.length) return;
      if (depth + 1 > maxDepth) { lines.push(pad + "  … " + kids.length + " children"); return; }
      for (var i = 0; i < kids.length && i < maxChildren; i++) walk(kids[i], depth + 1);
      if (kids.length > maxChildren) lines.push(pad + "  … " + (kids.length - maxChildren) + " more");
    })(node, 0);
    return lines.join("\\n");
  }
  function findPlacement(page, size) {
    var figma = state.figma;
    if (figma && page !== figma.currentPage) throw new Error("findPlacement is only callable on the current page");
    var w = (size && size.width) || 0, h = (size && size.height) || 0;
    var right = null, top = null;
    (page.children || []).forEach(function (c) {
      var b = read(c, "absoluteBoundingBox") || { x: c.x, y: c.y, width: c.width, height: c.height };
      if (!b) return;
      right = right === null ? b.x + b.width : Math.max(right, b.x + b.width);
      top = top === null ? b.y : Math.min(top, b.y);
    });
    if (right === null) return { x: 0, y: 0, width: w, height: h };
    return { x: Math.round(right + 40), y: Math.round(top), width: w, height: h };
  }
  function createAutoLayout(direction, props) {
    if (direction && typeof direction === "object") { props = direction; direction = undefined; }
    var frame = adopt(state.figma.createFrame());
    frame.layoutMode = direction === "VERTICAL" ? "VERTICAL" : "HORIZONTAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "AUTO";
    if (props) setProps(frame, props);
    return frame;
  }

  // ── the figma the code sees ───────────────────────────────────────────
  function after(v) {
    if (v && typeof v.then === "function") {
      return v.then(function (x) { adopt(x); if (isNode(x) && x.type === "PAGE") scanPage(x); return x; });
    }
    return adopt(v);
  }
  function makeApi(figma) {
    var wrapped = new Map();
    var extra = { createAutoLayout: createAutoLayout, io: io };
    return new Proxy({}, {
      get: function (_, k) {
        if (Object.prototype.hasOwnProperty.call(extra, k) && !(k in figma)) return extra[k];
        var v = figma[k];
        if (typeof v !== "function") return adopt(v);
        var w = wrapped.get(k);
        if (!w) {
          w = function () {
            for (var i = 0; i < arguments.length; i++) adopt(arguments[i]);
            var r = after(v.apply(figma, arguments));
            if (k === "setCurrentPageAsync" && r && typeof r.then === "function") {
              return r.then(function (x) { scanPage(figma.currentPage); return x; });
            }
            return r;
          };
          wrapped.set(k, w);
        }
        return w;
      },
      set: function (_, k, v) { figma[k] = v; return true; },
      has: function (_, k) { return k in figma || Object.prototype.hasOwnProperty.call(extra, k); },
    });
  }

  return {
    begin: function (figma, wantProbe) {
      var out = { images: [], files: [], notes: [] };
      state.out = out;
      state.figma = figma;
      try { adopt(figma.root); } catch (e) {}
      try { scanPage(figma.currentPage); } catch (e) {}
      if (wantProbe) { try { probe(figma); } catch (e) {} }
      return { api: makeApi(figma), out: out };
    },
    end: function () { state.out = null; },
  };
})()`;
