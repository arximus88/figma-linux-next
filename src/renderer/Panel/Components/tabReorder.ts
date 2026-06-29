/**
 * tabReorder — a small, self-contained pointer-based horizontal reorder action
 * for the tab strip. Replaces the vendored svelte-dnd-action.
 *
 * Model (no detached clone, no shadow element → none of that library's
 * cleanup races can happen):
 *   - The DOM array order is NOT mutated during a drag. Each tab keeps its slot;
 *     we only apply CSS transforms.
 *   - The grabbed tab follows the cursor on the X axis (lifted, raised z-index).
 *   - The other tabs slide via a transform transition to open a gap at the
 *     drop position — that gap is the visual placeholder.
 *   - On drop we compute the final id order, clear every transform, and hand the
 *     order to `onReorder` in the SAME synchronous tick the store updates, so the
 *     browser never paints an intermediate frame (no jump).
 *
 * The action is attached to the strip container; it delegates from a single
 * pointerdown and only starts a drag from an element marked `[data-drag-handle]`
 * (the tab title area), so the close button and middle/right clicks are
 * untouched. A small movement threshold keeps plain clicks working.
 */

export interface TabReorderOptions {
  /** Called once on drop with the new full id order (left→right). */
  onReorder: (orderedIds: number[]) => void;
  /**
   * Called on pointerdown with the grabbed tab id, before any drag — so the
   * grabbed tab activates immediately (browser-style) and you always drag the
   * visually-distinct active tab instead of a transparent one that blends into
   * the tab it overlaps.
   */
  onActivate?: (id: number) => void;
  /** When false the action is inert (e.g. fewer than 2 tabs). */
  enabled?: boolean;
}

interface Slot {
  id: number;
  el: HTMLElement;
  left: number;
  width: number;
  center: number;
}

const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 150;

export function tabReorder(node: HTMLElement, opts: TabReorderOptions) {
  let options = opts;

  // Pending (pre-threshold) state
  let pointerId = -1;
  let startX = 0;
  let grabbedId = -1;
  let active = false;

  // Active-drag state (captured once the threshold is crossed)
  let slots: Slot[] = [];
  let grabIndex = -1;
  let gap = 0;

  function measure(): Slot[] {
    const els = [...node.querySelectorAll<HTMLElement>("[data-tab-id]")];
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: Number(el.dataset.tabId),
        el,
        left: r.left,
        width: r.width,
        center: r.left + r.width / 2,
      };
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (options.enabled === false) return;
    if (e.button !== 0) return; // left button only
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return; // grab only by the title area
    const wrapper = target.closest<HTMLElement>("[data-tab-id]");
    if (!wrapper) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    grabbedId = Number(wrapper.dataset.tabId);
    active = false;
    options.onActivate?.(grabbedId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function begin() {
    slots = measure();
    grabIndex = slots.findIndex((s) => s.id === grabbedId);
    if (grabIndex === -1) {
      cancel();
      return false;
    }
    gap = slots.length > 1 ? Math.max(0, slots[1].left - (slots[0].left + slots[0].width)) : 0;
    active = true;
    for (const s of slots) {
      s.el.style.willChange = "transform";
      if (s.id === grabbedId) {
        s.el.style.zIndex = "5";
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

  /** Insertion index of the grabbed tab among the others, given its center X. */
  function computeTarget(centerNow: number): number {
    let target = 0;
    for (let i = 0; i < slots.length; i++) {
      if (i === grabIndex) continue;
      if (slots[i].center < centerNow) target++;
    }
    return target;
  }

  /** Id order with the grabbed tab moved to `target`. */
  function orderFor(target: number): number[] {
    const ids = slots.map((s) => s.id);
    ids.splice(grabIndex, 1);
    ids.splice(target, 0, grabbedId);
    return ids;
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (!active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!begin()) return;
    }

    const grab = slots[grabIndex];
    const centerNow = grab.center + dx;
    const target = computeTarget(centerNow);
    const ids = orderFor(target);

    // Precise final layout for the new order (handles variable tab widths).
    const widthById = new Map(slots.map((s) => [s.id, s.width]));
    let cursor = slots[0].left;
    const newLeft = new Map<number, number>();
    for (const id of ids) {
      newLeft.set(id, cursor);
      cursor += (widthById.get(id) ?? 0) + gap;
    }

    for (const s of slots) {
      if (s.id === grabbedId) {
        s.el.style.transform = `translateX(${dx}px)`;
      } else {
        s.el.style.transform = `translateX(${(newLeft.get(s.id) ?? s.left) - s.left}px)`;
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    detachWindow();

    if (!active) {
      reset();
      return; // a plain click — leave it to the normal click handlers
    }

    const dx = e.clientX - startX;
    const target = computeTarget(slots[grabIndex].center + dx);
    const ids = orderFor(target);

    // Clear all transforms synchronously, then hand off the new order. Svelte
    // re-lays out in the new order on the next microtask; the browser paints
    // only once, so there is no flash back to the old positions.
    clearStyles();
    const changed = ids.some((id, i) => id !== slots[i].id);
    reset();
    if (changed) options.onReorder(ids);
  }

  function clearStyles() {
    for (const s of slots) {
      s.el.style.transition = "";
      s.el.style.transform = "";
      s.el.style.zIndex = "";
      s.el.style.position = "";
      s.el.style.willChange = "";
      s.el.classList.remove("tab-dragging");
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
    slots = [];
    grabIndex = -1;
    grabbedId = -1;
    pointerId = -1;
  }

  function cancel() {
    detachWindow();
    clearStyles();
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
