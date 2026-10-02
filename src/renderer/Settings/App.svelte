<script lang="ts">
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { initIpc } from "./ipc";
  import { settings } from "./store";
  import { flushNow } from "./autosave.svelte";

  import Body from "./Components/Body.svelte";

  initCommonIpc();
  initIpc();

  $effect(() => {
    const pref = $settings.app.figmaTheme ?? "dark";
    // "system" (Figma's System theme) → Chromium's colour-scheme, which is the
    // same nativeTheme source the main process resolves against.
    const theme =
      pref === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : pref;
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  });

  // Settings is a tab: switching away or closing it only hides this view.
  // Write a pending edit right away instead of leaving it to the debounce.
  function onVisibilityChange() {
    if (document.hidden) flushNow();
  }
</script>

<svelte:document onvisibilitychange={onVisibilityChange} />

<Body />

<style>
  :global(body) {
    margin: 0;
    background-color: var(--bg-panel);
    /* Base font for the whole Settings window. Without this, any text that
       doesn't set its own font-family (section headers, the title) falls back
       to the browser default serif (Times) — the "broken" look. Use the
       platform's native UI sans so it matches the host desktop. */
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
  }
</style>
