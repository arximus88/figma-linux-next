import { startAutosave } from "./autosave.svelte";
import { settings as settingsStore } from "./store";

export function initIpc() {
  // Async bootstrap — replaces sendSync("getSettings")
  window.figmaApi.invoke("getSettings").then((settings: Types.SettingsInterface) => {
    settingsStore.set(settings);
    startAutosave(settings);
  });

  window.figmaApi.send("frontReady");
}
