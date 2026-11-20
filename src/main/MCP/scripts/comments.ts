/**
 * Comment threads on figma.com, from the page with the signed-in session. The
 * scripts only fetch and send; utils/comments.ts filters, anchors and checks.
 *
 * Endpoints, read out of Figma's production web bundle on 2026-11-20 (the
 * editor's `figma_app__react_profile-*.min.js` entry and the comments chunks
 * `79114-*` / `72604-*`, all under www.figma.com/webpack-artifacts/assets/):
 *
 * - list:    GET    /api/file/<key>/comments                → {meta: Comment[]}
 *            (checked live 2026-11-06; no filter or page parameters)
 * - new:     POST   /api/file/<key>/comments
 *            {file_key, message_meta, attachments: [], client_meta, page_id, uuid}
 *            → {meta: Comment}  (`writeAPI.create`; the client also sends
 *            tracking and mention-invite fields, all optional)
 * - reply:   POST   /api/file/<key>/comments/<threadId>
 *            {file_key, uuid, message_meta, attachments: []}   (`writeAPI.reply`)
 * - resolve: PUT    /api/file/<key>/comments/<id>  {resolved_at: "true" | "false"}
 *            (the strings, not booleans; "false" reopens)
 * - delete:  DELETE /api/file/<key>/comments/<id>  (a root takes its replies with it;
 *            the client labels it "Delete thread")
 *
 * All five were checked live on 2026-11-20 in a scratch file: each answered
 * 200 and the list showed the change. The stored comment carries `page_id`
 * beside `client_meta` and no read state.
 *
 * Headers: Figma's XHR client sends `Accept` and `Content-Type:
 * application/json`, `X-Csrf-Bypass: yes`, `X-Figma-User-ID: <user_data.id>`
 * and `X-Figma-Client-Version` on every request, with the cookie session.
 * These scripts send the same set (the version only when the page's options
 * carry it). Whether figma.com insists on each header was not tested.
 */

const PRELUDE = `
    const options = window.INITIAL_OPTIONS;
    const fileKey = (window.figma && window.figma.fileKey) ||
      (options && options.editing_file && options.editing_file.key) ||
      (location.pathname.match(/^\\/(?:design|file|board|slides|proto)\\/([0-9a-zA-Z]+)/) || [])[1];
    if (!fileKey) return { error: "The active tab is not a Figma file (" + location.pathname + ")." };
    const me = (options && options.user_data && options.user_data.id) ||
      (window.figma && window.figma.currentUser && window.figma.currentUser.id) || null;
    const call = async function (method, url, body) {
      const headers = { 'Accept': 'application/json', 'X-Csrf-Bypass': 'yes' };
      if (me) headers['X-Figma-User-ID'] = String(me);
      const version = options && (options.release_manifest_git_commit || options.releaseManifestGitCommit);
      if (version) headers['X-Figma-Client-Version'] = String(version);
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, { method: method, credentials: 'include', headers: headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        const why = data && (data.message || (data.reason && (data.reason.reason || data.reason)) || data.error);
        throw new Error('figma.com answered ' + res.status + ' for ' + method + ' ' + url.split('?')[0] + (why && typeof why === 'string' ? ': ' + why : ''));
      }
      return data;
    };
    const nodeById = async function (id) {
      if (!window.figma) return null;
      try {
        return window.figma.getNodeByIdAsync ? await window.figma.getNodeByIdAsync(id) : window.figma.getNodeById(id);
      } catch (e) { return null; }
    };
    const pageOf = function (node) {
      let n = node;
      while (n && n.type !== 'PAGE') n = n.parent;
      return n || null;
    };
    const anchorOf = async function (id) {
      const node = await nodeById(id);
      if (!node) return { error: 'No layer ' + id + ' in this file.' };
      if (node.type === 'PAGE' || node.type === 'DOCUMENT') return { error: id + ' is a page; pass pageId with x and y to comment on its canvas.' };
      const page = pageOf(node);
      let box = node.absoluteBoundingBox || node.absoluteRenderBounds || null;
      if (!box && node.absoluteTransform) box = { x: node.absoluteTransform[0][2], y: node.absoluteTransform[1][2], width: node.width || 0, height: node.height || 0 };
      if (!page || !box) return { error: 'Could not tell where layer ' + id + ' is on the canvas.' };
      return { node: { id: node.id, name: node.name, pageId: page.id, box: { x: box.x, y: box.y, width: box.width, height: box.height } } };
    };
`;

/**
 * Every comment of the file, who is signed in, the names of the layers the
 * threads are pinned to (at most 300 looked up), and, for a nodeId filter,
 * that layer's page and bounds.
 */
export const COMMENTS_LIST_SCRIPT = (nodeId: string | null) => `
(async function() {
  try {
    ${PRELUDE}
    const body = await call('GET', '/api/file/' + fileKey + '/comments');
    const comments = Array.isArray(body && body.meta) ? body.meta : [];
    const names = {};
    const ids = [];
    for (const c of comments) {
      const meta = Array.isArray(c.client_meta) ? c.client_meta[0] : c.client_meta;
      const id = meta && (meta.node_id || meta.nodeId);
      if (id && !(id in names) && ids.length < 300) { names[id] = ''; ids.push(id); }
    }
    for (const id of ids) {
      const node = await nodeById(id);
      if (node && node.name && node.type !== 'PAGE') names[id] = node.name; else delete names[id];
    }
    const out = { fileKey: fileKey, me: me, comments: comments, names: names };
    const wanted = ${JSON.stringify(nodeId)};
    if (wanted) {
      const a = await anchorOf(wanted);
      if (a.error) out.nodeError = a.error; else out.node = a.node;
    }
    return out;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

/**
 * Where a new thread can go: the layer's page and bounds for a nodeId, or the
 * page for a canvas point (the given pageId, checked, else the current page).
 */
export const COMMENT_ANCHOR_SCRIPT = (nodeId: string | null, pageId: string | null) => `
(async function() {
  try {
    ${PRELUDE}
    const nodeId = ${JSON.stringify(nodeId)};
    const pageId = ${JSON.stringify(pageId)};
    if (nodeId) {
      const a = await anchorOf(nodeId);
      if (a.error) return a;
      if (pageId && a.node.pageId !== pageId) return { error: 'Layer ' + nodeId + ' is on page ' + a.node.pageId + ', not ' + pageId + '.' };
      return { fileKey: fileKey, me: me, node: a.node };
    }
    if (pageId) {
      const page = await nodeById(pageId);
      if (!page || page.type !== 'PAGE') return { error: pageId + ' is not a page of this file.' };
      return { fileKey: fileKey, me: me, pageId: page.id };
    }
    const current = window.figma && window.figma.currentPage;
    if (!current) return { error: 'Could not tell the current page; pass pageId.' };
    return { fileKey: fileKey, me: me, pageId: current.id };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export interface CommentWrite {
  method: "POST" | "PUT" | "DELETE";
  /** After /api/file/<key>/comments: "" for a new thread, "/<id>" otherwise. */
  suffix: "" | `/${string}`;
  body?: Record<string, unknown>;
  /** Add `file_key` and a fresh `uuid`, as the client does for new comments. */
  stamp?: boolean;
}

/** One write to the file's comments. Answers figma.com's `meta` (the comment, when there is one). */
export const COMMENT_WRITE_SCRIPT = (req: CommentWrite) => `
(async function() {
  try {
    ${PRELUDE}
    const req = ${JSON.stringify(req)};
    const body = req.body ? Object.assign({}, req.body) : undefined;
    if (body && req.stamp) {
      body.file_key = fileKey;
      body.uuid = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    }
    const data = await call(req.method, '/api/file/' + fileKey + '/comments' + req.suffix, body);
    return { fileKey: fileKey, meta: (data && data.meta) || null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;
