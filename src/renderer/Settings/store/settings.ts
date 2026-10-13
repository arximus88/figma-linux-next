import { writable } from "svelte/store";
import { DEFAULT_SETTINGS } from "Utils/Render";

function createSettings() {
  const { subscribe, set } = writable<Types.SettingsInterface>(DEFAULT_SETTINGS);

  return {
    set: (settings: Types.SettingsInterface) => set(settings),
    subscribe,
    reset: () => set(DEFAULT_SETTINGS),
  };
}

export const settings = createSettings();
