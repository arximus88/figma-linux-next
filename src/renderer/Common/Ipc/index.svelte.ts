import { themeApp } from "../Store/Themes";

export function initCommonIpc() {
  window.figmaApi.on("loadCurrentTheme", (theme: Themes.Theme) => {
    themeApp.set(theme);
  });
}
