---
name: figma-linux-next
description: |
  Developer reference skill for the figma-linux-next project — an Electron-based unofficial Figma desktop client for Linux.
  Use this skill whenever working on ANY task in this repository: adding features, fixing bugs, tracing IPC flows, modifying tabs/windows, touching the renderer, working with extensions, or debugging Electron-specific behavior. Load this skill at the start of every figma-linux-next coding session — it saves significant re-reading of architecture files.
---

# figma-linux-next Developer Reference

A quick map. `CLAUDE.md` in the repo root is the full reference (gotchas, release flow, MCP
details) and wins wherever the two disagree.

## Process Architecture

```
Main process (src/main/)                 Renderer pages (src/renderer/)
────────────────────────                 ───────────────────────────────
index.ts → applyChromiumSwitches()       Panel/        toolbar + tab strip
App.ts (lifecycle, controller wiring)    Settings/     settings page, shown as a tab
controllers/  ←── window.figmaApi ──→    Changelog/    What's New overlay
preload/bridge.ts (allowlists)           Preview/      tab hover card
Ui/WindowManager → Window → TabManager   GroupPrompt/  tab-group popover
Storage (singleton, main only)           DesktopAPI/   preload for Figma's own pages
MCP/, FigmaAgent, ExtensionManager
```

Build: **Vite + vite-plugin-electron** → `dist/main/main.js`, pages as `dist/*.html` +
`dist/assets/`, preload scripts in `dist/renderer/` (`bridge.js`, `loadContent.js`,
`loadMainContent.js`).

## Windows and tabs

**WindowManager** (`src/main/Ui/WindowManager.ts`): `Map<windowId, Window>`, last-focused window,
`figma://` URLs, closed-tab history, `findFileTab(fileKey)` for MCP.

**Window** (`src/main/Ui/Window.ts`): one `BrowserWindow` + `TabManager` + `SettingsView` +
`WarmTabManager` + lazily created hover card. Child views are attached **once**
(`attachHidden()`) and switched with `view.setVisible()` through `swapTo()`. Never
`removeChildView` a view you intend to show again — on Wayland it stays blank.

**TabManager** (`src/main/Ui/TabManager.ts`) holds, per window:

| Type | Notes |
|---|---|
| `MainTab` | Always present — the home/files page |
| `Tab` | A Figma file tab (`WebContentsView`) |
| `CommunityTab` | Community browser |
| `DiscardedTab` | Shell without a view for a saved tab not loaded yet (`app.lazyRestoreTabs`); `reviveTab()` makes it a `Tab` |

Settings is a tab in the strip but **not** a `TabManager` tab (`src/main/Ui/SettingsTab.ts`).

- `getById(id)` returns `undefined` for an unknown numeric id (`"mainTab"` / `"communityTab"`
  still resolve) and may return a `DiscardedTab`. Guard dynamic ids with
  `tabManager.getAll().has(id)` and check `"discarded" in tab` before touching `tab.view`.
- Double-close is intentional: clicking Home sends `setFocusToMainTab` **and**
  `closeTab(newFileTabId)`; the `has(id)` guard in `Window.closeTab()` absorbs the second one.
- `openFile()` and `createFile()` must both call `closeNewFileTab()`.

## window.open routing (Tab, MainTab, CommunityTab)

`setWindowOpenHandler` only sees `window.open()` from the main frame; cross-origin iframes go to
`did-create-window`. Every tab class registers both, with the same rule:

```typescript
private windowOpenHandler(details: HandlerDetails) {
  if (isFigmaRunUrl(details.url)) app.emit("openUrlFromCommunity", details.url);
  else void openInBrowser(details.url, "CommunityTab"); // Main/openInBrowser, not shell.openExternal
  return { action: "deny" as const };
}
private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
  window.close(); // always close the raw window
  // …same routing as above
}
```

## IPC

- Main: `ipcRegistry.on(channel, handler, source)` / `ipcRegistry.handle(...)` in a controller under
  `src/main/controllers/`. Never `ipcMain` directly — the registry is sealed in the `App`
  constructor and throws on late or duplicate registration.
- Renderer pages (Panel, Settings, …): `window.figmaApi.send / invoke / on / once`. Direct
  `ipcRenderer` is not available to them (`contextIsolation: true` + the bridge preload).
- A new channel needs three edits: the allowlist in `src/main/preload/bridge.ts`
  (`SEND_CHANNELS` / `RECEIVE_CHANNELS` / `INVOKE_CHANNELS`), the registry call, the call site.
  An unlisted channel silently no-ops.
- Listener registrations: `src/renderer/Panel/ipc.svelte.ts`, `src/renderer/Settings/ipc.ts`.

## DesktopAPI: Figma web app bridge

Figma's own pages run in views with `contextIsolation: false` (`Tab`, `MainTab`,
`CommunityTab`) and a preload from `src/renderer/DesktopAPI/`. `webBinding.ts` sets up a
**MessageChannel** with Figma's web app; Figma sends fire-and-forget messages to
`window.__figmaDesktop`, looked up by `msg.name` in the `publicAPI` object. Unknown ones log
`[desktop] Unhandled message <name>`. This preload does use `ipcRenderer` directly.

To silence a message without implementing it, add a stub to `publicAPI`:

```typescript
someNewMessage(args: any) {
  if (import.meta.env.DEV) console.debug("[stub] someNewMessage", args);
},
```

## Storage and settings

`src/main/Storage.ts` — main-process singleton, persists to
`~/.config/figma-linux-next/settings.json` (`app.getPath("userData")`), deep-merged over
`DEFAULT_SETTINGS`. Renderers read with `window.figmaApi.invoke("getSettings")`; IPC lives in
`SettingsController`, not in Storage. Top-level keys: `clientId`, `userId`, `authedUserIDs`,
`app`, `ui`, `mcp`.

Adding a setting:
1. Default value in `src/utils/Common/defaultSettings.ts` (`BASE_DEFAULT_SETTINGS`). The files
   of the same name under `Utils/Render` and `Utils/Main` are not the place.
2. Type in `src/types/`.
3. If the user can edit it: entry in `src/renderer/Settings/schema.ts`, a row in the section
   view, a key in `src/utils/Common/settingsEdit.ts`, and its side effect in `planSettingsUpdate`.

## Path aliases (tsconfig)

`Main/*` → `src/main/*`, `Utils/*` → `src/utils/*`, `Common/*` → `src/renderer/Common/*`,
`Icons`, `Containers`, `DesktopAPI`, `Types/*` → `src/types/*`, `Const` → `src/constants`,
`Enums`, `Storage`. Use them instead of relative paths.

## Two package.json files

`package.json` is the dev manifest; `src/package.json` is copied to `dist/` and installed with
`bun install --production`. A **runtime** dependency bump goes into both. Dev-only tools (vite,
biome, playwright) live only in the root one.

## Extensions

Local Figma plugins imported from their `manifest.json` (Figma's "Import plugin from
manifest…"). Paths are stored in `settings.app.savedExtensions`; `ExtensionManager` watches their
files with Chokidar and hot-reloads. There is no folder the app scans.

## Styling and theme

Tokens are CSS custom properties in `src/renderer/theme.css`. Window frames are theme-aware: the
`--frame-*` palette is scoped by `#panel[data-frame]` × `html[data-theme]`; Figma's theme choice
is resolved in `src/main/Theme.ts` and pushed to panels as `figmaThemeChanged`. Never hardcode a
colour in `src/renderer/Panel/frames/`.

## Chromium flags

Applied by `applyChromiumSwitches()` (`src/main/applyChromiumSwitches.ts`), called from
`src/main/index.ts` before `App` is constructed — they must be set before `app.ready`. Custom
switches: `settings.app.commandSwitches`.

## Key commands

```bash
bun run dev        # build main + hot-reload renderer
bun run lp         # Biome lint + format, in place
bun run lint       # Biome check, no writes (CI)
bun run check      # svelte-check
bun run test:unit  # bun test tests/unit/
bun run build && bun run test:e2e   # Playwright under xvfb, needs a build
# builds / packaging / releases → the figma-linux-next-build skill
```

## Critical files

| File | What it does |
|---|---|
| `src/main/index.ts` | Entry: storage, dialogs, Chromium switches, `new App(...)` |
| `src/main/App.ts` | Lifecycle, controller wiring, MCP server and FigmaAgent start |
| `src/main/controllers/` | IPC controllers + `registry.ts` |
| `src/main/preload/bridge.ts` | `window.figmaApi` and the channel allowlists |
| `src/main/Ui/WindowManager.ts` | Window lifecycle, protocol URL handling |
| `src/main/Ui/Window.ts` | One window: views, tab switching, Settings tab |
| `src/main/Ui/TabManager.ts` | Tab CRUD, discarded shells |
| `src/main/Ui/CommunityTab.ts` | Community browser, window.open routing |
| `src/main/Storage.ts` | Settings persistence |
| `src/main/MCP/` | MCP server, tool definitions, in-page scripts |
| `src/renderer/DesktopAPI/webBinding.ts` | Figma web ↔ desktop message bridge, `publicAPI` stubs |
| `src/renderer/Panel/ipc.svelte.ts` | Panel IPC listener registrations |
| `src/renderer/Settings/schema.ts` | Every settings row: section, title, help, keywords |
| `src/utils/Common/defaultSettings.ts` | `BASE_DEFAULT_SETTINGS` — all setting defaults |
| `src/utils/Common/url.ts` | Shared URL predicates (`isFigmaRunUrl`, …) |
| `config/builder.json` | electron-builder targets (deb, rpm, pacman, AppImage, zip) |
