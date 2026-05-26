import { writable } from "svelte/store";
import { DEFAULT_SETTINGS } from "Utils/Render";

function createSettings() {
  const { subscribe, update, set } = writable<Types.SettingsInterface>(DEFAULT_SETTINGS);

  return {
    set: (settings: Types.SettingsInterface) => set(settings),
    subscribe,
    trim: () =>
      update((current) => {
        current.app.commandSwitches = current.app.commandSwitches.filter((s) => s.switch !== "");
        return current;
      }),
    reset: () => set(DEFAULT_SETTINGS),
  };
}

export const settings = createSettings();
