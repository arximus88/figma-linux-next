/**
 * tabDragLayout — the geometry of a tab-strip drag, with no DOM in sight.
 *
 * `tabReorder.ts` measures the strip, hands the numbers here, and applies the
 * result as CSS transforms. Everything that decides *where things go* lives in
 * this file, so it can be driven from synthetic strips in tests (see
 * tests/unit/renderer/tabStripHarness.ts) instead of a real browser.
 *
 * Why this is a full re-layout, not a shuffle of offsets
 * -----------------------------------------------------
 * The strip is not a uniform row of tabs. Its top-level children are *units*:
 * a loose tab, or a whole group container with its own margin, border, padding
 * and header chip. A tab inside a group is nested one level down.
 *
 *     [ tab ][ tab ]  ⟨margin⟩[ chip | tab | tab ]⟨margin⟩  [ tab ]
 *                              └────── group container ─────┘
 *
 * An earlier version measured one gap between the strip's first two tabs and
 * stepped every tab by it. With a group present that pitch is wrong in both
 * directions: it ignores the chip and padding in front of a group's first tab,
 * and it invents spacing between tabs that actually sit flush. Tabs drifted out
 * of their container — which is exactly the "tabs poke out of the group" report
 * this module was rewritten to fix.
 *
 * Worse, transforming a *tab* can never move the container drawn around it. So
 * the layout below works on both levels at once: it rebuilds the whole strip
 * from the tab sequence and its group membership, and reports offsets for tabs
 * *and* for group containers. Reordering across a group boundary then moves the
 * container with its contents, and the painted border always wraps the tabs it
 * owns.
 *
 * `layoutStrip` is a faithful model of the flexbox the browser runs: laying out
 * the unchanged sequence reproduces the measured boxes exactly, which is the
 * first thing the tests assert.
 */

/** One draggable box in the strip: a tab wrapper, or a whole group container. */
export interface DragSlot {
  id: number | string;
  left: number;
  width: number;
  /** Group the slot belongs to, for tab slots inside a group container. */
  groupId?: string;
}

/** A group container's measured box, used to decide drop membership. */
export interface DragGroupBox {
  groupId: string;
  left: number;
  right: number;
  headerLeft: number;
  headerRight: number;
}

/** The box metrics of one group container, read off the live strip. */
export interface GroupMetrics {
  /** Horizontal margin, outside the border (`.tab-group-container` margin: 0 4px). */
  margin: number;
  /** Container's left edge to its first tab: border + padding + chip + gap. */
  leadIn: number;
  /** Last tab's right edge to the container's right edge: padding + border. */
  trail: number;
  /** Flex gap between two tabs inside the container. */
  innerGap: number;
}

/** Everything needed to lay the strip out from scratch. */
export interface StripMetrics {
  /** Left edge of the strip's content box — where the first unit starts. */
  origin: number;
  /** Flex gap between top-level units. */
  unitGap: number;
  groups: Map<string, GroupMetrics>;
}

/**
 * Hysteresis around a group's container box, in px.
 *
 * Both bands are measured against the *container*, never against a sibling
 * tab. Measuring against the last sibling's right edge (as an earlier version
 * did, with a 25px band) detached a group's last tab the instant it was
 * grabbed: a 180px-wide tab has its center ~90px past its neighbour's edge, so
 * the tab was already "outside" at zero displacement, and dropping it straight
 * back in was impossible.
 *
 * `leave` is larger than `join` on purpose: leaving a group should take
 * deliberate travel, while joining one should feel willing. Equal bands would
 * make a tab flip membership back and forth on a single pixel of jitter.
 */
export const GROUP_HYSTERESIS = {
  /** A member detaches once its center is this far outside the container. */
  leave: 40,
  /** An outside tab joins once its center is within this much of the container. */
  join: 15,
} as const;

export const slotCenter = (slot: DragSlot): number => slot.left + slot.width / 2;
export const slotRight = (slot: DragSlot): number => slot.left + slot.width;

/** Where every tab and every group container lands, in absolute coordinates. */
export interface StripLayout {
  tabs: Map<number | string, number>;
  groups: Map<string, { left: number; right: number }>;
  /** Right edge of the laid-out strip. */
  right: number;
}

/**
 * Lay a tab sequence out the way flexbox would, given each tab's group.
 *
 * `groupOf` decides membership, so a drag in progress can move a tab between
 * groups by answering differently for the grabbed id — no need to mutate the
 * input. Consecutive tabs answering the same group share one container; a group
 * that ends up with no tabs simply doesn't appear.
 */
export function layoutStrip(
  sequence: DragSlot[],
  groupOf: (id: number | string) => string | undefined,
  metrics: StripMetrics,
): StripLayout {
  const tabs = new Map<number | string, number>();
  const groups = new Map<string, { left: number; right: number }>();

  let cursor = metrics.origin;
  let first = true;

  for (let i = 0; i < sequence.length; ) {
    const groupId = groupOf(sequence[i].id);

    if (!first) cursor += metrics.unitGap;
    first = false;

    if (groupId === undefined) {
      tabs.set(sequence[i].id, cursor);
      cursor += sequence[i].width;
      i++;
      continue;
    }

    const box = metrics.groups.get(groupId) ?? { margin: 0, leadIn: 0, trail: 0, innerGap: 0 };
    cursor += box.margin;

    const containerLeft = cursor;
    let inner = containerLeft + box.leadIn;

    let member = 0;
    while (i < sequence.length && groupOf(sequence[i].id) === groupId) {
      if (member > 0) inner += box.innerGap;
      tabs.set(sequence[i].id, inner);
      inner += sequence[i].width;
      member++;
      i++;
    }

    const containerRight = inner + box.trail;
    groups.set(groupId, { left: containerLeft, right: containerRight });
    cursor = containerRight + box.margin;
  }

  return { tabs, groups, right: cursor };
}

/**
 * Derive the strip's metrics from what was measured, so the layout model and
 * the live DOM agree without either hardcoding the stylesheet.
 *
 * `unitGap` and each group's `margin` cannot be told apart from boxes alone
 * (the space between a tab and a group container is `unitGap + margin`), so the
 * caller supplies them — tabReorder reads them off `getComputedStyle`, the test
 * harness knows its own. Everything else is read back from the boxes.
 */
export function deriveStripMetrics(params: {
  slots: DragSlot[];
  groups: DragGroupBox[];
  origin: number;
  unitGap: number;
  /** Container margin, by group id; a single number applies to all. */
  groupMargin: number | Map<string, number>;
  /** Used when a group holds one tab and its inner gap can't be observed. */
  fallbackInnerGap?: number;
}): StripMetrics {
  const { slots, groups, origin, unitGap, groupMargin, fallbackInnerGap = 0 } = params;
  const marginOf = (groupId: string) =>
    typeof groupMargin === "number" ? groupMargin : (groupMargin.get(groupId) ?? 0);

  // Any observed inner gap is a better default than 0 for a group that has
  // only one tab: groups in one strip share a stylesheet.
  let observedInnerGap: number | undefined;
  const metrics = new Map<string, GroupMetrics>();

  for (const box of groups) {
    const members = slots.filter((s) => s.groupId === box.groupId);
    if (members.length === 0) {
      metrics.set(box.groupId, {
        margin: marginOf(box.groupId),
        // No tabs to measure against: treat the chip as the whole content.
        leadIn: box.headerRight - box.left,
        trail: box.right - box.headerRight,
        innerGap: fallbackInnerGap,
      });
      continue;
    }

    const firstTab = members[0];
    const lastTab = members[members.length - 1];
    const innerGap =
      members.length > 1 ? Math.max(0, members[1].left - slotRight(members[0])) : undefined;
    if (innerGap !== undefined) observedInnerGap = innerGap;

    metrics.set(box.groupId, {
      margin: marginOf(box.groupId),
      leadIn: firstTab.left - box.left,
      trail: box.right - slotRight(lastTab),
      innerGap: innerGap ?? fallbackInnerGap,
    });
  }

  // Second pass: fill in the groups that had nothing to measure.
  if (observedInnerGap !== undefined) {
    for (const [groupId, m] of metrics) {
      const members = slots.filter((s) => s.groupId === groupId);
      if (members.length < 2) metrics.set(groupId, { ...m, innerGap: observedInnerGap });
    }
  }

  return { origin, unitGap, groups: metrics };
}

/**
 * Which position the grabbed slot should occupy, given where its center is now.
 *
 * Counting the slots whose center the grabbed one has passed — rather than
 * comparing against position boundaries — is what makes the swap happen at the
 * halfway point and keeps it stable: the count changes only when a center is
 * actually crossed, so a slot can't oscillate between two targets while the
 * pointer sits still.
 */
export function computeTargetIndex(
  slots: DragSlot[],
  grabIndex: number,
  centerNow: number,
): number {
  let target = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i === grabIndex) continue;
    if (slotCenter(slots[i]) < centerNow) target++;
  }
  return target;
}

/** The slot ids in their post-drop order: the grabbed one lifted out and reinserted. */
export function computeOrder(
  slots: DragSlot[],
  grabIndex: number,
  target: number,
): (number | string)[] {
  const ids = slots.map((s) => s.id);
  const [grabbed] = ids.splice(grabIndex, 1);
  ids.splice(clamp(target, 0, ids.length), 0, grabbed);
  return ids;
}

export interface ResolveGroupParams {
  slots: DragSlot[];
  groups: DragGroupBox[];
  grabIndex: number;
  grabbedId: number | string;
  /**
   * Where the *pointer* is — not the dragged tab's center.
   *
   * The center trails the pointer by however far from the tab's middle it was
   * grabbed. For a group that runs to the end of the strip, that offset makes
   * the region past the group unreachable: the pointer hits the window edge
   * while the center is still inside the group's box, so the tab can never be
   * dropped after the group. Grabbing the same tab by its left edge worked,
   * which is what made the bug feel intermittent. The pointer always reaches
   * the edge, so membership is decided by it.
   */
  pointerX: number;
  /** Post-drop id order, from computeOrder. */
  order: (number | string)[];
  /** The grabbed slot's target position in that order. */
  target: number;
}

/**
 * Which group the grabbed tab belongs to if dropped right now — `undefined`
 * for "loose in the strip".
 *
 * Two rules, in order:
 *   1. Landing between two tabs of the same group means landing inside it,
 *      whatever the boxes say. This is the only rule that can place a tab in
 *      the middle of a group.
 *   2. Otherwise fall back to the group boxes, with hysteresis: a tab already
 *      in a group holds on until it is dragged clearly out (so a jittery
 *      pointer near the edge doesn't detach it), while an outside tab joins
 *      once it is clearly over the group.
 */
export function resolveTargetGroup(params: ResolveGroupParams): string | undefined {
  const { slots, groups, grabIndex, pointerX, order, target } = params;

  const leftId = target > 0 ? order[target - 1] : undefined;
  const rightId = target < order.length - 1 ? order[target + 1] : undefined;
  const leftSlot = leftId !== undefined ? slots.find((s) => s.id === leftId) : undefined;
  const rightSlot = rightId !== undefined ? slots.find((s) => s.id === rightId) : undefined;

  if (leftSlot?.groupId && leftSlot.groupId === rightSlot?.groupId) {
    return leftSlot.groupId;
  }

  const currentSlot = slots[grabIndex];

  for (const group of groups) {
    const startedHere = currentSlot?.groupId === group.groupId;
    const band = startedHere ? GROUP_HYSTERESIS.leave : GROUP_HYSTERESIS.join;

    if (pointerX >= group.left - band && pointerX <= group.right + band) {
      return group.groupId;
    }
  }

  return undefined;
}

/**
 * Move the grabbed id to the nearest position that doesn't split a group it
 * isn't joining.
 *
 * Ordering by tab centers alone will happily park a loose tab between two
 * members of a group it is merely passing over. The layout then sees two runs
 * of the same group and draws two containers — the group visibly tears in half
 * mid-drag. Only the group named by `targetGroupId` may be entered; every other
 * group is a single indivisible block the tab slides past.
 */
export function snapOutOfForeignGroups(
  order: (number | string)[],
  groupOfSettled: (id: number | string) => string | undefined,
  grabbedId: number | string,
  targetGroupId: string | undefined,
): (number | string)[] {
  const at = order.indexOf(grabbedId);
  if (at === -1) return order;

  const before = order[at - 1] !== undefined ? groupOfSettled(order[at - 1]) : undefined;
  const after = order[at + 1] !== undefined ? groupOfSettled(order[at + 1]) : undefined;

  // Inside a foreign group exactly when both neighbours are in the same one.
  if (before === undefined || before !== after || before === targetGroupId) return order;

  const rest = order.filter((id) => id !== grabbedId);
  const firstOfGroup = rest.findIndex((id) => groupOfSettled(id) === before);
  const lastOfGroup =
    rest.length - 1 - [...rest].reverse().findIndex((id) => groupOfSettled(id) === before);

  // Whichever edge of the group is closer to where the tab wanted to be.
  const wanted = at;
  const insertAt =
    wanted - firstOfGroup <= lastOfGroup + 1 - wanted ? firstOfGroup : lastOfGroup + 1;

  const snapped = rest.slice();
  snapped.splice(insertAt, 0, grabbedId);
  return snapped;
}

/**
 * Hold the grabbed id inside its own group's run.
 *
 * `snapOutOfForeignGroups` stops a tab from splitting a group it is passing
 * over; this is the other half — a member being dragged far away must still
 * *preview* as moving within its group, because the preview may not change any
 * container's size. Where it really lands is decided separately, on drop.
 */
export function clampToOwnGroup(
  order: (number | string)[],
  groupOfSettled: (id: number | string) => string | undefined,
  grabbedId: number | string,
  ownGroupId: string,
  /** Where everything sat before the drag, for the sole-member case below. */
  restingOrder: (number | string)[],
): (number | string)[] {
  const rest = order.filter((id) => id !== grabbedId);
  const firstOfGroup = rest.findIndex((id) => groupOfSettled(id) === ownGroupId);

  // The only member of its group: there is no sibling to move relative to, and
  // letting it roam would drop it inside some other group's run, splitting that
  // container in two. Preview it at rest — the drop still moves it.
  if (firstOfGroup === -1) return restingOrder;

  const lastOfGroup =
    rest.length - 1 - [...rest].reverse().findIndex((id) => groupOfSettled(id) === ownGroupId);

  const wanted = order.indexOf(grabbedId);
  const insertAt = Math.min(Math.max(wanted, firstOfGroup), lastOfGroup + 1);

  const clamped = rest.slice();
  clamped.splice(insertAt, 0, grabbedId);
  return clamped;
}

export interface DragLayout {
  /** Post-drop order of tab ids, left to right — what `onReorder` is given. */
  order: (number | string)[];
  /**
   * The order the *preview* is laid out in, which is not always the one above.
   *
   * While a tab is held, no container may change its width: the strip is a
   * live flex row, so resizing a container physically shifts everything to its
   * right, on top of the transforms computed from the original measurements —
   * the two shifts compound and the strip drifts further out of step with every
   * drag. So the preview keeps the grabbed tab in its own group and only lets
   * it move within it; joining or leaving a group happens on drop, where Svelte
   * re-renders the strip from scratch. The pending change is signalled by
   * highlighting the target group instead.
   */
  previewOrder: (number | string)[];
  /** Position the grabbed slot lands in. */
  target: number;
  /** translateX for every tab, keyed by id. */
  offsets: Map<number | string, number>;
  /** translateX for every group container, keyed by group id. */
  groupOffsets: Map<string, number>;

  /**
   * Where each container ends up, absolute. Because the preview never changes
   * a group's membership, these are the measured boxes shifted — never resized.
   * Tests assert exactly that.
   */
  groupBoxes: Map<string, { left: number; right: number }>;
  /** Group the grabbed tab would join. */
  targetGroupId?: string;
}

export interface DragLayoutParams {
  slots: DragSlot[];
  grabIndex: number;
  /** Pointer travel since the grab, in px. */
  dx: number;
  /** Group boxes; omit when nothing can change group membership. */
  groups?: DragGroupBox[];
  /**
   * Live pointer position. Defaults to the dragged tab's center, which is right
   * for a synthetic drag but not for a real one — see ResolveGroupParams.
   */
  pointerX?: number;
  /** Box metrics; omit for a flat strip of equally spaced slots. */
  metrics?: StripMetrics;
}

/**
 * Everything a single frame of a drag needs, in one call: the order, the group
 * the tab would join, and the transform for every tab and container.
 */
export function computeDragLayout(params: DragLayoutParams): DragLayout {
  const { slots, grabIndex, dx, groups } = params;
  const grabbed = slots[grabIndex];
  const centerNow = slotCenter(grabbed) + dx;

  const target = computeTargetIndex(slots, grabIndex, centerNow);
  const order = computeOrder(slots, grabIndex, target);

  const targetGroupId = groups
    ? resolveTargetGroup({
        slots,
        groups,
        grabIndex,
        grabbedId: grabbed.id,
        pointerX: params.pointerX ?? centerNow,
        order,
        target,
      })
    : undefined;

  const metrics =
    params.metrics ??
    deriveStripMetrics({
      slots,
      groups: groups ?? [],
      origin: slots.length > 0 ? Math.min(...slots.map((s) => s.left)) : 0,
      unitGap: 0,
      groupMargin: 0,
    });

  const byId = new Map(slots.map((s) => [s.id, s]));

  // What the drop will do: the grabbed tab may enter the group it is over.
  const placed = snapOutOfForeignGroups(
    order,
    (id) => byId.get(id)?.groupId,
    grabbed.id,
    targetGroupId,
  );

  // What the preview shows. Two rules, both there to keep the strip still:
  //
  //  - A pending *membership* change moves nothing. The tab is about to leave
  //    or join a group, which on drop re-lays the whole strip; previewing that
  //    by opening a gap showed the gap in one place and the tab's vacated slot
  //    in another — two holes at once, with the tab floating between them. The
  //    highlight on the target group is the feedback instead.
  //  - Otherwise the tab reorders freely, but only within its own group (or
  //    among the loose tabs), so no container changes size.
  const ownGroupId = grabbed.groupId;
  const settledGroupOf = (id: number | string) => byId.get(id)?.groupId;
  const restingOrder = slots.map((slot) => slot.id);
  const previewOrder =
    targetGroupId !== ownGroupId
      ? restingOrder
      : ownGroupId === undefined
        ? snapOutOfForeignGroups(order, settledGroupOf, grabbed.id, undefined)
        : clampToOwnGroup(order, settledGroupOf, grabbed.id, ownGroupId, restingOrder);
  const sequence = previewOrder.map((id) => byId.get(id)).filter((s): s is DragSlot => !!s);
  const laid = layoutStrip(sequence, (id) => byId.get(id)?.groupId, metrics);

  const offsets = new Map<number | string, number>();
  for (const slot of slots) {
    // The grabbed tab follows the pointer rather than snapping to its slot —
    // that is what makes it read as held.
    offsets.set(
      slot.id,
      slot.id === grabbed.id ? dx : (laid.tabs.get(slot.id) ?? slot.left) - slot.left,
    );
  }

  const groupOffsets = new Map<string, number>();
  for (const box of groups ?? []) {
    const next = laid.groups.get(box.groupId);
    if (next) groupOffsets.set(box.groupId, next.left - box.left);
  }

  return {
    order: placed,
    previewOrder,
    target,
    offsets,
    groupOffsets,
    groupBoxes: laid.groups,
    targetGroupId,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
