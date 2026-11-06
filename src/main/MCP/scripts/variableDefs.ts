/**
 * get_variable_defs: the variables and styles a node uses, with their values.
 *
 * The first version returned each variable's raw `valuesByMode` as indented
 * JSON. Semantic tokens are aliases, so an agent got `{Light: {type:
 * "VARIABLE_ALIAS", id: "VariableID:…"}}` instead of a colour: 7.3k characters
 * for a phone screen where Figma's remote tool answered "color/text: #14191f" in
 * 1.7k (measured 2026-11-05). Values are now resolved: for a node, the value it
 * actually renders with (its mode); for the whole file, every mode, with the
 * token an alias points at.
 */

import { PLUGIN_API_UNAVAILABLE } from "./helpers";

export const VARIABLE_DEFS_SCRIPT = (nodeId: string | null) => `
(async function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
    const V = figma.variables;

    const getNode = function (id) {
      return typeof figma.getNodeByIdAsync === 'function' ? figma.getNodeByIdAsync(id) : figma.getNodeById(id);
    };
    const varCache = {}, collCache = {};
    const getVariable = async function (id) {
      if (id in varCache) return varCache[id];
      let v = null;
      try { v = typeof V.getVariableByIdAsync === 'function' ? await V.getVariableByIdAsync(id) : V.getVariableById(id); } catch (e) {}
      return (varCache[id] = v);
    };
    const getCollection = async function (id) {
      if (id in collCache) return collCache[id];
      let c = null;
      try { c = typeof V.getVariableCollectionByIdAsync === 'function' ? await V.getVariableCollectionByIdAsync(id) : V.getVariableCollectionById(id); } catch (e) {}
      return (collCache[id] = c);
    };
    const getStyle = async function (id) {
      try { return typeof figma.getStyleByIdAsync === 'function' ? await figma.getStyleByIdAsync(id) : figma.getStyleById(id); } catch (e) { return null; }
    };

    const r = function (n) { return Math.round(n * 1000) / 1000; };
    const hex = function (c) {
      const h = function (x) { return ('0' + Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16)).slice(-2); };
      return '#' + h(c.r) + h(c.g) + h(c.b) + (c.a !== undefined && c.a < 0.995 ? h(c.a) : '');
    };
    const isAlias = function (v) { return v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS'; };
    const show = function (v) {
      if (v && typeof v === 'object' && 'r' in v) return hex(v);
      if (typeof v === 'number') return String(r(v));
      if (typeof v === 'string') return JSON.stringify(v);
      return String(v);
    };
    const cssName = function (v) {
      const web = v.codeSyntax && v.codeSyntax.WEB;
      return web ? String(web).replace(/^var\\(\\s*/, '').replace(/\\s*\\)$/, '') : null;
    };

    // Follow aliases to a value. A semantic token in mode "Dark" points at a
    // primitive; the primitive's collection usually has one mode, so the mode
    // is matched by name first and falls back to that collection's default.
    async function resolve(value, modeName) {
      let via = null;
      for (let hop = 0; hop < 10 && isAlias(value); hop++) {
        const target = await getVariable(value.id);
        if (!target) return { value: 'unresolved alias', via: via };
        if (!via) via = target.name;
        const coll = await getCollection(target.variableCollectionId);
        let modeId = coll ? coll.defaultModeId : Object.keys(target.valuesByMode)[0];
        if (coll && modeName) {
          const same = coll.modes.find(function (m) { return m.name === modeName; });
          if (same) modeId = same.modeId;
        }
        value = target.valuesByMode[modeId];
      }
      return { value: show(value), via: via };
    }

    const lines = [];
    ${
      nodeId
        ? `
    const target = await getNode(${JSON.stringify(nodeId)});
    if (!target) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };
    const targets = [target];
    `
        : `
    const targets = figma.currentPage.selection ? figma.currentPage.selection.slice() : [];
    `
    }

    if (targets.length === 0) {
      // Nothing to look at: every local variable, all modes.
      const colls = typeof V.getLocalVariableCollectionsAsync === 'function'
        ? await V.getLocalVariableCollectionsAsync()
        : V.getLocalVariableCollections();
      let count = 0;
      for (const coll of colls) {
        lines.push('Collection ' + coll.name + ' (modes ' + coll.modes.map(function (m) { return m.name; }).join(', ') + '):');
        for (const id of coll.variableIds) {
          const v = await getVariable(id);
          if (!v) continue;
          count++;
          const parts = [];
          for (const mode of coll.modes) {
            const res = await resolve(v.valuesByMode[mode.modeId], mode.name);
            parts.push((coll.modes.length > 1 ? mode.name + ' ' : '') + res.value + (res.via ? ' ← ' + res.via : ''));
          }
          const css = cssName(v);
          lines.push('- ' + v.name + ': ' + parts.join('; ') + (css ? ' · var(' + css + ')' : ''));
        }
      }
      const textStyles = typeof figma.getLocalTextStylesAsync === 'function' ? await figma.getLocalTextStylesAsync() : figma.getLocalTextStyles();
      if (textStyles.length) lines.push('Text styles:');
      for (const st of textStyles) lines.push('- ' + st.name + ': ' + st.fontName.family + ' ' + st.fontName.style + ', ' + r(st.fontSize) + 'px');
      if (!count && !textStyles.length) lines.push('This file defines no local variables or text styles. Select a layer or pass nodeId to see the library tokens it uses.');
      return { text: 'Local variables of "' + figma.root.name + '" (nothing selected):\\n' + lines.join('\\n') };
    }

    // ── what the nodes use ──
    const used = {}, order = [];
    const styles = {}, styleOrder = [];
    function collectAliases(value, out) {
      if (!value) return;
      if (Array.isArray(value)) { value.forEach(function (v) { collectAliases(v, out); }); return; }
      if (isAlias(value)) { out.push(value.id); return; }
      if (typeof value === 'object') for (const k in value) collectAliases(value[k], out);
    }
    async function addStyle(id, kind) {
      if (typeof id !== 'string' || !id || styles[id]) return;
      const st = await getStyle(id);
      if (!st) return;
      let def = '';
      if (kind === 'text' && st.fontName) {
        def = st.fontName.family + ' ' + st.fontName.style + ', ' + r(st.fontSize) + 'px';
        if (st.lineHeight && st.lineHeight.unit !== 'AUTO') def += '/' + r(st.lineHeight.value) + (st.lineHeight.unit === 'PERCENT' ? '%' : 'px');
        if (st.letterSpacing && st.letterSpacing.value) def += ', letter-spacing ' + r(st.letterSpacing.value) + (st.letterSpacing.unit === 'PERCENT' ? '%' : 'px');
      }
      styles[id] = { name: st.name, kind: kind, def: def, description: st.description || '' };
      styleOrder.push(id);
    }
    async function walk(node) {
      if (node.visible === false) return;
      const ids = [];
      try { collectAliases(node.boundVariables, ids); } catch (e) {}
      for (const id of ids) {
        if (!used[id]) { used[id] = node; order.push(id); }
      }
      await addStyle(node.textStyleId, 'text');
      await addStyle(node.fillStyleId, 'fill');
      await addStyle(node.strokeStyleId, 'stroke');
      await addStyle(node.effectStyleId, 'effect');
      if ('children' in node && node.children) for (const c of node.children) await walk(c);
    }
    for (const t of targets) await walk(t);

    for (const id of order) {
      const v = await getVariable(id);
      if (!v) continue;
      const consumer = used[id];
      const coll = await getCollection(v.variableCollectionId);
      let modeId = coll ? coll.defaultModeId : null;
      try {
        const modes = consumer.resolvedVariableModes;
        if (modes && modes[v.variableCollectionId]) modeId = modes[v.variableCollectionId];
      } catch (e) {}
      const modeName = coll && modeId ? (coll.modes.find(function (m) { return m.modeId === modeId; }) || {}).name : null;
      let res = await resolve(modeId ? v.valuesByMode[modeId] : undefined, modeName);
      try {
        if (typeof v.resolveForConsumer === 'function') res = { value: show(v.resolveForConsumer(consumer).value), via: res.via };
      } catch (e) {}
      const css = cssName(v);
      const extra = [];
      if (res.via) extra.push('← ' + res.via);
      if (css) extra.push('var(' + css + ')');
      if (coll && coll.modes.length > 1 && modeName) extra.push('mode ' + modeName);
      lines.push('- ' + v.name + ': ' + res.value + (extra.length ? ' · ' + extra.join(' · ') : ''));
    }
    if (lines.length) lines.unshift('Variables (value as the layer renders it):');
    if (styleOrder.length) {
      lines.push('Styles:');
      for (const id of styleOrder) {
        const s = styles[id];
        lines.push('- ' + s.name + ' (' + s.kind + ')' + (s.def ? ': ' + s.def : '') + (s.description ? ' — ' + String(s.description).slice(0, 200) : ''));
      }
    }
    const what = targets.length === 1 ? targets[0].id + ' "' + targets[0].name + '"' : targets.length + ' selected layers';
    if (!lines.length) return { text: 'No variables or styles are bound in ' + what + ' or its layers.' };
    return { text: 'Used by ' + what + ' and its layers:\\n' + lines.join('\\n') };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;
