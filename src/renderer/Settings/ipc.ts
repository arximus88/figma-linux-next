import { themes as themesStore, settings as settingsStore, themesLoaded } from "./store";

export function initIpc() {
  window.figmaApi.on("themesLoaded", (themes: Themes.Theme[]) => {
    themesStore.set(themes);
    themesLoaded.set(true);
  });

  // Async bootstrap — replaces sendSync("getSettings")
  window.figmaApi.invoke("getSettings").then((settings: Types.SettingsInterface) => {
    settingsStore.set(settings);
  });

  window.figmaApi.send("frontReady");
}
