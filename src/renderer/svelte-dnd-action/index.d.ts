export interface DndZoneOptions {
  items: any[];
  flipDurationMs?: number;
  constrainAxisY?: boolean;
  cursorStartDrag?: string;
  cursorDragging?: string;
  cursorDrop?: string;
  cursorHover?: string;
}

export function dndzone(
  node: HTMLElement,
  options: DndZoneOptions,
): {
  update(options: DndZoneOptions): void;
  destroy(): void;
};
