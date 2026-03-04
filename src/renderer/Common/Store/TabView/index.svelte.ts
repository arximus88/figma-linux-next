/**
 * TabView store — Svelte 5 rune-based reactive state
 */
class TabViewStore {
  items = $state<Types.Dic<string>>({});
  #id = 0;

  createId() {
    return this.#id++;
  }

  set(id: number | string, item: string) {
    this.items[id] = item;
  }

  get value() {
    return this.items;
  }
}

export const tabView = new TabViewStore();
