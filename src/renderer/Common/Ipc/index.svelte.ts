
export function initCommonIpc() {
  window.figmaApi.on("loadCurrentTheme", (theme: Themes.Theme) => {
    // Theme styling is now handled by CSS variables on :root
  });
}
