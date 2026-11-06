/**
 * Figma AI from the page: image generation and editing, and the credit
 * balance. The third tool tier; every call but the balance spends the user's
 * Figma AI credits.
 *
 * None of this is in the Plugin API. The page's own AI client is located in
 * its bundler by the endpoint strings it posts to, never by module id (ids
 * change with every Figma deploy). Read out of build e79b4ae on 2026-11-06 and
 * run live: generateImages answers in one response with base64 PNGs (14-16 s);
 * width/height set only the aspect ratio (256x256 came back 1024x1024); the
 * edit endpoints take a signed S3 URL of the source image; the balance is
 * GET /api/plans/<plan>/ai_credits/plan_user_balance_summary and is free.
 * Listed prices did not match what one call cost, so the tools report the
 * balance before and after instead of quoting a price.
 */

/** In-page helpers: locate the AI client, its request context, the image manager. */
const AI_PREAMBLE = `
    const store = window.store;
    function bundlerRequire() {
      let req = null;
      window.rspackChunk_figma_web_bundler.push([[Math.random()], {}, function (r) { req = r; }]);
      if (!req || !req.m) throw new Error("Figma's page bundler is not reachable; Figma may have changed how it loads code.");
      return req;
    }
    function findAi() {
      if (window.__flnAi) return window.__flnAi;
      const req = bundlerRequire();
      let ai = null, ctxFn = null, images = null;
      for (const id of Object.keys(req.m)) {
        let src = '';
        try { src = String(req.m[id]); } catch (e) { continue; }
        if (!ai && src.indexOf('"/api/cortex/design/editor_ai/images/generate"') !== -1) {
          const e = req(id);
          for (const k of Object.keys(e || {})) {
            const v = e[k];
            if (v && typeof v === 'object' && v.design && typeof v.design.generateImages === 'function') { ai = v; break; }
          }
        }
        if (!ctxFn && src.length < 20000 && src.indexOf('ownerType:"file"') !== -1 && src.indexOf('trackingSessionId:') !== -1) {
          const e = req(id);
          for (const k of Object.keys(e || {})) {
            const v = e[k];
            if (typeof v === 'function' && v.length === 0 && String(v).indexOf('ownerType:"file"') !== -1) { ctxFn = v; break; }
          }
        }
        if (!images && src.indexOf('getValidSignedUrl(e){') !== -1) {
          const e = req(id);
          for (const k of Object.keys(e || {})) {
            const v = e[k];
            if (typeof v !== 'function' || v.length !== 0) continue;
            try { const m = v(); if (m && typeof m.getValidSignedUrl === 'function') { images = m; break; } } catch (err) {}
          }
        }
        if (ai && ctxFn && images) break;
      }
      if (!ai) throw new Error("Figma's AI client was not found in the page (its image endpoint is gone from the bundle). Figma changed it; this tool needs an update.");
      if (!ctxFn) throw new Error("Figma's AI request context was not found in the page. Figma changed it; this tool needs an update.");
      window.__flnAi = {
        ai: ai,
        images: images,
        ctx: function () { return Object.assign({}, ctxFn(), { clientLifecycleId: crypto.randomUUID() }); },
      };
      return window.__flnAi;
    }
    function planId() {
      const f = store && store.getState().openFile;
      return f && f.plan && f.plan.id;
    }
    async function balance() {
      const id = planId();
      if (!id) return null;
      try {
        const res = await fetch('/api/plans/' + encodeURIComponent(id) + '/ai_credits/plan_user_balance_summary', { headers: { 'X-Csrf-Bypass': 'yes' }, credentials: 'include' });
        if (!res.ok) return null;
        const body = await res.json();
        return (body && body.meta && body.meta.monthly_summary) || null;
      } catch (e) { return null; }
    }
    const b64ToBytes = function (b64) { return Uint8Array.from(atob(String(b64).replace(/^data:[^,]+,/, '')), function (c) { return c.charCodeAt(0); }); };
    const bytesToB64 = function (b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
    // A small JPEG to show the caller what came out (tens of KB, where a PNG
    // preview of a generated picture was ~300 KB); the full image goes to disk.
    async function preview(bytes, max) {
      try {
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const ctx2d = c.getContext('2d');
        ctx2d.globalCompositeOperation = 'destination-over';
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, c.width, c.height);
        const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        return bytesToB64(new Uint8Array(await blob.arrayBuffer()));
      } catch (e) { return null; }
    }
    function rightOfContent(page) {
      let x = 0;
      for (const n of page.children) if ('x' in n && 'width' in n) x = Math.max(x, n.x + n.width);
      return x + 200;
    }
    async function place(bytes, name, near, replace) {
      const figma = window.figma;
      const img = figma.createImage(bytes);
      const size = await img.getSizeAsync();
      if (replace && near && 'fills' in near) {
        const fills = Array.isArray(near.fills) ? near.fills.slice() : [];
        const i = fills.findIndex(function (f) { return f.type === 'IMAGE'; });
        const fill = { type: 'IMAGE', imageHash: img.hash, scaleMode: i >= 0 ? fills[i].scaleMode : 'FILL' };
        if (i >= 0) fills[i] = fill; else fills.push(fill);
        near.fills = fills;
        return { nodeId: near.id, imageHash: img.hash, width: size.width, height: size.height };
      }
      const rect = figma.createRectangle();
      rect.name = name;
      rect.resize(size.width, size.height);
      if (near && 'x' in near) {
        rect.x = near.absoluteTransform ? near.absoluteTransform[0][2] + near.width + 40 : near.x + near.width + 40;
        rect.y = near.absoluteTransform ? near.absoluteTransform[1][2] : near.y;
      } else {
        rect.x = rightOfContent(figma.currentPage);
        rect.y = 0;
      }
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
      return { nodeId: rect.id, imageHash: img.hash, width: size.width, height: size.height };
    }
`;

export const FIGMA_AI_CREDITS_SCRIPT = `
(async function() {
  try {
    ${AI_PREAMBLE}
    const id = planId();
    if (!id) return { error: "This tab has no file open, so there is no plan to read AI credits from. Open a file of the team whose credits you want." };
    const mine = await balance();
    let pool = null;
    try {
      const res = await fetch('/api/plans/' + encodeURIComponent(id) + '/ai_credits/plan_balance_summary', { headers: { 'X-Csrf-Bypass': 'yes' }, credentials: 'include' });
      if (res.ok) { const b = await res.json(); pool = (b && b.meta && b.meta.monthly_summary) || null; }
    } catch (e) {}
    if (!mine) return { error: "figma.com did not return an AI credit balance for this plan." };
    const f = store.getState().openFile;
    return {
      plan: id,
      planName: (f.plan && (f.plan.name || f.plan.planName)) || undefined,
      you: { available: mine.available, total: mine.total, resetsAt: mine.resets_at, unmetered: mine.bypass_metering || undefined },
      planPool: pool ? { available: pool.available, total: pool.total } : undefined,
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export interface GenerateImageArgs {
  prompt: string;
  negativePrompt: string | null;
  width: number;
  height: number;
  model: string;
  seed: number | null;
  place: boolean;
  previewMax: number;
}

export const FIGMA_AI_GENERATE_IMAGE_SCRIPT = (args: GenerateImageArgs) => `
(async function() {
  try {
    const args = ${JSON.stringify(args)};
    ${AI_PREAMBLE}
    if (!window.figma) return { error: "The Figma Plugin API is not available in this tab; open a design file you can edit." };
    const found = findAi();
    const before = await balance();
    if (before && before.available <= 0 && !before.bypass_metering) return { error: "No Figma AI credits left (resets " + before.resets_at + ")." };
    const started = Date.now();
    const res = await found.ai.design.generateImages({
      prompt: args.prompt,
      negativePrompt: args.negativePrompt || 'blurry, bad',
      cfgScale: 8,
      seed: args.seed == null ? Math.floor(Math.random() * 2147483647) : args.seed,
      width: args.width,
      height: args.height,
      numImages: 1,
      modelType: args.model,
    }, found.ctx());
    const b64 = res && res.images && res.images[0];
    if (!b64) return { error: "Figma AI returned no image." };
    const bytes = b64ToBytes(b64);
    let placed = null;
    if (args.place) placed = await place(bytes, 'AI image: ' + args.prompt.slice(0, 60), null, false);
    const after = await balance();
    return {
      base64: bytesToB64(bytes),
      preview: await preview(bytes, args.previewMax),
      model: args.model,
      ms: Date.now() - started,
      placed: placed,
      creditsBefore: before ? before.available : null,
      creditsAfter: after ? after.available : null,
    };
  } catch (e) {
    return { error: (e && (e.message || e.type)) ? String(e.message || e.type) + (e.data ? ' ' + JSON.stringify(e.data).slice(0, 300) : '') : String(e) };
  }
})()
`;

export interface EditImageArgs {
  nodeId: string;
  operation: "edit" | "expand" | "remove_background" | "upscale" | "vectorize";
  prompt: string | null;
  model: string;
  expand: { top: number; right: number; bottom: number; left: number } | null;
  scale: 2 | 4;
  replace: boolean;
  previewMax: number;
}

export const FIGMA_AI_EDIT_IMAGE_SCRIPT = (args: EditImageArgs) => `
(async function() {
  try {
    const args = ${JSON.stringify(args)};
    ${AI_PREAMBLE}
    const figma = window.figma;
    if (!figma) return { error: "The Figma Plugin API is not available in this tab; open a design file you can edit." };
    const node = typeof figma.getNodeByIdAsync === 'function' ? await figma.getNodeByIdAsync(args.nodeId) : figma.getNodeById(args.nodeId);
    if (!node) return { error: "Node not found: " + args.nodeId };
    const found = findAi();

    // The source: the node's image fill, as the signed URL the endpoints take.
    // Vectorize instead gets a PNG render of the node, as Figma's UI sends it.
    let sourceUrl = null, srcW = 0, srcH = 0;
    if (args.operation === 'vectorize') {
      const longest = Math.max(node.width, node.height);
      const scale = longest < 256 ? 256 / longest : longest > 4096 ? 4096 / longest : 1;
      const png = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
      sourceUrl = 'data:image/png;base64,' + bytesToB64(png);
    } else {
      const fill = Array.isArray(node.fills) ? node.fills.find(function (f) { return f.type === 'IMAGE' && f.visible !== false && f.imageHash; }) : null;
      if (!fill) return { error: "Node " + args.nodeId + " has no image fill. Pass a layer filled with an image (a placed or generated picture)." };
      if (!found.images) return { error: "Figma's image manager was not found in the page; Figma changed it and this tool needs an update." };
      const size = await figma.getImageByHash(fill.imageHash).getSizeAsync();
      srcW = size.width; srcH = size.height;
      sourceUrl = await found.images.getValidSignedUrl(fill.imageHash);
    }

    const before = await balance();
    if (before && before.available <= 0 && !before.bypass_metering) return { error: "No Figma AI credits left (resets " + before.resets_at + ")." };
    const d = found.ai.design, ctx = found.ctx();
    const started = Date.now();
    let res;
    if (args.operation === 'edit') {
      if (!args.prompt) return { error: "operation edit needs a prompt describing the change." };
      res = await d.imagesEdit({ image_urls: [sourceUrl], prompt: args.prompt, targetWidth: srcW, targetHeight: srcH, modelType: args.model, action: 'edit-image' }, ctx);
    } else if (args.operation === 'expand') {
      const e = args.expand || { top: 0, right: 0, bottom: 0, left: 0 };
      if (!(e.top || e.right || e.bottom || e.left)) return { error: "operation expand needs expand: {top, right, bottom, left} in pixels, at least one above 0." };
      res = await d.imagesExpand({ image_url: sourceUrl, expand: e }, ctx);
    } else if (args.operation === 'remove_background') {
      res = await d.removeBackgroundClipdrop({ image_url: sourceUrl }, ctx);
    } else if (args.operation === 'upscale') {
      if (srcW < 16 || srcH < 16 || srcW > 2048 || srcH > 2048) return { error: "Upscale takes images 16 to 2048 px on each side; this one is " + srcW + "x" + srcH + "." };
      const k = Math.min(args.scale, 4096 / Math.max(srcW, srcH));
      res = await d.upscaleClipdrop({ image_url: sourceUrl, width: Math.round(srcW * k), height: Math.round(srcH * k) }, ctx);
    } else if (args.operation === 'vectorize') {
      res = await d.vectorizeImage({ image_url: sourceUrl }, ctx);
    } else {
      return { error: "Unknown operation " + args.operation };
    }
    const ms = Date.now() - started;

    if (args.operation === 'vectorize') {
      const svg = res && res.svg;
      if (!svg) return { error: "Figma AI returned no SVG." };
      const vec = figma.createNodeFromSvg(svg);
      vec.name = 'Vectorized: ' + node.name;
      vec.x = (node.absoluteTransform ? node.absoluteTransform[0][2] : node.x) + node.width + 40;
      vec.y = node.absoluteTransform ? node.absoluteTransform[1][2] : node.y;
      const after = await balance();
      return { svg: svg, ms: ms, placed: { nodeId: vec.id }, creditsBefore: before ? before.available : null, creditsAfter: after ? after.available : null };
    }
    const b64 = res && res.base64_image;
    if (!b64) return { error: "Figma AI returned no image." };
    const bytes = b64ToBytes(b64);
    const placed = await place(bytes, args.operation.replace('_', ' ') + ': ' + node.name, node, args.replace);
    const after = await balance();
    return {
      base64: bytesToB64(bytes),
      preview: await preview(bytes, args.previewMax),
      ms: ms,
      placed: placed,
      creditsBefore: before ? before.available : null,
      creditsAfter: after ? after.available : null,
    };
  } catch (e) {
    return { error: (e && (e.message || e.type)) ? String(e.message || e.type) + (e.data ? ' ' + JSON.stringify(e.data).slice(0, 300) : '') : String(e) };
  }
})()
`;
