/**
 * Comment threads: the pure half of get_comments, post_comment,
 * reply_comment, resolve_comment and delete_comment. The page scripts
 * (scripts/comments.ts) only fetch and send; filtering, pagination, anchoring
 * and the checks before a write happen here, in Node, where they are tested.
 *
 * figma.com's comment list (GET /api/file/<key>/comments) takes no filter or
 * page parameters: the web client gets comments from LiveGraph, and the REST
 * list answers with every comment of the file in `meta`. So every filter and
 * the cursor apply to that list here.
 *
 * Shapes read out of Figma's production web bundle on 2026-11-20
 * (figma_app__react_profile + chunks 79114 / 72604 / 94253 / 11856, loaded by
 * the editor), see scripts/comments.ts for the endpoints:
 * - a comment pinned to a layer has `client_meta = {x, y, node_id,
 *   node_offset: {x, y}, in_frame: true, page_id, stable_path}`, where
 *   `node_id` is the first entry of the stable path, `node_offset` is the pin
 *   minus that node's bounds origin, and `in_frame` is "the anchor is not the
 *   page itself" (`inFrame: pageId !== nodeId` in the client). `x`/`y` are
 *   absolute canvas coordinates.
 * - a comment on an empty spot of the canvas is sent with `client_meta = {x, y,
 *   page_id}`; figma.com stores `{x, y}` and keeps the page in the comment's
 *   own `page_id` (checked live 2026-11-20, as is everything here).
 * - `message_meta` is a list of runs: `{t: "text"}`, mentions carry `user_id`
 *   or `user_annotated: {id, handle}`.
 */

/** A comment as figma.com returns it, reduced to the fields we read. */
export interface RawComment {
  id: string | number;
  parent_id?: string | number | null;
  user_id?: string | number;
  user?: { id?: string | number; handle?: string; name?: string } | null;
  created_at?: string | null;
  resolved_at?: string | null;
  deleted_at?: string | null;
  is_deleted?: boolean;
  /** The thread's page; for a pin on the canvas figma.com keeps it only here. */
  page_id?: string | null;
  message?: string | null;
  message_meta?: any[] | null;
  client_meta?: any;
  order_id?: string | number | null;
  /** Read state, when figma.com includes it (the REST list did not, 2026-11-20). */
  is_unread?: boolean;
  isUnread?: boolean;
}

export interface CommentRecord {
  id: string;
  /** The root comment's id; equal to `id` for a root comment. */
  threadId: string;
  parentId: string | null;
  isRoot: boolean;
  userId: string | null;
  handle: string;
  createdAt: string | null;
  /** The thread's resolution: replies inherit their root's. */
  resolvedAt: string | null;
  message: string;
  mentionedUserIds: string[];
  nodeId: string | null;
  stablePath: string[];
  pageId: string | null;
  x: number | null;
  y: number | null;
  unread: boolean | null;
}

export type ResolvedFilter = "true" | "false" | "both";

export interface CommentFilters {
  nodeId: string | null;
  threadId: string | null;
  pageId: string | null;
  userId: string | null;
  mentionedUserId: string | null;
  resolved: ResolvedFilter;
  rootOnly: boolean;
  unreadOnly: boolean;
  limit: number;
  offset: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The layer a nodeId filter or a pin refers to, as the page reports it. */
export interface AnchorNode {
  id: string;
  name?: string;
  pageId: string;
  box: Box;
}

export const COMMENTS_LIMIT_DEFAULT = 20;
export const COMMENTS_LIMIT_MAX = 50;
export const COMMENT_MAX_CHARS = 10_000;

const str = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v);

/** "1-2" → "1:2", as everywhere else in the MCP; also inside instance paths. */
export function normalizeCommentNodeId(v: unknown): string | null {
  const s = str(v);
  return s ? s.replace(/-/g, ":") : null;
}

/** A stable path as Figma stores it: an array, or the "[1:2, 3:4]" string the client parses. */
function stablePathOf(meta: any): string[] {
  const p = meta?.stable_path ?? meta?.stablePath;
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === "string")
    return p
      .replace(/[[\]\s]/g, "")
      .split(",")
      .filter(Boolean);
  return [];
}

export function messageText(c: Pick<RawComment, "message" | "message_meta">): string {
  if (typeof c.message === "string" && c.message) return c.message;
  if (!Array.isArray(c.message_meta)) return "";
  const run = (m: any): string => {
    if (!m || typeof m !== "object") return "";
    if (typeof m.t === "string" && m.t) return m.t;
    if (m.user_annotated?.handle) return `@${m.user_annotated.handle}`;
    if (Array.isArray(m.children)) return m.children.map(run).join("");
    return "";
  };
  return c.message_meta.map(run).join("");
}

function mentionsOf(meta: unknown): string[] {
  const ids = new Set<string>();
  const walk = (m: any) => {
    if (!m || typeof m !== "object") return;
    const id = m.user_id ?? m.user_annotated?.id;
    if (id !== undefined && id !== null) ids.add(String(id));
    if (Array.isArray(m.children)) m.children.forEach(walk);
  };
  if (Array.isArray(meta)) meta.forEach(walk);
  return [...ids];
}

/**
 * figma.com's list → records, deleted comments dropped. A reply inherits the
 * root's resolution, page and anchor: Figma stores them on the root only.
 */
export function normalizeComments(raw: unknown): CommentRecord[] {
  const list = (Array.isArray(raw) ? raw : []) as RawComment[];
  const live = list.filter(
    (c) => c && c.id !== undefined && c.id !== null && !c.deleted_at && !c.is_deleted,
  );
  const byId = new Map(live.map((c) => [String(c.id), c]));
  return live.map((c) => {
    const id = String(c.id);
    const parentId = str(c.parent_id);
    const root = (parentId && byId.get(parentId)) || c;
    const meta = Array.isArray(root.client_meta) ? root.client_meta[0] : root.client_meta;
    const stablePath = stablePathOf(meta);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const unread =
      typeof c.is_unread === "boolean"
        ? c.is_unread
        : typeof c.isUnread === "boolean"
          ? c.isUnread
          : null;
    return {
      id,
      threadId: parentId ?? id,
      parentId,
      isRoot: !parentId,
      userId: str(c.user_id ?? c.user?.id),
      handle: c.user?.handle || c.user?.name || "someone",
      createdAt: str(c.created_at),
      resolvedAt: str(root.resolved_at),
      message: messageText(c).replace(/\s+/g, " ").trim(),
      mentionedUserIds: mentionsOf(c.message_meta),
      nodeId: str(meta?.node_id ?? meta?.nodeId) ?? stablePath[0] ?? null,
      stablePath,
      pageId: str(meta?.page_id ?? meta?.pageId ?? root.page_id),
      x: num(meta?.x),
      y: num(meta?.y),
      unread,
    };
  });
}

type ArgsResult = { filters: CommentFilters } | { error: string };

/** Tool arguments → filters. `includeResolved` is the old name, kept as an alias of `resolved`. */
export function parseCommentFilters(args: Record<string, unknown>): ArgsResult {
  const nodeId = normalizeCommentNodeId(args.nodeId);
  let resolved: ResolvedFilter;
  const r = args.resolved;
  if (r === true || r === "true") resolved = "true";
  else if (r === false || r === "false") resolved = "false";
  else if (r === "both") resolved = "both";
  else if (r !== undefined && r !== null)
    return { error: 'resolved must be true, false or "both"' };
  else if (args.includeResolved === true) resolved = "both";
  else if (args.includeResolved === false) resolved = "false";
  // Figma's remote tool: a nodeId lists the layer's open threads, otherwise both.
  else resolved = nodeId ? "false" : "both";

  let limit = COMMENTS_LIMIT_DEFAULT;
  if (args.limit !== undefined && args.limit !== null) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > COMMENTS_LIMIT_MAX)
      return { error: `limit must be an integer from 1 to ${COMMENTS_LIMIT_MAX}` };
    limit = n;
  }
  let offset = 0;
  if (args.cursor !== undefined && args.cursor !== null && args.cursor !== "") {
    const decoded = decodeCursor(String(args.cursor));
    if (decoded === null)
      return { error: "cursor is not one this tool returned (pass nextCursor as is)" };
    offset = decoded;
  }
  return {
    filters: {
      nodeId,
      threadId: str(args.threadId),
      pageId: normalizeCommentNodeId(args.pageId),
      userId: str(args.userId),
      mentionedUserId: str(args.mentionedUserId),
      resolved,
      rootOnly: args.rootOnly === true,
      unreadOnly: args.unreadOnly === true,
      limit,
      offset,
    },
  };
}

export function encodeCursor(offset: number): string {
  return `o${offset}`;
}

export function decodeCursor(cursor: string): number | null {
  const m = /^o(\d{1,7})$/.exec(cursor);
  return m ? Number(m[1]) : null;
}

/** The pin's canvas position lies inside the layer's bounds (edges included). */
function inside(c: CommentRecord, box: Box): boolean {
  return (
    c.x !== null &&
    c.y !== null &&
    c.x >= box.x &&
    c.x <= box.x + box.width &&
    c.y >= box.y &&
    c.y <= box.y + box.height
  );
}

/**
 * Whether the thread of `root` sits on the layer: pinned to it, to a stable
 * path through it, or its pin falls inside its bounds on its page (what
 * Figma's remote tool calls "overlapping this canvas layer").
 */
export function threadOnNode(
  root: CommentRecord,
  nodeId: string,
  node: AnchorNode | null,
): boolean {
  if (root.nodeId === nodeId || root.stablePath.includes(nodeId)) return true;
  const instancePath = nodeId.replace(/^I/, "").split(";");
  if (instancePath.length > 1 && instancePath.every((id, i) => root.stablePath[i] === id))
    return true;
  if (!node) return false;
  if (root.pageId && root.pageId !== node.pageId) return false;
  return inside(root, node.box);
}

export interface FilterResult {
  page: CommentRecord[];
  /** How many comments matched before the page was cut. */
  matched: number;
  nextCursor: string | null;
}

/**
 * Threads newest first, each root followed by its replies oldest first; then
 * the filters, which apply to every comment, replies included; then the page.
 */
export function filterComments(
  all: CommentRecord[],
  f: CommentFilters,
  ctx: { node?: AnchorNode | null } = {},
): FilterResult {
  const time = (c: CommentRecord) => (c.createdAt ? Date.parse(c.createdAt) || 0 : 0);
  const roots = all.filter((c) => c.isRoot).sort((a, b) => time(b) - time(a));
  const replies = new Map<string, CommentRecord[]>();
  for (const c of all)
    if (!c.isRoot) {
      const list = replies.get(c.threadId) ?? [];
      list.push(c);
      replies.set(c.threadId, list);
    }
  const ordered: CommentRecord[] = [];
  for (const root of roots) {
    ordered.push(root);
    ordered.push(...(replies.get(root.id) ?? []).sort((a, b) => time(a) - time(b)));
  }
  const rootById = new Map(roots.map((r) => [r.id, r]));

  const matches = ordered.filter((c) => {
    const root = rootById.get(c.threadId);
    if (!root) return false;
    if (f.rootOnly && !c.isRoot) return false;
    if (f.threadId && c.threadId !== f.threadId) return false;
    if (f.resolved === "true" && !c.resolvedAt) return false;
    if (f.resolved === "false" && c.resolvedAt) return false;
    if (f.pageId && root.pageId !== f.pageId) return false;
    if (f.userId && c.userId !== f.userId) return false;
    if (f.mentionedUserId && !c.mentionedUserIds.includes(f.mentionedUserId)) return false;
    if (f.unreadOnly && c.unread !== true) return false;
    if (f.nodeId && !threadOnNode(root, f.nodeId, ctx.node ?? null)) return false;
    return true;
  });
  const page = matches.slice(f.offset, f.offset + f.limit);
  const end = f.offset + page.length;
  return {
    page,
    matched: matches.length,
    nextCursor: end < matches.length ? encodeCursor(end) : null,
  };
}

const day = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "?");

function describeFilters(f: CommentFilters): string {
  const parts: string[] = [];
  if (f.nodeId) parts.push(`on layer ${f.nodeId}`);
  if (f.threadId) parts.push(`in thread #${f.threadId}`);
  if (f.pageId) parts.push(`on page ${f.pageId}`);
  if (f.userId) parts.push(`by user ${f.userId}`);
  if (f.mentionedUserId) parts.push(`mentioning user ${f.mentionedUserId}`);
  if (f.rootOnly) parts.push("thread starts only");
  if (f.unreadOnly) parts.push("unread");
  parts.push(
    f.resolved === "both" ? "open and resolved" : f.resolved === "true" ? "resolved" : "open",
  );
  return parts.join(", ");
}

/** Text for the client: one line per comment, replies indented under a root on the same page. */
export function formatComments(
  result: FilterResult,
  f: CommentFilters,
  names: Record<string, string> = {},
  total: number,
): string {
  if (total === 0) return "No comments on this file.";
  const where = (c: CommentRecord) => {
    if (c.nodeId && c.nodeId !== c.pageId)
      return ` on ${c.nodeId}${names[c.nodeId] ? ` "${names[c.nodeId]}"` : ""}`;
    if (c.x !== null && c.y !== null) return ` at (${Math.round(c.x)}, ${Math.round(c.y)})`;
    return "";
  };
  const who = (c: CommentRecord) => `${c.handle}${c.userId ? ` (${c.userId})` : ""}`;
  const flags = (c: CommentRecord) =>
    (c.resolvedAt && c.isRoot ? " · resolved" : "") + (c.unread ? " · unread" : "");
  const lines: string[] = [];
  let shownThread: string | null = null;
  for (const c of result.page) {
    if (c.isRoot) {
      shownThread = c.id;
      const page = c.pageId ? ` (page ${c.pageId})` : "";
      lines.push(
        `#${c.id}${where(c)}${page} · ${who(c)} · ${day(c.createdAt)}${flags(c)}: ${c.message}`,
      );
    } else if (shownThread === c.threadId) {
      lines.push(`  ↳ #${c.id} · ${who(c)} · ${day(c.createdAt)}${flags(c)}: ${c.message}`);
    } else {
      lines.push(
        `#${c.id} reply in #${c.threadId}${c.resolvedAt ? " (resolved thread)" : ""} · ${who(c)} · ${day(c.createdAt)}${flags(c)}: ${c.message}`,
      );
    }
  }
  const from = result.page.length ? f.offset + 1 : 0;
  const head =
    result.matched === 0
      ? `No comments match (${describeFilters(f)}); the file has ${total}.`
      : `Comments ${from}-${f.offset + result.page.length} of ${result.matched} matching (${describeFilters(f)}), ${total} in the file:`;
  const tail = result.nextCursor ? `\nnextCursor: ${result.nextCursor}` : "";
  return head + (lines.length ? `\n${lines.join("\n")}` : "") + tail;
}

// ── Writes ────────────────────────────────────────────────────────────────

/** A plain-text message as Figma's composer sends it. */
export function messageMetaOf(message: string): { t: string }[] {
  return [{ t: message }];
}

export function checkMessage(v: unknown): { message: string } | { error: string } {
  if (typeof v !== "string" || !v.trim()) return { error: "message is required" };
  if (v.length > COMMENT_MAX_CHARS)
    return { error: `message is longer than ${COMMENT_MAX_CHARS} characters` };
  return { message: v };
}

/** "1:2" → ["1:2"]; "I1:2;3:4" (a layer inside an instance) → ["1:2", "3:4"]. */
export function stablePathForNode(nodeId: string): string[] {
  return nodeId.replace(/^I/, "").split(";");
}

export interface ClientMeta {
  x: number;
  y: number;
  page_id: string;
  node_id?: string;
  node_offset?: { x: number; y: number };
  in_frame?: boolean;
  stable_path?: string[];
}

/**
 * Where a new thread goes, in the client's own shape. With a node the pin is
 * at `offset` from the layer's top-left corner (default: the corner, as
 * Figma's Make composer does with `node_offset: {x: 0, y: 0}`); the client
 * anchors to the first id of the stable path and measures the offset from
 * that node's bounds. Without one, `point` is an absolute canvas position.
 */
export function buildClientMeta(
  anchor:
    | { node: AnchorNode; offset?: { x: number; y: number } | null }
    | { point: { x: number; y: number }; pageId: string },
): ClientMeta {
  if ("point" in anchor) return { x: anchor.point.x, y: anchor.point.y, page_id: anchor.pageId };
  const { node } = anchor;
  const offset = anchor.offset ?? { x: 0, y: 0 };
  const path = stablePathForNode(node.id);
  return {
    x: node.box.x + offset.x,
    y: node.box.y + offset.y,
    node_id: path[0],
    node_offset: { x: offset.x, y: offset.y },
    in_frame: path[0] !== node.pageId,
    page_id: node.pageId,
    stable_path: path,
  };
}

export function readPoint(v: unknown): { x: number; y: number } | null | { error: string } {
  if (v === undefined || v === null) return null;
  const p = v as any;
  if (typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    return { error: "expected {x, y} with numbers" };
  return { x: p.x, y: p.y };
}

/** What reply/resolve/delete may do with comment `id`, given the file's comments. */
export function checkCommentTarget(
  all: CommentRecord[],
  id: string,
  action: "reply" | "resolve" | "delete",
  me: string | null,
): { comment: CommentRecord } | { error: string } {
  const comment = all.find((c) => c.id === id);
  if (!comment) return { error: `No comment #${id} in this file (it may have been deleted).` };
  if (action === "reply" && !comment.isRoot)
    return { error: `#${id} is a reply; reply to its thread #${comment.threadId}.` };
  if (action === "resolve" && !comment.isRoot)
    return { error: `#${id} is a reply; resolve its thread #${comment.threadId}.` };
  if (action === "delete") {
    if (!me) return { error: "Could not tell who is signed in, so did not delete anything." };
    if (comment.userId !== me)
      return {
        error: `#${id} was written by ${comment.handle}, not you; only your own comments can be deleted.`,
      };
  }
  return { comment };
}
