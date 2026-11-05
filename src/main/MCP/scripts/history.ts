/**
 * get_comments and get_versions: what people said about a file and how it got
 * here. Neither exists in the Plugin API; the page reads both from figma.com
 * with the signed-in session (GET /api/file/<key>/comments and
 * /api/versions/<key>, both answered 200 on 2026-11-06). They need no edit
 * access, so they also work in a view-only file.
 *
 * Comments were checked live only against a file without any; the reader
 * accepts both the plain `message` and the rich `message_meta` form.
 */

const FILE_KEY = `
    const options = window.INITIAL_OPTIONS;
    const fileKey = (window.figma && window.figma.fileKey) ||
      (options && options.editing_file && options.editing_file.key) ||
      (location.pathname.match(/^\\/(?:design|file|board|slides|proto)\\/([0-9a-zA-Z]+)/) || [])[1];
    if (!fileKey) return { error: "The active tab is not a Figma file (" + location.pathname + ")." };
    const getJson = async function (url) {
      const res = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!res.ok) throw new Error('figma.com answered ' + res.status + ' for ' + url.split('?')[0]);
      return res.json();
    };
    const day = function (iso) { return iso ? String(iso).replace('T', ' ').slice(0, 16) : '?'; };
`;

export const COMMENTS_SCRIPT = (includeResolved: boolean) => `
(async function() {
  try {
    ${FILE_KEY}
    const body = await getJson('/api/file/' + fileKey + '/comments');
    const all = Array.isArray(body && body.meta) ? body.meta : [];
    const text = function (c) {
      if (typeof c.message === 'string' && c.message) return c.message;
      if (Array.isArray(c.message_meta)) {
        return c.message_meta.map(function (m) { return m.t || (m.user_annotated && m.user_annotated.handle ? '@' + m.user_annotated.handle : ''); }).join('');
      }
      return '';
    };
    const where = async function (c) {
      const meta = c.client_meta || {};
      const nodeId = meta.node_id || meta.nodeId || (Array.isArray(meta) && meta[0] && meta[0].node_id);
      if (!nodeId) return '';
      let name = '';
      try {
        const node = window.figma && (window.figma.getNodeByIdAsync ? await window.figma.getNodeByIdAsync(nodeId) : window.figma.getNodeById(nodeId));
        if (node) name = ' "' + node.name + '"';
      } catch (e) {}
      return ' on ' + nodeId + name;
    };
    const roots = all.filter(function (c) { return !c.parent_id; });
    const replies = {};
    for (const c of all) if (c.parent_id) (replies[c.parent_id] = replies[c.parent_id] || []).push(c);
    const open = roots.filter(function (c) { return !c.resolved_at; });
    const shown = ${includeResolved ? "roots" : "open"};
    const lines = [];
    for (const c of shown) {
      const who = (c.user && (c.user.handle || c.user.name)) || 'someone';
      lines.push('#' + c.id + (await where(c)) + ' · ' + who + ' · ' + day(c.created_at) + (c.resolved_at ? ' · resolved' : '') + ': ' + text(c).replace(/\\s+/g, ' ').trim());
      for (const r of replies[c.id] || []) {
        const rw = (r.user && (r.user.handle || r.user.name)) || 'someone';
        lines.push('  ↳ ' + rw + ' · ' + day(r.created_at) + ': ' + text(r).replace(/\\s+/g, ' ').trim());
      }
    }
    const resolved = roots.length - open.length;
    let head = roots.length === 0
      ? 'No comments on this file.'
      : shown.length + ' comment thread(s)' + (${includeResolved} ? '' : (resolved ? '; ' + resolved + ' resolved not shown (includeResolved: true)' : '')) + ':';
    return { text: head + (lines.length ? '\\n' + lines.join('\\n') : '') };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const VERSIONS_SCRIPT = (limit: number, namedOnly: boolean) => `
(async function() {
  try {
    ${FILE_KEY}
    const body = await getJson('/api/versions/' + fileKey);
    let versions = (body && body.meta && body.meta.versions) || [];
    const total = versions.length;
    if (${namedOnly}) versions = versions.filter(function (v) { return v.label || v.description; });
    const lines = versions.slice(0, ${limit}).map(function (v) {
      const who = (v.user && v.user.handle) || '?';
      const what = v.label || v.description
        ? (v.label ? '"' + v.label + '"' : '') + (v.description ? (v.label ? ' — ' : '') + String(v.description).replace(/\\s+/g, ' ').slice(0, 300) : '')
        : 'autosave';
      return '- ' + v.id + ' · ' + day(v.created_at) + ' · ' + who + ' · ' + what;
    });
    const more = body && body.pagination && body.pagination.next_page ? ' Older versions exist beyond this page.' : '';
    if (!lines.length) return { text: (${namedOnly} ? 'No named versions' : 'No versions') + ' of this file.' + more };
    return { text: 'Versions of this file, newest first (' + lines.length + ' of ' + total + ' loaded' + (${namedOnly} ? ', named only' : '') + '):' + more + '\\n' + lines.join('\\n') };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;
