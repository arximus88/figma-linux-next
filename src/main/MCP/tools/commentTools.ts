/**
 * Comment tools: get_comments (read) and the four writes. Kept out of
 * definitions.ts so changes to them stay apart from the rest of the surface.
 * Parameters of get_comments follow Figma's remote MCP (2026-11-20 schema).
 */

import { COMMENT_MAX_CHARS, COMMENTS_LIMIT_DEFAULT, COMMENTS_LIMIT_MAX } from "../utils/comments";
import type { ToolDefinition } from "../types";

const POINT = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
};

const REAL_FILE =
  "This writes to the real file on figma.com: everyone with access sees it at once, and Figma " +
  "may notify the people involved. Ctrl+Z does not undo it.";

export const GET_COMMENTS_TOOL: ToolDefinition = {
  name: "get_comments",
  description:
    "Comments on the file, read from figma.com with your session. One line per comment: its id, " +
    "the layer it is pinned to (id and name) or its canvas point, page, author (handle and user " +
    "id), date and text; replies are indented under their thread. Threads newest first. Filters " +
    "apply to every comment, replies included, before the page is cut; pass nextCursor back as " +
    "cursor for the next page. Works in view-only files.",
  inputSchema: {
    type: "object",
    properties: {
      nodeId: {
        type: "string",
        description:
          "Threads on this layer: pinned to it, or with their pin inside its bounds. Lists open " +
          "threads unless resolved says otherwise.",
      },
      threadId: {
        type: "string",
        description: "Only this thread: the root comment and its replies.",
      },
      pageId: { type: "string", description: "Only threads on this page." },
      userId: { type: "string", description: "Only comments written by this user id." },
      mentionedUserId: {
        type: "string",
        description: "Only comments that @mention this user id.",
      },
      resolved: {
        type: ["boolean", "string"],
        enum: [true, false, "both"],
        description:
          'true: resolved threads only. false: open only. "both" or omitted: both (with nodeId, ' +
          "omitted means open only).",
      },
      includeResolved: {
        type: "boolean",
        description: 'Older name: true is resolved "both", false is resolved false.',
      },
      rootOnly: {
        type: "boolean",
        description: "Only the comments that start a thread, no replies.",
      },
      unreadOnly: {
        type: "boolean",
        description:
          "Only comments unread for you. figma.com's comment list carries no read state today, " +
          "so this answers an error instead of guessing. Never marks anything read.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: COMMENTS_LIMIT_MAX,
        description: `Comments per page (1-${COMMENTS_LIMIT_MAX}, default ${COMMENTS_LIMIT_DEFAULT}).`,
      },
      cursor: {
        type: "string",
        description: "nextCursor from the previous page.",
      },
    },
  },
};

export const COMMENT_WRITE_TOOLS: ToolDefinition[] = [
  {
    name: "post_comment",
    description:
      "Start a new comment thread in the file, pinned to a layer (nodeId, optionally at offset " +
      "from its top-left corner) or to a point on the canvas (x, y in absolute canvas " +
      `coordinates, on pageId or the current page). ${REAL_FILE} Answers the new thread's id.`,
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: `The comment text, up to ${COMMENT_MAX_CHARS} characters.`,
        },
        nodeId: { type: "string", description: "The layer to pin the thread to." },
        offset: {
          ...POINT,
          description: "With nodeId: where the pin sits, from the layer's top-left corner.",
        },
        x: { type: "number", description: "Without nodeId: canvas x of the pin." },
        y: { type: "number", description: "Without nodeId: canvas y of the pin." },
        pageId: {
          type: "string",
          description: "Without nodeId: the page of the point (default: the current page).",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "reply_comment",
    description: `Reply to a comment thread, by the thread's id (the root comment's id from get_comments). ${REAL_FILE}`,
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The thread's root comment id." },
        message: {
          type: "string",
          description: `The reply, up to ${COMMENT_MAX_CHARS} characters.`,
        },
      },
      required: ["threadId", "message"],
    },
  },
  {
    name: "resolve_comment",
    description: `Resolve a comment thread, or reopen it with resolved: false. ${REAL_FILE}`,
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The thread's root comment id." },
        resolved: {
          type: "boolean",
          description: "true (default) resolves the thread, false reopens it.",
        },
      },
      required: ["threadId"],
    },
  },
  {
    name: "delete_comment",
    description:
      "Delete one of your own comments: a reply, or a thread's root comment, which removes the " +
      `whole thread. Comments by other people are refused. ${REAL_FILE}`,
    inputSchema: {
      type: "object",
      properties: {
        commentId: { type: "string", description: "The comment's id from get_comments." },
      },
      required: ["commentId"],
    },
  },
];
