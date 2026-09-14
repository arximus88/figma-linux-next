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
 */

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

interface TabSlot {
  id: number;
  el: HTMLElement;
  left: number;
  width: number;
  center: number;
  groupId?: string;
}

interface GroupInfo {
  groupId: string;
  el: HTMLElement;
  left: number;
  right: number;
  headerLeft: number;
  headerRight: number;
}

interface GroupDragUnit {
  type: "group" | "tab";
  id: string | number;
  el: HTMLElement;
  left: number;
  width: number;
  center: number;
  tabIds: number[];
}

const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 150;

export function tabReorder(node: HTMLElement, opts: TabReorderOptions) {
  let options = opts;

  // Pending (pre-threshold) state
  let pointerId = -1;
  let startX = 0;
  let isGroupDrag = false;
  let grabbedId = -1;
  let grabbedGroupId = "";
  let active = false;

  // Tab drag state
  let slots: TabSlot[] = [];
  let groups: GroupInfo[] = [];
  let grabIndex = -1;
  let tabGap = 0;

  // Group drag state
  let groupUnits: GroupDragUnit[] = [];
  let grabUnitIndex = -1;
  let groupGap = 0;

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
        center: r.left + r.width / 2,
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
        units.push({
          type: "group",
          id: gid,
          el: child,
          left: r.left,
          width: r.width,
          center: r.left + r.width / 2,
          tabIds,
        });
      } else if (child.dataset.tabId) {
        const tid = Number(child.dataset.tabId);
        const r = child.getBoundingClientRect();
        units.push({
          type: "tab",
          id: tid,
          el: child,
          left: r.left,
          width: r.width,
          center: r.left + r.width / 2,
          tabIds: [tid],
        });
      }
    }
    return units;
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
    tabGap = slots.length > 1 ? Math.max(0, slots[1].left - (slots[0].left + slots[0].width)) : 0;
    active = true;

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
    groupGap =
      groupUnits.length > 1
        ? Math.max(0, groupUnits[1].left - (groupUnits[0].left + groupUnits[0].width))
        : 0;
    active = true;

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

  function computeTabTarget(centerNow: number): number {
    let target = 0;
    for (let i = 0; i < slots.length; i++) {
      if (i === grabIndex) continue;
      if (slots[i].center < centerNow) target++;
    }
    return target;
  }

  function computeGroupTarget(centerNow: number): number {
    let target = 0;
    for (let i = 0; i < groupUnits.length; i++) {
      if (i === grabUnitIndex) continue;
      if (groupUnits[i].center < centerNow) target++;
    }
    return target;
  }

  function orderForTabs(target: number): number[] {
    const ids = slots.map((s) => s.id);
    ids.splice(grabIndex, 1);
    ids.splice(target, 0, grabbedId);
    return ids;
  }

  function determineTargetGroupId(
    centerNow: number,
    target: number,
    candidateIds: number[],
  ): string | undefined {
    const leftId = target > 0 ? candidateIds[target - 1] : undefined;
    const rightId = target < candidateIds.length - 1 ? candidateIds[target + 1] : undefined;
    const leftSlot = leftId !== undefined ? slots.find((s) => s.id === leftId) : undefined;
    const rightSlot = rightId !== undefined ? slots.find((s) => s.id === rightId) : undefined;

    // Both neighbors in candidate order belong to the same group -> inside that group
    if (leftSlot?.groupId && leftSlot.groupId === rightSlot?.groupId) {
      return leftSlot.groupId;
    }

    const currentSlot = slots[grabIndex];

    for (const g of groups) {
      const originatedInG = currentSlot?.groupId === g.groupId;

      if (originatedInG) {
        // Tab was in group G: check if cursor has moved outside group G's boundary
        const otherSlots = slots.filter((s) => s.groupId === g.groupId && s.id !== grabbedId);
        if (otherSlots.length > 0) {
          const maxR = Math.max(...otherSlots.map((s) => s.left + s.width));
          if (centerNow > maxR + 25) continue;
          if (centerNow < g.headerLeft - 20) continue;
          return g.groupId;
        } else {
          // Tab was the only tab in group G
          if (centerNow < g.headerLeft - 25 || centerNow > g.headerRight + 45) continue;
          return g.groupId;
        }
      } else {
        // Outside tab hovering over group G
        if (centerNow >= g.headerLeft - 15 && centerNow <= g.right + 15) {
          return g.groupId;
        }
      }
    }

    return undefined;
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;

    if (isGroupDrag) {
      if (!active) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!beginGroupDrag()) return;
      }

      const grabUnit = groupUnits[grabUnitIndex];
      const centerNow = grabUnit.center + dx;
      const target = computeGroupTarget(centerNow);

      const newUnits = groupUnits.slice();
      newUnits.splice(grabUnitIndex, 1);
      newUnits.splice(target, 0, grabUnit);

      let cursor = groupUnits[0].left;
      const newLeft = new Map<string | number, number>();
      for (const u of newUnits) {
        newLeft.set(u.id, cursor);
        cursor += u.width + groupGap;
      }

      for (const u of groupUnits) {
        if (u.id === grabUnit.id) {
          u.el.style.transform = `translateX(${dx}px)`;
        } else {
          u.el.style.transform = `translateX(${(newLeft.get(u.id) ?? u.left) - u.left}px)`;
        }
      }
    } else {
      if (!active) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!beginTabDrag()) return;
      }

      const grab = slots[grabIndex];
      const centerNow = grab.center + dx;
      const target = computeTabTarget(centerNow);
      const ids = orderForTabs(target);
      const targetGroupId = determineTargetGroupId(centerNow, target, ids);

      // Highlight drop target group if hovering over a new group
      for (const g of groups) {
        if (targetGroupId && g.groupId === targetGroupId && targetGroupId !== grab.groupId) {
          g.el.classList.add("tab-group-drop-target");
        } else {
          g.el.classList.remove("tab-group-drop-target");
        }
      }

      const widthById = new Map(slots.map((s) => [s.id, s.width]));
      let cursor = slots[0].left;
      const newLeft = new Map<number, number>();
      for (const id of ids) {
        newLeft.set(id, cursor);
        cursor += (widthById.get(id) ?? 0) + tabGap;
      }

      for (const s of slots) {
        if (s.id === grabbedId) {
          s.el.style.transform = `translateX(${dx}px)`;
        } else {
          s.el.style.transform = `translateX(${(newLeft.get(s.id) ?? s.left) - s.left}px)`;
        }
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

      const target = computeGroupTarget(groupUnits[grabUnitIndex].center + dx);
      const newUnits = groupUnits.slice();
      newUnits.splice(grabUnitIndex, 1);
      newUnits.splice(target, 0, groupUnits[grabUnitIndex]);

      const finalTabIds: number[] = [];
      for (const u of newUnits) {
        finalTabIds.push(...u.tabIds);
      }

      clearGroupStyles();
      const changed = target !== grabUnitIndex;
      reset();
      if (changed) options.onReorder(finalTabIds);
    } else {
      // Single tab drop
      const target = computeTabTarget(slots[grabIndex].center + dx);
      const ids = orderForTabs(target);
      const targetGroupId = determineTargetGroupId(slots[grabIndex].center + dx, target, ids);

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
    },
  };
}
