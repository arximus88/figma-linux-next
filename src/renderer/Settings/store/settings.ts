import { writable } from "svelte/store";
import { DEFAULT_SETTINGS } from "Utils/Render";

function createSettings() {
  const { subscribe, update, set } = writable<Types.SettingsInterface>(DEFAULT_SETTINGS);

  return {
    set: (settings: Types.SettingsInterface) =>
      set({
        ...settings,
        app: {
          ...settings.app,
          themeDropdownOpen: settings.app.themeDropdownOpen ?? true,
        },
      }),
    subscribe,
    trim: () =>
      update((current) => {
        current.app.commandSwitches = current.app.commandSwitches.filter((s) => s.switch !== "");
        return current;
      }),
    reset: () => update((current) => (current = DEFAULT_SETTINGS)),
  };
}

export const settings = createSettings();
