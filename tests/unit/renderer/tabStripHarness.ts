/**
 * tabStripHarness — a synthetic tab strip for driving tab-drag geometry in
 * tests, with no DOM and no browser.
 *
 * A strip is declared, not measured:
 *
 *     buildStrip(["a", { group: "work", tabs: ["b", "c"] }, "d"], "gnome")
 *
 * and the harness lays it out using the *real* metrics from the stylesheets
 * (the numbers below are transcribed from Panel/Components/List.svelte and
 * Panel/frames/FramedTabs.svelte). That matters: the bug this harness exists
 * to catch — tabs sliding out of their group while dragging — only appears
 * because the space in front of a group's first tab is not the plain 2px gap
 * between two loose tabs but the group's margin + border + padding + chip.
 * A harness that laid everything out on a uniform pitch would reproduce the
 * old, broken assumption and pass happily.
 *
 * Ids are strings for readability in failure messages; the layout core is
 * generic over `number | string`, and the production code passes numbers.
 */

import type {
  DragGroupBox,
  DragSlot,
  GroupMetrics,
  StripMetrics,
} from "../../../src/renderer/Panel/Components/tabDragLayout";

export type StripItem = string | StripGroup;

export interface StripGroup {
  group: string;
  tabs: string[];
  /** Header chip width. Defaults to CHIP_WIDTH; vary it to test long names. */
  chipWidth?: number;
  /** A collapsed group renders no tab wrappers — only its chip takes space. */
  collapsed?: boolean;
}

export type FrameName = "gnome" | "kde" | "windows";

/**
 * Per-frame box metrics, transcribed from the component stylesheets.
 *
 * Note `unitGap: 0` everywhere. The `gap` declared on `.tabs` applies to that
 * element's own children — the tab `<section>` and the trailing "+" button —
 * not to the tabs inside the section, which has no gap of its own. Tabs sit
 * flush; all visible separation comes from a group container's margin, or from
 * the dividers and padding inside a tab.
 */
interface FrameMetrics {
  /** Flex gap between top-level strip children (`section` has none). */
  unitGap: number;
  /** Where the strip's content box starts. */
  originX: number;
  /** `.tab-group-container` horizontal margin. */
  groupMargin: number;
  /** `.tab-group-container` border width, one side. */
  groupBorder: number;
  groupPaddingLeft: number;
  groupPaddingRight: number;
  /** Flex gap between tabs inside a group container. */
  groupGap: number;
  /** Gap between the chip and the first tab, when the chip carries its own margin. */
  chipMarginRight: number;
}

const FRAMES: Record<FrameName, FrameMetrics> = {
  // List.svelte: .tab-group-container[data-frame="gnome"] — border 1px,
  // margin 0 4px, padding-left 5px, padding-right 3px, gap 2px.
  gnome: {
    unitGap: 0,
    originX: 0,
    groupMargin: 4,
    groupBorder: 1,
    groupPaddingLeft: 5,
    groupPaddingRight: 3,
    groupGap: 2,
    chipMarginRight: 0,
  },
  // kde: no border, margin 0 4px, padding-left 5px / right 2px, gap 0,
  // chip margin 0 4px 0 0. `.tabs` padding 0 4px.
  kde: {
    unitGap: 0,
    originX: 4,
    groupMargin: 4,
    groupBorder: 0,
    groupPaddingLeft: 5,
    groupPaddingRight: 2,
    groupGap: 0,
    chipMarginRight: 4,
  },
  // windows/macos: no border, margin 0 4px, padding-left 5px / right 0, gap 0,
  // chip margin 0 4px 0 0. `.tabs` padding 0 16px.
  windows: {
    unitGap: 0,
    originX: 16,
    groupMargin: 4,
    groupBorder: 0,
    groupPaddingLeft: 5,
    groupPaddingRight: 0,
    groupGap: 0,
    chipMarginRight: 4,
  },
};

/** Default widths. Real tabs vary; tests override per id where it matters. */
export const TAB_WIDTH = 180;
export const CHIP_WIDTH = 92;

export interface BuildStripOptions {
  frame?: FrameName;
  /** Per-tab width overrides, by id. */
  widths?: Record<string, number>;
  /** Where the strip's content box starts on screen. */
  originX?: number;
}

export interface Strip {
  /** Every rendered tab wrapper, left to right — what a tab drag reorders. */
  slots: DragSlot[];
  /** Group container boxes, for drop-membership decisions. */
  groups: DragGroupBox[];
  /**
   * Top-level strip children — loose tabs and whole group containers — which
   * is what a *group* drag reorders. Ids are the tab id or the group id.
   */
  units: DragSlot[];
  /** Which tab ids each group holds, in order. */
  groupMembers: Map<string, string[]>;
  frame: FrameMetrics;
  /** Box metrics for the layout core, describing this very strip. */
  metrics: StripMetrics;
  /** Right edge of the last slot: the strip's occupied span. */
  right: number;
}

/**
 * Lay a declared strip out into absolute boxes, exactly the way flexbox would.
 */
export function buildStrip(items: StripItem[], options: BuildStripOptions | FrameName = {}): Strip {
  const opts: BuildStripOptions = typeof options === "string" ? { frame: options } : options;
  const frame = FRAMES[opts.frame ?? "gnome"];
  const widthOf = (id: string) => opts.widths?.[id] ?? TAB_WIDTH;

  const slots: DragSlot[] = [];
  const groups: DragGroupBox[] = [];
  const units: DragSlot[] = [];
  const groupMembers = new Map<string, string[]>();
  const groupMetrics = new Map<string, GroupMetrics>();

  const origin = opts.originX ?? frame.originX;
  let cursor = origin;

  items.forEach((item, index) => {
    if (index > 0) cursor += frame.unitGap;

    if (typeof item === "string") {
      const width = widthOf(item);
      slots.push({ id: item, left: cursor, width });
      units.push({ id: item, left: cursor, width });
      cursor += width;
      return;
    }

    const chipWidth = item.chipWidth ?? CHIP_WIDTH;
    const containerLeft = cursor + frame.groupMargin;
    let inner = containerLeft + frame.groupBorder + frame.groupPaddingLeft;

    const headerLeft = inner;
    const headerRight = headerLeft + chipWidth;
    inner = headerRight + frame.chipMarginRight;

    const members: string[] = [];
    if (!item.collapsed) {
      for (const tabId of item.tabs) {
        inner += frame.groupGap;
        const width = widthOf(tabId);
        slots.push({ id: tabId, left: inner, width, groupId: item.group });
        members.push(tabId);
        inner += width;
      }
    }

    const containerRight = inner + frame.groupPaddingRight + frame.groupBorder;
    const containerWidth = containerRight - containerLeft;

    groups.push({
      groupId: item.group,
      left: containerLeft,
      right: containerRight,
      headerLeft,
      headerRight,
    });
    units.push({ id: item.group, left: containerLeft, width: containerWidth });
    groupMembers.set(item.group, members);
    // The same numbers the layout core needs, produced by the same pass that
    // places the boxes — so the model and the "rendered" strip cannot drift.
    groupMetrics.set(item.group, {
      margin: frame.groupMargin,
      leadIn:
        frame.groupBorder +
        frame.groupPaddingLeft +
        chipWidth +
        frame.chipMarginRight +
        frame.groupGap,
      trail: frame.groupPaddingRight + frame.groupBorder,
      innerGap: frame.groupGap,
    });

    cursor = containerRight + frame.groupMargin;
  });

  const last = slots[slots.length - 1];
  return {
    slots,
    groups,
    units,
    groupMembers,
    frame,
    metrics: { origin, unitGap: frame.unitGap, groups: groupMetrics },
    right: last ? last.left + last.width : cursor,
  };
}

/** Index of a slot by id, for grabbing it. */
export function indexOf(slots: DragSlot[], id: string): number {
  const index = slots.findIndex((s) => s.id === id);
  if (index === -1) throw new Error(`no slot "${id}" in strip [${slots.map((s) => s.id)}]`);
  return index;
}

/**
 * How far the pointer must travel for the grabbed slot's center to land on
 * `x` — the natural unit for "drag this tab onto that one".
 */
export function dxToReach(slots: DragSlot[], grabIndex: number, x: number): number {
  const grabbed = slots[grabIndex];
  return x - (grabbed.left + grabbed.width / 2);
}

/** The center of a slot, by id — a convenient drag destination. */
export function centerOf(slots: DragSlot[], id: string): number {
  const slot = slots[indexOf(slots, id)];
  return slot.left + slot.width / 2;
}

/**
 * Apply a layout's offsets to produce the boxes as they would actually paint.
 * This is what the invariant checks inspect: not the intended order, but where
 * the pixels end up.
 */
export function paint(slots: DragSlot[], offsets: Map<number | string, number>): DragSlot[] {
  return slots.map((slot) => ({ ...slot, left: slot.left + (offsets.get(slot.id) ?? 0) }));
}
