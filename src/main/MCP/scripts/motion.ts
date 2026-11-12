/**
 * get_motion_context: the animation on a layer, read in the page (issue #89).
 *
 * Figma's Plugin API exposes motion as `node.manualKeyframeTracks` (keyframes
 * per animatable field), `node.animationStyles` (applied presets and custom
 * styles) and `node.timelines` (the containing top-level frame's duration).
 * Shapes below were read from a live file on 2026-11-13: values arrive as
 * float32 (0.4000000059604645), every easing carries its cubic bezier, and a
 * preset's name is a translation key (`motion.preset_name.position`).
 *
 * The answer is JSON an agent can turn into CSS or a motion library: times in
 * seconds, easings as CSS timing functions, each field with the CSS property
 * it corresponds to and how its value composes with the layer's own.
 */

import { PLUGIN_API_UNAVAILABLE } from "./helpers";

/** How many animated layers one call describes; a recursive read of a page-sized frame is capped. */
export const MOTION_MAX_NODES = 200;

export const MOTION_CONTEXT_SCRIPT = (nodeId: string | null, recursive: boolean) => `
(async function () {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
    const RECURSIVE = ${recursive ? "true" : "false"};
    const MAX = ${MOTION_MAX_NODES};

    let roots;
    ${
      nodeId
        ? `
    const target = typeof figma.getNodeByIdAsync === 'function'
      ? await figma.getNodeByIdAsync(${JSON.stringify(nodeId)})
      : figma.getNodeById(${JSON.stringify(nodeId)});
    if (!target) return { error: "Node not found: " + ${JSON.stringify(nodeId)} };
    if (target.type === 'DOCUMENT' || target.type === 'PAGE') return { error: "get_motion_context needs a layer, not a " + target.type.toLowerCase() + ". Pass a frame; get_metadata lists a page's frames." };
    roots = [target];`
        : `
    roots = figma.currentPage.selection;
    if (!roots || roots.length === 0) return { error: "No nodes selected. Select a layer in Figma or provide a nodeId." };`
    }

    const round = function (n) { return typeof n === 'number' && isFinite(n) ? Math.round(n * 1000) / 1000 : n; };
    const clean = function (v) {
      if (typeof v === 'number') return round(v);
      if (Array.isArray(v)) return v.map(clean);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o; }
      return v;
    };
    // A keyframe easing as a CSS timing function where one exists.
    const easingCss = function (e) {
      if (!e || !e.type) return undefined;
      if (e.type === 'LINEAR') return 'linear';
      if (e.type === 'HOLD') return 'hold (keep the previous value, then jump)';
      const s = e.easingFunctionSpring;
      if (s) return 'spring(' + Object.keys(s).map(function (k) { return k + ' ' + round(s[k]); }).join(', ') + ')';
      const b = e.easingFunctionCubicBezier;
      if (b) return 'cubic-bezier(' + [b.x1, b.y1, b.x2, b.y2].map(round).join(', ') + ')';
      return String(e.type).toLowerCase();
    };
    // What a keyframe field means in CSS terms.
    const FIELDS = {
      TRANSLATION_X: 'translateX, px, added to the layer position',
      TRANSLATION_Y: 'translateY, px, added to the layer position',
      TRANSLATION_XY: 'translate, px, added to the layer position',
      ROTATION: 'rotate, degrees, added to the layer rotation; Figma counts counter-clockwise as positive, CSS clockwise: negate it',
      SCALE_X: 'scaleX, multiplier of the layer scale',
      SCALE_Y: 'scaleY, multiplier of the layer scale',
      SCALE_XY: 'scale, multiplier of the layer scale',
      OPACITY: 'opacity, 0-1',
      CORNER_RADIUS: 'border-radius, px',
      STROKE_WEIGHT: 'border-width, px',
      STACK_SPACING: 'gap, px',
      WIDTH: 'width, px',
      HEIGHT: 'height, px',
      PATH_TRIM_START: 'path trim start, 0-1 (stroke-dashoffset on a normalised path)',
      PATH_TRIM_END: 'path trim end, 0-1 (stroke-dasharray on a normalised path)',
    };
    const value = function (v) { return v && typeof v === 'object' && 'value' in v ? clean(v.value) : clean(v); };
    const track = function (name, t) {
      if (!t || !Array.isArray(t.keyframes)) return clean(t);
      const out = {};
      if (FIELDS[name]) out.css = FIELDS[name];
      if (t.baseValue !== undefined) out.restingValue = value(t.baseValue);
      out.keyframes = t.keyframes.map(function (k, i) {
        const kf = { time: round(k.timelinePosition), value: value(k.value) };
        // The first keyframe has nothing to ease from.
        if (i > 0) { const e = easingCss(k.easing); if (e) kf.easing = e; }
        return kf;
      });
      return out;
    };
    // fills / strokes / effects hold tracks per paint or effect index.
    const tracks = function (all) {
      const out = {};
      for (const name of Object.keys(all || {})) {
        const t = all[name];
        if (t && Array.isArray(t.keyframes)) { out[name] = track(name, t); continue; }
        const nested = {};
        const walk = function (o, path) {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o.keyframes)) { nested[path] = track(path, o); return; }
          for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k);
        };
        walk(t, '');
        if (Object.keys(nested).length) out[name] = nested;
      }
      return out;
    };

    let presets = [];
    try { presets = figma.motion.figmaAnimationStyles(); } catch (e) {}
    let custom = null;
    const styleInfo = async function (s) {
      const out = { kind: s.type === 'CUSTOM' ? 'custom style' : 'Figma preset' };
      const preset = presets.find(function (p) { return p.name === s.name; });
      out.name = preset ? preset.styleId : s.name;
      if (s.type === 'CUSTOM') {
        try {
          if (custom === null) custom = await figma.getLocalCustomAnimationStylesAsync();
          const local = custom.find(function (c) { return c.id === s.styleId || c.key === s.styleId; });
          if (local) { out.name = local.name; if (local.description) out.description = local.description; }
        } catch (e) {}
      }
      out.startsAt = round(s.timelineOffset || 0);
      out.duration = round(s.duration);
      const props = clean(s.props || {});
      if (props.easing) props.easing = easingCss(s.props.easing) || props.easing;
      out.props = props;
      return out;
    };

    const nodes = [];
    let truncated = false, unsupported = null, visited = 0;
    const visit = async function (node) {
      visited++;
      let keyframes = {}, styles = [];
      try {
        keyframes = tracks(node.manualKeyframeTracks);
        for (const s of node.animationStyles || []) styles.push(await styleInfo(s));
      } catch (e) {
        const msg = String(e && e.message || e);
        if (/not a supported API/i.test(msg)) { unsupported = msg; return; }
      }
      if (Object.keys(keyframes).length || styles.length) {
        if (nodes.length >= MAX) { truncated = true; return; }
        const entry = { id: node.id, name: node.name, type: node.type };
        if (Object.keys(keyframes).length) entry.keyframes = keyframes;
        if (styles.length) entry.animationStyles = styles;
        nodes.push(entry);
      }
      if (RECURSIVE && 'children' in node && node.children) {
        for (const child of node.children) { if (truncated || unsupported) return; await visit(child); }
      }
    };
    for (const root of roots) await visit(root);
    if (unsupported) return { error: "Figma's motion API is not enabled for this account or file (" + unsupported + ")." };

    let timelines = [];
    try { timelines = (roots[0].timelines || []).map(function (t) { return { frameId: t.id, duration: round(t.duration) }; }); } catch (e) {}

    const out = {
      target: roots.map(function (r) { return { id: r.id, name: r.name, type: r.type }; }),
      timelines: timelines,
      nodes: nodes,
    };
    const notes = [];
    if (!nodes.length) {
      notes.push(RECURSIVE
        ? 'No layer here has keyframes or an animation style.'
        : 'This layer has no keyframes or animation style of its own. Pass recursive: true to include its descendants (' + ('children' in roots[0] && roots[0].children ? roots[0].children.length : 0) + ' direct children).');
    } else {
      notes.push('Times are seconds on the timeline of the top-level frame. A field holds its first keyframe value from 0 and its last to the end.');
      if (nodes.some(function (n) { return n.animationStyles; })) notes.push('Animation styles are presets: Figma does not expose the keyframes they generate, only their settings (props).');
    }
    if (truncated) notes.push('Stopped at ' + MAX + ' animated layers; call again on a smaller frame.');
    out.notes = notes;
    out.layersRead = visited;
    return out;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()`;
