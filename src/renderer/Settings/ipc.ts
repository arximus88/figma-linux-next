import { settings as settingsStore } from "./store";

export function initIpc() {
  // Async bootstrap — replaces sendSync("getSettings")
  window.figmaApi.invoke("getSettings").then((settings: Types.SettingsInterface) => {
    settingsStore.set(settings);
  });

  window.figmaApi.send("frontReady");
}
