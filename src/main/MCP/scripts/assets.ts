/**
 * In-page scripts behind whoami, download_assets, upload_assets and the
 * rename step of create_new_file. Every API used here was checked in the
 * page's `figma` on 2026-11-04: createImage, getImageByHash().getBytesAsync(),
 * createNodeFromSvg, exportAsync PNG/JPG/SVG/PDF, currentUser. figma.root.name
 * is NOT writable there (silently ignored), which is why renaming goes through
 * the web app's own PUT /api/files/<key>.
 */
import { PLUGIN_API_UNAVAILABLE } from "./helpers";

/** Bytes → base64 inside the page (no Buffer there). */
const TO_BASE64 = `
    const toBase64 = function (bytes) {
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(s);
    };
    const sniff = function (b) {
      if (b[0] === 0x89 && b[1] === 0x50) return 'png';
      if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
      if (b[0] === 0x47 && b[1] === 0x49) return 'gif';
      if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
      return 'original';
    };
    const getNode = function (id) {
      return typeof figma.getNodeByIdAsync === 'function' ? figma.getNodeByIdAsync(id) : Promise.resolve(figma.getNodeById(id));
    };
`;

export const WHOAMI_SCRIPT = `
(function () {
  const figma = window.figma;
  const o = window.INITIAL_OPTIONS || {};
  const file = o.editing_file || null;
  const user = (figma && figma.currentUser) || null;
  return {
    user: user ? { id: user.id, name: user.name, photoUrl: user.photoUrl || undefined } : (o.user_data ? { id: o.user_data.id, name: o.user_data.handle } : null),
    currentFile: file ? {
      fileKey: (figma && figma.fileKey) || file.key || undefined,
      name: figma ? figma.root.name : file.name,
      editorType: file.editor_type,
      teamId: file.team_id || undefined,
      orgId: file.parent_org_id || undefined,
      canEdit: file.can_edit !== false,
    } : null,
    plan: o.plan_key ? { key: o.plan_key, tier: o.plan_tier || undefined } : undefined,
    pluginApi: !!figma,
  };
})()`;

export interface DownloadOptions {
  format: "png" | "jpg" | "svg" | "pdf" | null;
  scale: number | null;
}

/**
 * The export of a node, the original images used as fills in its subtree, and
 * SVGs of its vector parts (icons, logos): the parts get_design_context would
 * want as files. Vector parts are the topmost nodes whose whole subtree is
 * vector geometry, so an icon frame comes out as one SVG, not as its paths.
 */
export const DOWNLOAD_ASSETS_SCRIPT = (nodeId: string, opts: DownloadOptions) => `
(async function () {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${TO_BASE64}
    const node = await getNode(${JSON.stringify(nodeId)});
    if (!node) return { error: 'Node not found: ' + ${JSON.stringify(nodeId)} };
    if (typeof node.exportAsync !== 'function') return { error: 'Node ' + node.id + ' (' + node.type + ') cannot be exported' };
    const out = { nodeId: node.id, nodeName: node.name, rawImages: [], svgAssets: [], notes: [] };

    // 1. The export of the whole node: explicit format/scale win, then the
    // node's own export settings, then PNG at 1x.
    const own = (node.exportSettings && node.exportSettings[0]) || null;
    let format = ${JSON.stringify(opts.format)} || (own && own.format && own.format.toLowerCase()) || 'png';
    if (format === 'jpeg') format = 'jpg';
    let scale = ${JSON.stringify(opts.scale)};
    if (scale === null && own && own.constraint && own.constraint.type === 'SCALE') scale = own.constraint.value;
    if (scale === null) scale = 1;
    const settings = format === 'svg' ? { format: 'SVG' } : format === 'pdf' ? { format: 'PDF' }
      : { format: format === 'jpg' ? 'JPG' : 'PNG', constraint: { type: 'SCALE', value: scale } };
    const bytes = await node.exportAsync(settings);
    out.export = { format: format, scale: (format === 'svg' || format === 'pdf') ? undefined : scale, base64: toBase64(bytes) };

    // 2. Original images used as fills anywhere in the subtree.
    const MAX = 20;
    const hashes = [];
    const VECTOR = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, POLYGON: 1, ELLIPSE: 1, LINE: 1, RECTANGLE: 1 };
    const CONTAINER = { FRAME: 1, GROUP: 1, COMPONENT: 1, INSTANCE: 1 };
    const hasImageFill = function (n) {
      return Array.isArray(n.fills) && n.fills.some(function (f) { return f && f.type === 'IMAGE' && f.imageHash; });
    };
    // Is the whole subtree vector geometry (no text, no images)?
    const vectorOnly = function (n) {
      if (hasImageFill(n)) return false;
      if (VECTOR[n.type]) return true;
      if (CONTAINER[n.type] && 'children' in n && n.children.length) return n.children.every(vectorOnly);
      return false;
    };
    const svgNodes = [];
    const walk = function (n, depth) {
      if (Array.isArray(n.fills)) {
        for (const f of n.fills) {
          if (f && f.type === 'IMAGE' && f.imageHash && hashes.indexOf(f.imageHash) === -1) hashes.push(f.imageHash);
        }
      }
      // A plain rectangle is a shape, not an asset; an icon is a container or a real vector.
      const isAsset = n !== node && vectorOnly(n) && n.type !== 'RECTANGLE' && n.type !== 'LINE';
      if (isAsset) { if (svgNodes.length < MAX) svgNodes.push(n); return; }
      if ('children' in n) for (const c of n.children) walk(c, depth + 1);
    };
    walk(node, 0);

    for (const hash of hashes.slice(0, MAX)) {
      try {
        const img = figma.getImageByHash(hash);
        if (!img) continue;
        const b = await img.getBytesAsync();
        let size;
        try { size = await img.getSizeAsync(); } catch (e) {}
        out.rawImages.push({ imageHash: hash, format: sniff(b), width: size && size.width, height: size && size.height, base64: toBase64(b) });
      } catch (e) { out.notes.push('image ' + hash + ': ' + (e.message || e)); }
    }
    if (hashes.length > MAX) out.notes.push((hashes.length - MAX) + ' more image(s) not included (cap ' + MAX + ')');

    for (const n of svgNodes) {
      try {
        const svg = await n.exportAsync({ format: 'SVG_STRING' });
        out.svgAssets.push({ nodeId: n.id, name: n.name, width: Math.round(n.width), height: Math.round(n.height), svg: svg });
      } catch (e) { out.notes.push('svg ' + n.id + ': ' + (e.message || e)); }
    }
    if (!out.notes.length) delete out.notes;
    return out;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()`;

export interface UploadTarget {
  targetNodeId: string | null;
  scaleMode: "FILL" | "FIT" | "TILE";
  pageId: string | null;
}

/**
 * Place one uploaded asset. Raster bytes become an image: a fill on the target
 * node, or a new rectangle of the image's size on the page, right of the
 * existing content. SVG becomes editable vector nodes. One undo step.
 */
export const UPLOAD_ASSET_SCRIPT = (base64: string, mime: string, target: UploadTarget) => `
(async function () {
  try {
    const figma = window.figma;
    if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };
${TO_BASE64}
    const bin = atob(${JSON.stringify(base64)});
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = ${JSON.stringify(mime)};
    const targetId = ${JSON.stringify(target.targetNodeId)};
    const pageId = ${JSON.stringify(target.pageId)};

    let page = figma.currentPage;
    if (pageId) {
      const p = await getNode(pageId);
      if (!p || p.type !== 'PAGE') return { error: 'currentPageId ' + pageId + ' is not a page' };
      page = p;
      if (typeof p.loadAsync === 'function') await p.loadAsync();
    }
    const freeX = function () {
      let x = 0;
      for (const c of page.children) if ('x' in c && 'width' in c) x = Math.max(x, c.x + c.width);
      return page.children.length ? Math.round(x + 100) : 0;
    };

    try { figma.commitUndo(); } catch (e) {}
    if (mime === 'image/svg+xml') {
      const text = new TextDecoder().decode(bytes);
      const svgNode = figma.createNodeFromSvg(text);
      page.appendChild(svgNode);
      svgNode.x = freeX();
      try { figma.commitUndo(); } catch (e) {}
      return { nodeId: svgNode.id, name: svgNode.name, type: svgNode.type, svg: true };
    }

    const image = figma.createImage(bytes);
    const size = await image.getSizeAsync();
    const fill = { type: 'IMAGE', imageHash: image.hash, scaleMode: ${JSON.stringify(target.scaleMode)} };
    if (targetId) {
      const node = await getNode(targetId);
      if (!node) return { error: 'Target node not found: ' + targetId };
      if (!('fills' in node)) return { error: 'Target node ' + targetId + ' (' + node.type + ') has no fills' };
      node.fills = [fill];
      try { figma.commitUndo(); } catch (e) {}
      return { nodeId: node.id, targetNodeId: node.id, imageHash: image.hash, width: size.width, height: size.height };
    }
    const rect = figma.createRectangle();
    rect.name = 'Image';
    page.appendChild(rect);
    rect.resize(size.width, size.height);
    rect.x = freeX();
    rect.fills = [fill];
    try { figma.commitUndo(); } catch (e) {}
    return { nodeId: rect.id, imageHash: image.hash, width: size.width, height: size.height, pageId: page.id };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()`;

/** Rename a file through the web app's own endpoint (same session cookies). */
export const RENAME_FILE_SCRIPT = (fileKey: string, name: string) => `
(async function () {
  try {
    const r = await fetch('/api/files/' + encodeURIComponent(${JSON.stringify(fileKey)}), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Bypass': 'yes' },
      body: JSON.stringify({ name: ${JSON.stringify(name)} }),
    });
    if (!r.ok) return { error: 'rename failed: HTTP ' + r.status };
    return { ok: true };
  } catch (e) {
    return { error: 'rename failed: ' + (e.message || e) };
  }
})()`;
