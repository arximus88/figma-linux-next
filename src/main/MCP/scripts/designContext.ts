/**
 * get_design_context, rendered in the page as compact markup with CSS.
 *
 * The first version returned the Plugin API's own properties as indented JSON:
 * on a 54-node phone screen that was 95k characters, 58% of it indentation and
 * 611 fields holding their default value, with colours as 16-digit floats and
 * variables as bare `VariableID:…` strings. Figma's remote tool answered the
 * same node in 19k, with variable names, text style names and component
 * descriptions an agent can act on (measured 2026-11-05).
 *
 * The output is a reference, not code to paste: one element per visible layer,
 * a `style` attribute with the CSS that layer needs (defaults left out), every
 * bound variable as `var(--name, value)`, then legends for the variables, text
 * styles and components the tree used. Repeated instances of one component are
 * written out once; later ones list only the text that differs. Icon-like
 * vector groups collapse to one `<svg>` element (download_assets has the file).
 */

import { PLUGIN_API_UNAVAILABLE } from "./helpers";

export const DESIGN_CONTEXT_SCRIPT = (nodeId: string | null, depth: number) => `
(async function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: ${PLUGIN_API_UNAVAILABLE} });
    const MAX_DEPTH = ${Math.max(0, Math.floor(depth))};

    const getNode = function (id) {
      return typeof figma.getNodeByIdAsync === 'function' ? figma.getNodeByIdAsync(id) : figma.getNodeById(id);
    };
    const getVariable = async function (id) {
      try {
        return typeof figma.variables.getVariableByIdAsync === 'function'
          ? await figma.variables.getVariableByIdAsync(id)
          : figma.variables.getVariableById(id);
      } catch (e) { return null; }
    };
    const getStyle = async function (id) {
      try {
        return typeof figma.getStyleByIdAsync === 'function' ? await figma.getStyleByIdAsync(id) : figma.getStyleById(id);
      } catch (e) { return null; }
    };
    const getMain = async function (inst) {
      try {
        return typeof inst.getMainComponentAsync === 'function' ? await inst.getMainComponentAsync() : inst.mainComponent;
      } catch (e) { return null; }
    };

    const vars = {}, varOrder = [];
    const textStyles = {}, textStyleOrder = [];
    const otherStyles = {};
    const components = {}, componentOrder = [];
    const instanceTexts = {};
    let hidden = 0, images = 0, icons = 0, nodeCount = 0;

    const plain = function (s) {
      return String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim();
    };
    const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    const escText = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br/>'); };
    const r = function (n) { return Math.round(n * 100) / 100; };
    const px = function (n) { return r(n) + 'px'; };
    const isNum = function (v) { return typeof v === 'number' && isFinite(v); };
    const hex = function (c, alpha) {
      const h = function (x) { return ('0' + Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16)).slice(-2); };
      let s = '#' + h(c.r) + h(c.g) + h(c.b);
      const a = (alpha === undefined ? 1 : alpha) * (c.a === undefined ? 1 : c.a);
      if (a < 0.995) s += h(a);
      return s;
    };

    async function varRef(alias, fallback) {
      if (!alias || !alias.id) return fallback;
      let v = vars[alias.id];
      if (!v) {
        const variable = await getVariable(alias.id);
        if (!variable) return fallback;
        const web = variable.codeSyntax && variable.codeSyntax.WEB;
        const css = web
          ? String(web).replace(/^var\\(\\s*/, '').replace(/\\s*\\)$/, '')
          : '--' + String(variable.name).replace(/[^A-Za-z0-9_-]+/g, '-');
        v = vars[alias.id] = { name: variable.name, css: css, value: fallback, description: variable.description || '' };
        varOrder.push(alias.id);
      }
      return 'var(' + v.css + ', ' + fallback + ')';
    }
    function bound(node, prop) {
      try { return node.boundVariables && node.boundVariables[prop]; } catch (e) { return null; }
    }
    async function num(node, prop, value) {
      return varRef(bound(node, prop), px(value));
    }

    async function paintCss(p) {
      if (!p || p.visible === false) return null;
      const op = p.opacity === undefined ? 1 : p.opacity;
      if (p.type === 'SOLID') return varRef(p.boundVariables && p.boundVariables.color, hex(p.color, op));
      if (String(p.type).indexOf('GRADIENT') === 0) {
        const stops = (p.gradientStops || []).map(function (s) { return hex(s.color, op) + ' ' + Math.round(s.position * 100) + '%'; }).join(', ');
        const kind = p.type === 'GRADIENT_RADIAL' ? 'radial-gradient' : p.type === 'GRADIENT_ANGULAR' ? 'conic-gradient' : 'linear-gradient';
        return kind + '(' + stops + ')';
      }
      if (p.type === 'IMAGE') { images++; return 'image(' + String(p.scaleMode || 'FILL').toLowerCase() + ')'; }
      return String(p.type).toLowerCase();
    }
    async function paintsCss(paints) {
      if (!Array.isArray(paints)) return null;
      const out = [];
      for (const p of paints) { const c = await paintCss(p); if (c) out.push(c); }
      // Figma lists paints bottom to top; CSS lists layers top first.
      return out.length ? out.reverse().join(', ') : null;
    }

    const WEIGHTS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
    function weightOf(style) {
      const key = String(style || '').toLowerCase().replace(/italic|oblique|[\\s_-]/g, '');
      return WEIGHTS[key] || 400;
    }
    function lineHeightCss(lh) {
      if (!lh || lh.unit === 'AUTO') return null;
      return lh.unit === 'PERCENT' ? r(lh.value) + '%' : px(lh.value);
    }
    function letterSpacingCss(ls) {
      if (!ls || !ls.value) return null;
      return ls.unit === 'PERCENT' ? r(ls.value / 100) + 'em' : px(ls.value);
    }
    function fontDef(f) {
      const parts = [f.fontName ? f.fontName.family + ' ' + f.fontName.style : '?'];
      let size = isNum(f.fontSize) ? px(f.fontSize) : '';
      const lh = lineHeightCss(f.lineHeight);
      if (lh) size += '/' + lh;
      if (size) parts.push(size);
      const ls = letterSpacingCss(f.letterSpacing);
      if (ls) parts.push('letter-spacing ' + ls);
      if (f.textCase && f.textCase !== 'ORIGINAL') parts.push('case ' + String(f.textCase).toLowerCase());
      if (f.textDecoration && f.textDecoration !== 'NONE') parts.push(String(f.textDecoration).toLowerCase());
      return parts.join(', ');
    }
    async function textStyleName(id) {
      if (typeof id !== 'string' || !id) return null;
      if (textStyles[id]) return textStyles[id].name;
      const st = await getStyle(id);
      if (!st) return null;
      const bindings = [];
      try {
        for (const [prop, alias] of Object.entries(st.boundVariables || {})) {
          const v = alias && alias.id ? await getVariable(alias.id) : null;
          if (v) bindings.push(prop + '=' + v.name);
        }
      } catch (e) {}
      textStyles[id] = { name: st.name, def: fontDef(st), bindings: bindings, description: st.description || '' };
      textStyleOrder.push(id);
      return st.name;
    }
    async function styleName(id, kind) {
      if (typeof id !== 'string' || !id) return null;
      if (otherStyles[id]) return otherStyles[id].name;
      const st = await getStyle(id);
      if (!st) return null;
      otherStyles[id] = { name: st.name, kind: kind, description: st.description || '' };
      return st.name;
    }

    // Font properties of a run of text, as CSS. A text style replaces them
    // with its name; the legend at the end defines it once.
    async function fontCss(node, seg, out) {
      const styleId = seg ? seg.textStyleId : node.textStyleId;
      const named = await textStyleName(styleId);
      if (named) return named;
      const f = seg || node;
      if (f.fontName && typeof f.fontName === 'object') {
        out.push('font-family:' + (await varRef(bound(node, 'fontFamily'), "'" + f.fontName.family + "'")));
        const w = isNum(f.fontWeight) ? f.fontWeight : weightOf(f.fontName.style);
        if (w !== 400) out.push('font-weight:' + (await varRef(bound(node, 'fontWeight'), String(w))));
        if (/italic|oblique/i.test(f.fontName.style)) out.push('font-style:italic');
      }
      if (isNum(f.fontSize)) out.push('font-size:' + (seg ? px(f.fontSize) : await num(node, 'fontSize', f.fontSize)));
      const lh = lineHeightCss(f.lineHeight);
      if (lh) out.push('line-height:' + (seg || !bound(node, 'lineHeight') ? lh : await varRef(bound(node, 'lineHeight'), lh)));
      const ls = letterSpacingCss(f.letterSpacing);
      if (ls) out.push('letter-spacing:' + ls);
      if (f.textCase === 'UPPER') out.push('text-transform:uppercase');
      else if (f.textCase === 'LOWER') out.push('text-transform:lowercase');
      else if (f.textCase === 'TITLE') out.push('text-transform:capitalize');
      if (f.textDecoration === 'UNDERLINE') out.push('text-decoration:underline');
      else if (f.textDecoration === 'STRIKETHROUGH') out.push('text-decoration:line-through');
      return null;
    }

    const VECTORISH = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, LINE: 1, POLYGON: 1, ELLIPSE: 1, RECTANGLE: 1 };
    const DRAWN = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, POLYGON: 1 };
    // A container whose visible content is only vector shapes, at least one of
    // them a drawn path: an icon or an illustration, useless as markup.
    function vectorGroup(node) {
      if (!('children' in node) || !node.children || !node.children.length) return null;
      let drawn = false, color = null;
      const walk = function (n) {
        if (n.visible === false) return true;
        if (VECTORISH[n.type]) {
          if (DRAWN[n.type]) drawn = true;
          if (!color) {
            const p = (Array.isArray(n.strokes) && n.strokes.find(function (s) { return s.visible !== false && s.type === 'SOLID'; })) ||
              (Array.isArray(n.fills) && n.fills.find(function (s) { return s.visible !== false && s.type === 'SOLID'; }));
            if (p) color = p;
          }
          return true;
        }
        if ((n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE' || n.type === 'COMPONENT') && n.children) {
          return n.children.every(walk);
        }
        return false;
      };
      return node.children.every(walk) && drawn ? { color: color } : null;
    }

    function texts(node, out) {
      if (node.visible === false) return out;
      if (node.type === 'TEXT') out.push(node.characters);
      else if ('children' in node && node.children) node.children.forEach(function (c) { texts(c, out); });
      return out;
    }

    async function element(node, parent, level) {
      if (node.visible === false) { hidden++; return ''; }
      nodeCount++;
      const pad = '  '.repeat(level);
      const st = [];
      const attrs = ['id="' + esc(node.id) + '"'];
      const inFlow = parent && parent.layoutMode && parent.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE';
      const parentRow = parent && parent.layoutMode === 'HORIZONTAL';
      const isText = node.type === 'TEXT';

      // ── size and position ──
      const autoW = isText && node.textAutoResize === 'WIDTH_AND_HEIGHT';
      const autoH = isText && node.textAutoResize !== 'NONE' && node.textAutoResize !== 'TRUNCATE';
      if (inFlow) {
        const sh = node.layoutSizingHorizontal, sv = node.layoutSizingVertical;
        if (sh === 'FILL') st.push(parentRow ? 'flex:1 0 0' : 'align-self:stretch');
        else if (sh === 'FIXED' && !autoW) st.push('width:' + (await num(node, 'width', node.width)));
        if (sv === 'FILL') st.push(parentRow ? 'align-self:stretch' : 'flex:1 0 0');
        else if (sv === 'FIXED' && !autoH) st.push('height:' + (await num(node, 'height', node.height)));
      } else {
        if (parent) st.push('position:absolute', 'left:' + px(node.x), 'top:' + px(node.y));
        if (isNum(node.width) && !autoW) st.push('width:' + (await num(node, 'width', node.width)));
        if (isNum(node.height) && !autoH) st.push('height:' + (await num(node, 'height', node.height)));
      }
      for (const [prop, css] of [['minWidth', 'min-width'], ['maxWidth', 'max-width'], ['minHeight', 'min-height'], ['maxHeight', 'max-height']]) {
        if (isNum(node[prop])) st.push(css + ':' + (await num(node, prop, node[prop])));
      }
      if (isNum(node.rotation) && Math.abs(node.rotation) > 0.01) st.push('transform:rotate(' + r(-node.rotation) + 'deg)');

      // ── icons and illustrations ──
      const vg = vectorGroup(node);
      if (vg) {
        icons++;
        const color = vg.color ? await paintCss(vg.color) : null;
        if (color) st.push('color:' + color);
        attrs.push('name="' + esc(node.name) + '"');
        if (node.type === 'INSTANCE') {
          const main = await getMain(node);
          if (main) attrs.push('component="' + esc(main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name : main.name) + '"');
        }
        return pad + '<svg ' + attrs.join(' ') + (st.length ? ' style="' + esc(st.join(';')) + '"' : '') + '/>\\n';
      }

      // ── auto layout ──
      if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
        st.push('display:flex');
        if (node.layoutMode === 'VERTICAL') st.push('flex-direction:column');
        if (node.layoutWrap === 'WRAP') st.push('flex-wrap:wrap');
        const J = { CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
        const A = { CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' };
        if (J[node.primaryAxisAlignItems]) st.push('justify-content:' + J[node.primaryAxisAlignItems]);
        if (A[node.counterAxisAlignItems]) st.push('align-items:' + A[node.counterAxisAlignItems]);
        if (node.itemSpacing && node.primaryAxisAlignItems !== 'SPACE_BETWEEN') st.push('gap:' + (await num(node, 'itemSpacing', node.itemSpacing)));
        if (node.layoutWrap === 'WRAP' && node.counterAxisSpacing) st.push('row-gap:' + (await num(node, 'counterAxisSpacing', node.counterAxisSpacing)));
        const p = [];
        for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) p.push(node[k] ? await num(node, k, node[k]) : '0');
        if (p.some(function (v) { return v !== '0'; })) {
          let pv = p;
          if (p[0] === p[2] && p[1] === p[3]) pv = p[0] === p[1] ? [p[0]] : [p[0], p[1]];
          else if (p[1] === p[3]) pv = [p[0], p[1], p[2]];
          st.push('padding:' + pv.join(' '));
        }
      } else if (node.layoutMode === 'GRID') {
        st.push('display:grid');
      }

      // ── box ──
      if (node.clipsContent && node.children && node.children.length) st.push('overflow:hidden');
      if (!isText) {
        const fill = await paintsCss(node.fills);
        if (fill) st.push((VECTORISH[node.type] && node.type !== 'RECTANGLE' ? 'fill:' : 'background:') + fill);
        const fs = await styleName(node.fillStyleId, 'fill');
        if (fs) attrs.push('fill-style="' + esc(fs) + '"');
      }
      const radii = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].map(function (k) { return isNum(node[k]) ? node[k] : 0; });
      if (radii.some(function (x) { return x > 0; })) {
        if (radii.every(function (x) { return x === radii[0]; })) st.push('border-radius:' + (await num(node, 'topLeftRadius', radii[0])));
        else st.push('border-radius:' + radii.map(px).join(' '));
      } else if (isNum(node.cornerRadius) && node.cornerRadius > 0) {
        st.push('border-radius:' + (await num(node, 'cornerRadius', node.cornerRadius)));
      }
      const stroke = await paintsCss(node.strokes);
      if (stroke) {
        const w = isNum(node.strokeWeight) ? node.strokeWeight : isNum(node.strokeTopWeight) ? node.strokeTopWeight : 1;
        const dashed = Array.isArray(node.dashPattern) && node.dashPattern.length ? 'dashed' : 'solid';
        if (VECTORISH[node.type] && node.type !== 'RECTANGLE') st.push('stroke:' + stroke, 'stroke-width:' + px(w));
        else st.push((node.strokeAlign === 'OUTSIDE' ? 'outline:' : 'border:') + (await num(node, 'strokeWeight', w)) + ' ' + dashed + ' ' + stroke);
        const ss = await styleName(node.strokeStyleId, 'stroke');
        if (ss) attrs.push('stroke-style="' + esc(ss) + '"');
      }
      if (Array.isArray(node.effects)) {
        const shadows = [];
        for (const e of node.effects) {
          if (e.visible === false) continue;
          if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
            const c = await varRef(e.boundVariables && e.boundVariables.color, hex(e.color));
            shadows.push((e.type === 'INNER_SHADOW' ? 'inset ' : '') + px(e.offset.x) + ' ' + px(e.offset.y) + ' ' + px(e.radius) + (e.spread ? ' ' + px(e.spread) : '') + ' ' + c);
          } else if (e.type === 'LAYER_BLUR') st.push('filter:blur(' + px(e.radius / 2) + ')');
          else if (e.type === 'BACKGROUND_BLUR') st.push('backdrop-filter:blur(' + px(e.radius / 2) + ')');
        }
        if (shadows.length) st.push('box-shadow:' + shadows.join(', '));
        const es = await styleName(node.effectStyleId, 'effect');
        if (es) attrs.push('effect-style="' + esc(es) + '"');
      }
      if (isNum(node.opacity) && node.opacity < 0.995) st.push('opacity:' + r(node.opacity));
      if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
        st.push('mix-blend-mode:' + String(node.blendMode).toLowerCase().replace(/_/g, '-'));
      }

      // ── text ──
      if (isText) {
        const A = { CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
        if (A[node.textAlignHorizontal]) st.push('text-align:' + A[node.textAlignHorizontal]);
        let body = '';
        let segments = null;
        try {
          if (typeof node.getStyledTextSegments === 'function') {
            segments = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'fills', 'textStyleId', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration']);
          }
        } catch (e) { segments = null; }
        if (segments && segments.length > 1) {
          for (const seg of segments) {
            const ss = [];
            const named = await fontCss(node, seg, ss);
            const color = await paintsCss(seg.fills);
            if (color) ss.push('color:' + color);
            body += '<span' + (named ? ' text-style="' + esc(named) + '"' : '') + (ss.length ? ' style="' + esc(ss.join(';')) + '"' : '') + '>' + escText(seg.characters) + '</span>';
          }
        } else {
          const named = await fontCss(node, null, st);
          if (named) attrs.push('text-style="' + esc(named) + '"');
          const color = await paintsCss(node.fills);
          if (color) st.push('color:' + color);
          body = escText(node.characters);
        }
        if (node.name !== node.characters) attrs.push('name="' + esc(node.name) + '"');
        return pad + '<text ' + attrs.join(' ') + (st.length ? ' style="' + esc(st.join(';')) + '"' : '') + '>' + body + '</text>\\n';
      }

      attrs.push('name="' + esc(node.name) + '"');

      // ── components ──
      let tag = String(node.type).toLowerCase().replace(/_/g, '-');
      let children = 'children' in node && node.children ? node.children : [];
      if (node.type === 'INSTANCE') {
        const main = await getMain(node);
        if (main) {
          const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
          const owner = set || main;
          attrs.push('component="' + esc(owner.name) + '"');
          if (set) attrs.push('variant="' + esc(main.name) + '"');
          const key = owner.key || owner.id;
          if (!components[key]) {
            components[key] = { name: owner.name, key: owner.key, remote: !!main.remote, description: owner.description || main.description || '' };
            componentOrder.push(key);
          }
          try {
            const props = [];
            for (const [k, v] of Object.entries(node.componentProperties || {})) {
              if (v.type === 'VARIANT') continue;
              props.push(k.replace(/#[^#]*$/, '') + '=' + (v.type === 'INSTANCE_SWAP' ? 'swap' : v.value));
            }
            if (props.length) attrs.push('props="' + esc(props.join('; ')) + '"');
          } catch (e) {}
          // Written out once per component: later instances list only the text
          // that differs from the first.
          const seen = instanceTexts[main.id];
          const mine = texts(node, []);
          if (seen) {
            const diff = mine.filter(function (t, i) { return t !== seen.texts[i]; });
            attrs.push('same-as="' + esc(seen.id) + '"');
            if (diff.length) attrs.push('texts="' + esc(diff.join(' | ')) + '"');
            children = [];
          } else {
            instanceTexts[main.id] = { id: node.id, texts: mine };
          }
        }
      } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        if (node.description) attrs.push('description="' + esc(String(node.description).slice(0, 300)) + '"');
      }

      const open = pad + '<' + tag + ' ' + attrs.join(' ') + (st.length ? ' style="' + esc(st.join(';')) + '"' : '');
      const visible = children.filter(function (c) { return c.visible !== false; });
      hidden += children.length - visible.length;
      if (!visible.length) return open + '/>\\n';
      if (level >= MAX_DEPTH) return open + ' children="' + visible.length + ' more: call again on this id"/>\\n';
      let xml = open + '>\\n';
      for (const c of visible) {
        try { xml += await element(c, node, level + 1); } catch (e) { xml += pad + '  <!-- ' + esc(c.id) + ': ' + esc(e.message || e) + ' -->\\n'; }
      }
      return xml + pad + '</' + tag + '>\\n';
    }

    let targets;
    ${
      nodeId
        ? `
    const target = await getNode(${JSON.stringify(nodeId)});
    if (!target) return JSON.stringify({ error: "Node not found: " + ${JSON.stringify(nodeId)} + ". Call get_metadata to list the pages and their nodes." });
    if (target.type === 'DOCUMENT' || target.type === 'PAGE') return JSON.stringify({ error: "get_design_context needs a layer, not a " + target.type.toLowerCase() + ". Call get_metadata on the page and pass one of its frames." });
    targets = [target];
    `
        : `
    targets = figma.currentPage.selection;
    if (!targets || targets.length === 0) return JSON.stringify({ error: "No nodes selected. Select a node in Figma or provide a nodeId." });
    `
    }

    let page = targets[0];
    while (page && page.type !== 'PAGE') page = page.parent;
    let out = '<!-- file "' + esc(figma.root.name) + '"' + (page ? ', page "' + esc(page.name) + '" (' + page.id + ')' : '') + ' -->\\n';
    for (const t of targets) out += await element(t, null, 0);

    const legend = [];
    if (varOrder.length) {
      legend.push('Variables (name, CSS variable, value at the first use):');
      for (const id of varOrder) {
        const v = vars[id];
        legend.push('- ' + v.name + ': ' + v.css + ' = ' + v.value + (v.description ? ' (' + String(v.description).slice(0, 200) + ')' : ''));
      }
    }
    if (textStyleOrder.length) {
      legend.push('Text styles (elements with text-style="…" use these):');
      for (const id of textStyleOrder) {
        const s = textStyles[id];
        legend.push('- ' + s.name + ': ' + s.def + (s.bindings.length ? '; variables ' + s.bindings.join(', ') : '') + (s.description ? ' (' + String(s.description).slice(0, 200) + ')' : ''));
      }
    }
    const styleIds = Object.keys(otherStyles);
    if (styleIds.length) {
      legend.push('Styles:');
      for (const id of styleIds) {
        const s = otherStyles[id];
        legend.push('- ' + s.name + ' (' + s.kind + ')' + (s.description ? ': ' + String(s.description).slice(0, 200) : ''));
      }
    }
    if (componentOrder.length) {
      legend.push('Components:');
      for (const key of componentOrder) {
        const c = components[key];
        legend.push('- ' + c.name + (c.remote ? ' (library' + (c.key ? ', key ' + c.key : '') + ')' : '') + (c.description ? ': ' + plain(c.description).slice(0, 400) : ''));
      }
    }
    const notes = [];
    if (icons) notes.push(icons + ' vector group(s) shown as <svg/>; download_assets on the node returns them as SVG files.');
    if (images) notes.push(images + ' image fill(s) shown as image(); download_assets on the node returns the original images.');
    if (hidden) notes.push(hidden + ' hidden layer(s) left out.');
    if (notes.length) legend.push('Notes:', ...notes.map(function (n) { return '- ' + n; }));
    if (legend.length) out += '\\n' + legend.join('\\n') + '\\n';
    return JSON.stringify({ text: out, nodeCount: nodeCount });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;
