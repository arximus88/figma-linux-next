/**
 * get_versions: how a file got here. Not in the Plugin API; the page reads it
 * from figma.com with the signed-in session (GET /api/versions/<key>, answered
 * 200 on 2026-11-06). Needs no edit access, so it also works in a view-only
 * file. Comments moved to comments.ts.
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
