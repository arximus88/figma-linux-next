/**
 * tabStripInvariants — the properties a tab-strip drag must never violate,
 * checked against every slot in the strip rather than the one being dragged.
 *
 * The point is the thing the eye actually notices: one tab moves, and some
 * *other* tab ends up overlapping its neighbour or poking out of its group.
 * Each check below reports the full strip on failure, so a broken invariant
 * names the offending pair instead of just "expected 412 to be 415".
 */

import type { DragSlot } from "../../../src/renderer/Panel/Components/tabDragLayout";
import type { Strip } from "./tabStripHarness";

/** Sub-pixel slack: layouts are float arithmetic over measured rects. */
const EPSILON = 1e-6;

const describeSlot = (s: DragSlot) =>
  `${String(s.id)}[${round(s.left)}..${round(s.left + s.width)}${s.groupId ? ` in ${s.groupId}` : ""}]`;

const describeStrip = (slots: DragSlot[]) => slots.map(describeSlot).join(" ");

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fail with the whole strip in the message. */
function fail(message: string, painted: DragSlot[]): never {
  throw new Error(`${message}\n  strip: ${describeStrip(painted)}`);
}

/**
 * Nothing overlaps: read left to right in painted order, each box starts at or
 * after the previous one ends. The grabbed slot is excluded — it is *supposed*
 * to float over its neighbours while held.
 */
export function expectNoOverlap(painted: DragSlot[], grabbedId: number | string): void {
  const row = painted
    .filter((s) => s.id !== grabbedId)
    .slice()
    .sort((a, b) => a.left - b.left);

  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const curr = row[i];
    if (curr.left + EPSILON < prev.left + prev.width) {
      fail(
        `overlap: ${describeSlot(prev)} and ${describeSlot(curr)} share ` +
          `${round(prev.left + prev.width - curr.left)}px`,
        painted,
      );
    }
  }
}

/**
 * Reordering alone does not change how much room the strip takes: the same
 * boxes are laid out in a different sequence. If the span drifts, tabs are on a
 * pitch that isn't the strip's real one.
 *
 * Changing a tab's *group*, on the other hand, legitimately resizes the strip —
 * a container appears, disappears, or grows by its own margin, border, padding
 * and chip. Callers pass `membershipChanged` for those frames, where the span
 * is expected to move and this check does not apply.
 */
export function expectSpanPreserved(
  before: DragSlot[],
  painted: DragSlot[],
  grabbedId: number | string,
  membershipChanged = false,
): void {
  if (membershipChanged) return;

  const settled = painted.filter((s) => s.id !== grabbedId);
  if (settled.length === 0) return;

  const originalLeft = Math.min(...before.map((s) => s.left));
  const originalRight = Math.max(...before.map((s) => s.left + s.width));
  const newLeft = Math.min(...settled.map((s) => s.left));
  const newRight = Math.max(...settled.map((s) => s.left + s.width));

  if (newLeft + EPSILON < originalLeft) {
    fail(`strip grew left: ${round(newLeft)} < ${round(originalLeft)}`, painted);
  }
  if (newRight > originalRight + EPSILON) {
    fail(`strip grew right: ${round(newRight)} > ${round(originalRight)}`, painted);
  }
}

/**
 * Every tab sits inside the painted box of the group it belongs to.
 *
 * This is the user-visible symptom — "tabs keep poking out of the group" — and
 * it is checked against where the *container* actually paints, i.e. its own
 * offset from the layout, not where it used to be. Transforming a tab cannot
 * move the border drawn around it, so a layout that shifts tabs without
 * shifting their container fails right here.
 *
 * The grabbed tab is exempt: while held it floats wherever the pointer is.
 */
export function expectTabsStayInTheirGroups(
  strip: Strip,
  painted: DragSlot[],
  grabbedId: number | string,
  groupBoxes: Map<string, { left: number; right: number }>,
): void {
  const paintedById = new Map(painted.map((s) => [s.id, s]));

  for (const box of strip.groups) {
    // The container as it will actually paint: moved *and* resized.
    const laid = groupBoxes.get(box.groupId) ?? box;
    const boxLeft = laid.left;
    const boxRight = laid.right;

    // Members other than the grabbed tab: that one joins (or leaves) on drop,
    // but until then it follows the pointer and is not bound by any box.
    const memberIds = (strip.groupMembers.get(box.groupId) ?? []).filter((id) => id !== grabbedId);

    for (const id of memberIds) {
      const member = paintedById.get(id);
      if (!member) continue;
      if (member.left + EPSILON < boxLeft || member.left + member.width > boxRight + EPSILON) {
        fail(
          `${describeSlot(member)} escaped group ${box.groupId} ` +
            `[${round(boxLeft)}..${round(boxRight)}]`,
          painted,
        );
      }
    }
  }
}

/**
 * A group the drag doesn't touch moves as one piece: every member shifts by the
 * same amount. A group whose members shift by different amounts is a group
 * being torn apart — the exact failure a per-tab check would miss, because each
 * tab on its own looks fine.
 */
export function expectUntouchedGroupsMoveRigidly(
  strip: Strip,
  painted: DragSlot[],
  grabbedId: number | string,
  targetGroupId?: string,
): void {
  const paintedById = new Map(painted.map((s) => [s.id, s]));
  const originalById = new Map(strip.slots.map((s) => [s.id, s]));

  for (const [groupId, memberIds] of strip.groupMembers) {
    const grabbedSlot = originalById.get(grabbedId);
    if (grabbedSlot?.groupId === groupId || targetGroupId === groupId) continue;
    if (memberIds.length < 2) continue;

    const shifts = memberIds.map((id) => {
      const now = paintedById.get(id);
      const was = originalById.get(id);
      return now && was ? now.left - was.left : 0;
    });

    const first = shifts[0];
    const torn = shifts.findIndex((shift) => Math.abs(shift - first) > EPSILON);
    if (torn !== -1) {
      fail(
        `group ${groupId} was torn apart: ${memberIds[0]} shifted ${round(first)}px ` +
          `but ${memberIds[torn]} shifted ${round(shifts[torn])}px`,
        painted,
      );
    }
  }
}

/**
 * No container changes size while a tab is held.
 *
 * The strip is a live flex row: resizing a container physically shifts every
 * unit to its right, on top of the transforms computed from the original
 * measurements. The two shifts compound, and each drag leaves the strip a
 * little further out of step — which shows up as tabs that eventually stop
 * moving at all. The preview therefore only ever translates containers.
 */
export function expectContainersKeepTheirSize(
  strip: Strip,
  groupBoxes: Map<string, { left: number; right: number }>,
): void {
  for (const box of strip.groups) {
    const laid = groupBoxes.get(box.groupId);
    if (!laid) continue;
    const was = box.right - box.left;
    const now = laid.right - laid.left;
    if (Math.abs(now - was) > EPSILON) {
      throw new Error(
        `container ${box.groupId} resized mid-drag: ${round(was)}px → ${round(now)}px`,
      );
    }
  }
}

/** The post-drop order is a permutation of the pre-drag one — nothing lost or cloned. */
export function expectPermutation(before: DragSlot[], order: (number | string)[]): void {
  const was = before.map((s) => String(s.id)).sort();
  const now = order.map(String).sort();
  if (was.length !== now.length || was.some((id, i) => id !== now[i])) {
    throw new Error(`order is not a permutation:\n  before: ${was}\n  after:  ${now}`);
  }
}

export interface CheckAllParams {
  strip: Strip;
  painted: DragSlot[];
  order: (number | string)[];
  grabbedId: number | string;
  groupBoxes: Map<string, { left: number; right: number }>;
  targetGroupId?: string;
  /** True when the grabbed tab would join or leave a group on this frame. */
  membershipChanged?: boolean;
}

/** Every invariant, in one call — what the drag sweeps assert at each step. */
export function expectStripIsSane({
  strip,
  painted,
  order,
  grabbedId,
  groupBoxes,
  targetGroupId,
  membershipChanged,
}: CheckAllParams): void {
  expectPermutation(strip.slots, order);
  expectNoOverlap(painted, grabbedId);
  expectSpanPreserved(strip.slots, painted, grabbedId, membershipChanged);
  expectContainersKeepTheirSize(strip, groupBoxes);
  expectTabsStayInTheirGroups(strip, painted, grabbedId, groupBoxes);
  expectUntouchedGroupsMoveRigidly(strip, painted, grabbedId, targetGroupId);
}
