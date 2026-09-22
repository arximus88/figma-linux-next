/**
 * tabReorder — a small, self-contained pointer-based horizontal reorder action
 * for the tab strip.
 *
 * Supports:
 *   1. Individual tab dragging:
 *      - Reorder among tabs.
 *      - Drag into a group (attaches to group, with visual drop highlight).
 *      - Drag out of a group (detaches from group).
 *      - Drag between groups.
 *   2. Entire group dragging:
 *      - Grab the group chip (.tab-group-header).
 *      - Drag the whole group (chip + all member tabs) as a single block across the strip.
 *
 * Model:
 *   - The DOM array order is NOT mutated during a drag. Each element keeps its slot;
 *     we apply only CSS transforms.
 *   - The grabbed element (tab or group container) follows the cursor on the X axis.
 *   - Other elements slide via transform transitions to open a gap at the drop position.
 *   - On drop we compute the final id order and group assignments, clear every transform,
 *     and hand the result to `onReorder` in the SAME synchronous tick the store updates.
 *
 * This file is the DOM half only: measure the strip, call the pure geometry in
 * ./tabDragLayout, write the resulting transforms back. Anything that decides
 * *where* a tab lands belongs there, where it is testable without a browser.
 */

import {
  computeDragLayout,
  deriveStripMetrics,
  type DragGroupBox,
  type DragSlot,
  type StripMetrics,
} from "./tabDragLayout";

export interface TabReorderOptions {
  /** Called once on drop with the new full id order (left→right) and any group membership changes. */
  onReorder: (orderedIds: number[], groupAssignments?: Map<number, string | undefined>) => void;
  /** Called on pointerdown with the grabbed tab id, before any drag. */
  onActivate?: (id: number) => void;
  /** Called when a group chip is clicked without dragging (toggle collapse). */
  onToggleGroupCollapse?: (groupId: string) => void;
  /** When false the action is inert. */
  enabled?: boolean;
}

/** A measured tab wrapper: the pure geometry plus the element to transform. */
interface TabSlot extends DragSlot {
  id: number;
  el: HTMLElement;
}

interface GroupInfo extends DragGroupBox {
  el: HTMLElement;
}

/** A top-level strip child during a group drag: a whole group, or a loose tab. */
interface GroupDragUnit extends DragSlot {
  type: "group" | "tab";
  el: HTMLElement;
  tabIds: number[];
}

const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 150;

export function tabReorder(node: HTMLElement, opts: TabReorderOptions) {
  let options = opts;

  // Pending (pre-threshold) state
  let pointerId = -1;
  let startX = 0;
  /** Live pointer x, for group membership — see ResolveGroupParams.pointerX. */
  let pointerX = 0;
  let isGroupDrag = false;
  let grabbedId = -1;
  let grabbedGroupId = "";
  let active = false;

  // Tab drag state
  let slots: TabSlot[] = [];
  let groups: GroupInfo[] = [];
  let grabIndex = -1;
  let metrics: StripMetrics | undefined;

  // Group drag state
  let groupUnits: GroupDragUnit[] = [];
  let grabUnitIndex = -1;

  // The strip that clips us (`.tabs`), while it is unclipped for a drag.
  let unclippedStrip: HTMLElement | null = null;

  /**
   * The tab strip is `overflow-x: scroll`, which per spec forces `overflow-y`
   * to `auto` — so the lifted tab's shadow, and any part of it raised above
   * the row, get clipped: the tab slides along in a gutter instead of reading
   * as picked up. Drop the clipping for the duration of the drag, but only
   * while the strip isn't actually scrollable; with the tabs overflowing,
   * `overflow: visible` would spill them across the whole panel.
   */
  function unclipStrip() {
    const strip = node.closest<HTMLElement>(".tabs");
    if (!strip) return;
    if (strip.scrollWidth > strip.clientWidth + 1) return;
    strip.classList.add("tabs-dragging");
    unclippedStrip = strip;
  }

  function reclipStrip() {
    unclippedStrip?.classList.remove("tabs-dragging");
    unclippedStrip = null;
  }

  function measureTabSlots(): TabSlot[] {
    const els = [...node.querySelectorAll<HTMLElement>("[data-tab-id]")];
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const groupContainer = el.closest<HTMLElement>("[data-group-id]");
      return {
        id: Number(el.dataset.tabId),
        el,
        left: r.left,
        width: r.width,
        groupId: groupContainer?.dataset.groupId,
      };
    });
  }

  function measureGroups(): GroupInfo[] {
    const groupEls = [...node.querySelectorAll<HTMLElement>("[data-group-id]")];
    return groupEls.map((el) => {
      const r = el.getBoundingClientRect();
      const h = el.querySelector<HTMLElement>(".tab-group-header")?.getBoundingClientRect() ?? r;
      return {
        groupId: el.dataset.groupId ?? "",
        el,
        left: r.left,
        right: r.right,
        headerLeft: h.left,
        headerRight: h.right,
      };
    });
  }

  function measureGroupUnits(): GroupDragUnit[] {
    const units: GroupDragUnit[] = [];
    for (const child of Array.from(node.children) as HTMLElement[]) {
      if (child.dataset.groupId) {
        const gid = child.dataset.groupId;
        const tabEls = child.querySelectorAll<HTMLElement>("[data-tab-id]");
        const tabIds = Array.from(tabEls).map((el) => Number(el.dataset.tabId));
        const r = child.getBoundingClientRect();
        units.push({ type: "group", id: gid, el: child, left: r.left, width: r.width, tabIds });
      } else if (child.dataset.tabId) {
        const tid = Number(child.dataset.tabId);
        const r = child.getBoundingClientRect();
        units.push({
          type: "tab",
          id: tid,
          el: child,
          left: r.left,
          width: r.width,
          tabIds: [tid],
        });
      }
    }
    return units;
  }

  /**
   * Box metrics for the layout model. Most of it is read back from the measured
   * rects; the two that can't be (a container's margin is indistinguishable
   * from the strip's gap when all you have is boxes) come from computed style.
   */
  function measureMetrics(): StripMetrics {
    const sectionStyle = getComputedStyle(node);
    const unitGap = Number.parseFloat(sectionStyle.columnGap) || 0;

    const groupMargin = new Map<string, number>();
    for (const g of groups) {
      const style = getComputedStyle(g.el);
      groupMargin.set(g.groupId, Number.parseFloat(style.marginLeft) || 0);
    }

    const origin = slots.length > 0 ? Math.min(...slots.map((s) => s.left)) : 0;
    const firstGroup = groups[0];
    return deriveStripMetrics({
      slots,
      groups,
      origin: firstGroup
        ? Math.min(origin, firstGroup.left - (groupMargin.get(firstGroup.groupId) ?? 0))
        : origin,
      unitGap,
      groupMargin,
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (options.enabled === false) return;
    if (pointerId !== -1) return;
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;

    // 1. Check if grabbed by group header chip
    const groupHeader = target.closest<HTMLElement>(".tab-group-header");
    if (groupHeader) {
      const container = groupHeader.closest<HTMLElement>("[data-group-id]");
      if (!container) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      pointerX = e.clientX;
      isGroupDrag = true;
      grabbedGroupId = container.dataset.groupId ?? "";
      active = false;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      return;
    }

    // 2. Check if grabbed by tab drag handle
    if (!target.closest("[data-drag-handle]")) return;
    const wrapper = target.closest<HTMLElement>("[data-tab-id]");
    if (!wrapper) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    pointerX = e.clientX;
    isGroupDrag = false;
    grabbedId = Number(wrapper.dataset.tabId);
    active = false;
    options.onActivate?.(grabbedId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function beginTabDrag(): boolean {
    slots = measureTabSlots();
    grabIndex = slots.findIndex((s) => s.id === grabbedId);
    if (grabIndex === -1) {
      cancel();
      return false;
    }
    groups = measureGroups();
    metrics = measureMetrics();
    active = true;
    unclipStrip();

    for (const s of slots) {
      s.el.style.willChange = "transform";
      if (s.id === grabbedId) {
        s.el.style.zIndex = "25";
        s.el.style.position = "relative";
        s.el.classList.add("tab-dragging");
      } else {
        s.el.style.transition = `transform ${SLIDE_MS}ms ease`;
      }
    }
    try {
      node.setPointerCapture(pointerId);
    } catch {}
    return true;
  }

  function beginGroupDrag(): boolean {
    groupUnits = measureGroupUnits();
    grabUnitIndex = groupUnits.findIndex((u) => u.type === "group" && u.id === grabbedGroupId);
    if (grabUnitIndex === -1) {
      cancel();
      return false;
    }
    active = true;
    unclipStrip();

    for (const u of groupUnits) {
      u.el.style.willChange = "transform";
      if (u.type === "group" && u.id === grabbedGroupId) {
        u.el.style.zIndex = "25";
        u.el.style.position = "relative";
        u.el.classList.add("group-dragging");
      } else {
        u.el.style.transition = `transform ${SLIDE_MS}ms ease`;
      }
    }
    try {
      node.setPointerCapture(pointerId);
    } catch {}
    return true;
  }

  /** One frame of a tab drag, straight from the pure core. */
  function tabLayoutFor(dx: number) {
    return computeDragLayout({ slots, grabIndex, dx, groups, metrics, pointerX });
  }

  /** One frame of a group drag. Membership can't change, so no group boxes. */
  function groupLayoutFor(dx: number) {
    return computeDragLayout({ slots: groupUnits, grabIndex: grabUnitIndex, dx });
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    pointerX = e.clientX;

    if (isGroupDrag) {
      if (!active) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!beginGroupDrag()) return;
      }

      const { offsets } = groupLayoutFor(dx);
      for (const u of groupUnits) {
        u.el.style.transform = `translateX(${offsets.get(u.id) ?? 0}px)`;
      }
    } else {
      if (!active) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!beginTabDrag()) return;
      }

      const { offsets, groupOffsets, targetGroupId } = tabLayoutFor(dx);
      const fromGroupId = slots[grabIndex].groupId;

      for (const g of groups) {
        // Highlight the group the tab would join, but only when it isn't the
        // one it already belongs to. This highlight is the only feedback for a
        // pending membership change: the container itself must not resize
        // mid-drag — see DragLayout.previewOrder for why.
        const isNewHome = targetGroupId === g.groupId && targetGroupId !== fromGroupId;
        g.el.classList.toggle("tab-group-drop-target", isNewHome);

        g.el.style.transform = `translateX(${groupOffsets.get(g.groupId) ?? 0}px)`;
      }

      for (const s of slots) {
        s.el.style.transform = `translateX(${offsets.get(s.id) ?? 0}px)`;
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    detachWindow();

    if (!active) {
      reset();
      return;
    }

    const dx = e.clientX - startX;
    pointerX = e.clientX;

    if (isGroupDrag) {
      // Suppress synthetic click after drag so chip collapse is not triggered
      const targetEl = e.target as HTMLElement;
      const killClick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        targetEl.removeEventListener("click", killClick, true);
        window.removeEventListener("click", killClick, true);
      };
      targetEl.addEventListener("click", killClick, true);
      window.addEventListener("click", killClick, true);
      setTimeout(() => {
        targetEl.removeEventListener("click", killClick, true);
        window.removeEventListener("click", killClick, true);
      }, 50);

      const { order, target } = groupLayoutFor(dx);
      const unitById = new Map(groupUnits.map((u) => [u.id, u]));
      const finalTabIds: number[] = [];
      for (const id of order) {
        const unit = unitById.get(id);
        if (unit) finalTabIds.push(...unit.tabIds);
      }

      clearGroupStyles();
      const changed = target !== grabUnitIndex;
      reset();
      if (changed) options.onReorder(finalTabIds);
    } else {
      // Single tab drop
      const { order, targetGroupId } = tabLayoutFor(dx);
      const ids = order as number[];

      clearTabStyles();

      const groupAssignments = new Map<number, string | undefined>();
      groupAssignments.set(grabbedId, targetGroupId);

      const orderChanged = ids.some((id, i) => id !== slots[i].id);
      const groupChanged = targetGroupId !== slots[grabIndex].groupId;

      reset();
      if (orderChanged || groupChanged) {
        options.onReorder(ids, groupAssignments);
      }
    }
  }

  function clearTabStyles() {
    reclipStrip();
    for (const g of groups) {
      g.el.style.transform = "";
      // Belt and braces: an older revision set an inline width here, and a drag
      // torn down by pointercancel left it behind, quietly corrupting the
      // strip's geometry for every drag afterwards.
      g.el.style.width = "";
    }
    for (const s of slots) {
      s.el.style.transition = "";
      s.el.style.transform = "";
      s.el.style.zIndex = "";
      s.el.style.position = "";
      s.el.style.willChange = "";
      s.el.classList.remove("tab-dragging");
    }
    for (const g of groups) {
      g.el.classList.remove("tab-group-drop-target");
    }
  }

  function clearGroupStyles() {
    reclipStrip();
    for (const u of groupUnits) {
      u.el.style.transition = "";
      u.el.style.transform = "";
      u.el.style.zIndex = "";
      u.el.style.position = "";
      u.el.style.willChange = "";
      u.el.classList.remove("group-dragging");
    }
  }

  function detachWindow() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    try {
      if (pointerId !== -1) node.releasePointerCapture(pointerId);
    } catch {}
  }

  function reset() {
    active = false;
    isGroupDrag = false;
    slots = [];
    groups = [];
    groupUnits = [];
    grabIndex = -1;
    grabUnitIndex = -1;
    metrics = undefined;
    grabbedId = -1;
    grabbedGroupId = "";
    pointerId = -1;
  }

  function cancel() {
    detachWindow();
    clearTabStyles();
    clearGroupStyles();
    reset();
  }

  node.addEventListener("pointerdown", onPointerDown);

  return {
    update(o: TabReorderOptions) {
      options = o;
    },
    destroy() {
      node.removeEventListener("pointerdown", onPointerDown);
      detachWindow();
      reclipStrip();
    },
  };
}
