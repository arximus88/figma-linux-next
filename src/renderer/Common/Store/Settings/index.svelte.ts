/**
 * Settings store — Svelte 5 rune-based reactive state
 */
class SettingsStore {
  focusId = $state<number | undefined>(undefined);

  reset() {
    this.focusId = undefined;
  }

  setFocus(id?: number) {
    this.focusId = id;
  }

  get value() {
    return this.focusId;
  }
}

export const settings = new SettingsStore();
