/**
 * tabHover — hover intent for the tab preview card (Main/Ui/TabPreviewView).
 *
 * Attached to the strip container; delegates from pointerover/pointerout so
 * tabs can come and go. After the pointer rests on a tab for SHOW_DELAY the
 * tab id and its rect go to main, which lays the card under the tab. Once a
 * card is up, moving to a neighbour switches it after the shorter SWITCH_DELAY
 * (browser tab strips do the same). Any click, drag start, wheel scroll or
 * window blur hides it: the card is information, never something to interact
 * with, and it must be gone by the time a tab view is re-attached on top.
 */

export interface TabHoverOptions {
  /** `app.tabHoverPreviews`; when false the action is inert. */
  enabled: boolean;
}

const SHOW_DELAY_MS = 550;
const SWITCH_DELAY_MS = 120;
/** Leaving one tab for the gap before the next must not flicker the card off. */
const HIDE_GRACE_MS = 80;

export function tabHover(node: HTMLElement, opts: TabHoverOptions) {
  let options = opts;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** Tab whose card is showing. */
  let shownId: number | null = null;
  /** Tab whose show timer is running. */
  let pendingId: number | null = null;

  const anchorOf = (wrapper: HTMLElement) => {
    const r = wrapper.getBoundingClientRect();
    return { left: r.left, width: r.width };
  };

  const clearTimers = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    pendingId = null;
  };

  function hide() {
    clearTimers();
    if (shownId === null) return;
    shownId = null;
    window.figmaApi.send("tabHoverEnd");
  }

  function onPointerOver(e: PointerEvent) {
    if (!options.enabled) return;
    const wrapper = (e.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
    if (!wrapper) return;
    const id = Number(wrapper.dataset.tabId);
    // Back on the tab whose card is up (or moving between its children): keep it.
    if (id === shownId) {
      clearTimeout(hideTimer);
      return;
    }
    if (id === pendingId) return;

    clearTimers();
    pendingId = id;
    showTimer = setTimeout(
      () => {
        pendingId = null;
        if (!wrapper.isConnected) return;
        shownId = id;
        window.figmaApi.send("tabHoverStart", id, anchorOf(wrapper));
      },
      shownId !== null ? SWITCH_DELAY_MS : SHOW_DELAY_MS,
    );
  }

  function onPointerOut(e: PointerEvent) {
    const wrapper = (e.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
    if (!wrapper) return;
    const to = e.relatedTarget as Node | null;
    if (to && wrapper.contains(to)) return; // still inside the same tab
    clearTimeout(showTimer);
    pendingId = null;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_GRACE_MS);
  }

  node.addEventListener("pointerover", onPointerOver);
  node.addEventListener("pointerout", onPointerOut);
  node.addEventListener("pointerdown", hide);
  node.addEventListener("wheel", hide, { passive: true });
  window.addEventListener("blur", hide);

  return {
    update(next: TabHoverOptions) {
      options = next;
      if (!next.enabled) hide();
    },
    destroy() {
      hide();
      node.removeEventListener("pointerover", onPointerOver);
      node.removeEventListener("pointerout", onPointerOut);
      node.removeEventListener("pointerdown", hide);
      node.removeEventListener("wheel", hide);
      window.removeEventListener("blur", hide);
    },
  };
}
