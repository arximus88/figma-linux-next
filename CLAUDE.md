# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

figma-linux-next is a fork of the unofficial Electron-based Figma desktop app for Linux. It provides native Wayland support, GPU acceleration, system integration, extensions, and advanced window management.

## Development Commands

### Building & Running

```bash
# Install dependencies
bun install

# Development mode (builds main, watches renderer with hot reload)
bun run dev

# Build for production
bun run build

# Build, then run the production version (`bun run run` launches the existing build)
bun run start

# Run in watch mode (restarts on file changes)
bun run run:watch
```

### Build System

The project uses **Vite** with `vite-plugin-electron`:
- `vite.config.mts` - Unified build config for main + renderer processes

Build outputs to `dist/`:
- `dist/main/main.js` - Main process entry point
- `dist/*.html` + `dist/assets/` - UI pages (panel, settings, changelog, preview, groupPrompt)
- `dist/renderer/` - preload scripts (`bridge.js`, `loadContent.js`, `loadMainContent.js`)

### Packaging

```bash
# Package for all configured formats (deb, rpm, pacman, AppImage, zip)
bun run package

# Clean, build, make resources/AppRun executable, run electron-builder for all targets
bun run pack

# Install locally to /opt/figma-linux-next for testing
bun run local:install

# Build with electron-builder
bun run builder
```

Build targets configured in [`config/builder.json`](config/builder.json):
- deb (x64, arm64)
- rpm (x64, arm64)
- pacman (x64)
- AppImage (x64, arm64)
- zip (x64, arm64)

### Code Quality

```bash
# Lint + format .ts in place (Biome)
bun run lp

# Lint check only — no writes (used by CI)
bun run lint

# Svelte type checking
bun run check

# Svelte 5 rune antipatterns in a single component (no install needed)
bunx @sveltejs/mcp svelte-autofixer src/renderer/Panel/App.svelte

# Pre-commit hook (runs Biome on staged files via lint-staged)
bun run precommit
```

Linting/formatting: **Biome** (`biome.json`) for everything `files.includes` lists — `src` and
`tests` `.ts`, `scripts/*.mts`, `vite.config.mts`; `bun run lint` passes no paths so the config is
the single list (it used to pass `src tests` and skip the rest). Formatter matches the
former Prettier (100 cols, double quotes, semicolons, trailing-all); `noExplicitAny` and
`noNonNullAssertion` are disabled to match project conventions; `*.d.ts` has a small rule carve-out.
`.svelte` files are not linted/formatted — only `svelte-check` (Biome doesn't parse Svelte 5 runes
yet). ESLint and Prettier were removed in favor of Biome.

`svelte-check` covers types; rune antipatterns (assignment to `$derived`, unguarded `bind:this` in
`$effect`, leftover `on:click`) slip through it. `bunx @sveltejs/mcp svelte-autofixer <file>` catches
those — one file per invocation, not wired into any script. Runs from the bunx cache and leaves
`bun.lock` untouched.

### Testing

```bash
# Unit tests
bun run test:unit

# E2E tests (Playwright)
bun run test:e2e
```

Unit tests are in `tests/unit/` (mirroring `src/`) — `test:unit` and CI run only that folder, so a
`*.test.ts` beside its source is never executed. E2E tests are in `tests/e2e/`; `bun run test:e2e` builds nothing — run `bun run build`
first, the suite launches `dist/main/main.js` under `xvfb-run`.

Writing e2e tests (`tests/e2e/helpers/app.ts` and `launch.ts` have the shared pieces):
- Assert what the user would see — the strip (`stripTabs`), the view on screen (`shownView`),
  values in main's store — and drive the real control (button, switch, menu event). A test that
  only checks "the app didn't crash" or emits an IPC nobody listens to passes forever; four such
  tests were found and rewritten on 2026-10-02.
- Under xvfb a hidden view's document still reports `visibilityState === "visible"` and its
  `innerWidth` lags behind `setSize`. Read `view.getVisible()` / `view.getBounds()` from
  `app.evaluate` instead (`shownView` does).
- Restarts: `launchApp({ userDataDir: previous.userDataDir })` reuses the profile.
- A new test that guards a fix should fail with the fix reverted — check it once.

`bunfig.toml` registers `tests/unit/electron-preload.ts` as a test preload — globally mocks the `electron` module so unit tests touching `src/utils/Main/` work without an Electron runtime.

## Architecture

### Process Architecture

The application is a classic Electron app with two processes:

**Main Process** (`src/main/`) - Node.js backend that manages:
- Windows and tabs (WindowManager, Window, TabManager)
- Extensions/plugins (ExtensionManager)
- Figma session authentication (Session)
- System fonts (FontManager)
- Persistent settings (Storage)
- Dialogs (Native or Zenity backends)
- MCP server for AI assistant integration (McpServer)
- The local helper figma.com probes from a browser so file links open here (FigmaAgent)

**Renderer Process** (`src/renderer/`) - Browser frontend with five Svelte pages:
- **Panel** (`src/renderer/Panel/`) - Top toolbar UI with tabs
- **Settings** (`src/renderer/Settings/`) - Settings page, shown as a tab
- **Changelog** (What's New overlay), **Preview** (tab hover card), **GroupPrompt** (tab-group popover) - small single-purpose views

Communication between processes goes through a typed **preload bridge** (`src/main/preload/bridge.ts`) that exposes `window.figmaApi` — direct `ipcRenderer` usage in renderers is not allowed.

### Main Process Structure

Entry point: `src/main/index.ts` initializes storage and dialogs, then instantiates App:

```typescript
new App(new WindowManager(), new Session(), new FontManager());
```

`ExtensionManager` is instantiated separately, not passed to App.

**App class** (`src/main/App.ts`):
- Acquires single-instance lock
- Instantiates all IPC controllers and seals the registry
- Registers `figma://` protocol handler and starts the MCP server
- Manages lifecycle events (ready, second-instance, window-all-closed)
- Chromium command-line switches are **not** applied here: `applyChromiumSwitches()`
  (`src/main/applyChromiumSwitches.ts`) runs from `src/main/index.ts` before `App` is constructed —
  they must be set synchronously, before `app.ready`

**IpcRegistry** (`src/main/controllers/registry.ts`):
- Central registry for all IPC handlers — replaces direct `ipcMain` calls
- `ipcRegistry.on(channel, handler, source)` / `ipcRegistry.handle(channel, handler, source)`
- `ipcRegistry.seal()` called after all controllers register — throws on duplicate or post-seal registration
- **Always use `ipcRegistry` instead of `ipcMain` directly** for new IPC handlers

**Controllers** (`src/main/controllers/`):
- `SettingsController` — settings get/set, frame style, scaling, export dir
- `FontController` — font enumeration and file serving
- `ClipboardController` — clipboard read and write (`getClipboardData` / `setClipboardData`)
- `AuthController` — login, logout, app auth flow
- `FileController` — file creation and export
- `ChangelogController` — What's New overlay open/close, `openExternal`

**WindowManager** (`src/main/Ui/WindowManager.ts`):
- Maintains Map of all Window instances (keyed by window ID)
- Tracks last focused window
- Restores/saves window state from settings
- Handles protocol URLs (`figma://` links)
- Manages closed tabs history

**Window** (`src/main/Ui/Window.ts`):
- Wraps a `BrowserWindow` with a `TabManager`, a `SettingsView` and a lazily created `TabPreviewView`
  (the hover card, `src/main/Ui/TabPreviewView.ts` + `src/renderer/Preview/`)
- Child views (tabs, the hover card, the Settings tab, the What's New overlay) are attached to the
  `BrowserWindow` once and switched with `view.setVisible()`; `swapTo()` shows the next tab and
  hides the previous one (and the Settings tab, if it was in front). See the gotcha "Child views
  are attached once" below.
- **Settings is a tab, like a browser's settings page** (`src/main/Ui/SettingsTab.ts`). It has two
  states: *open* (in the strip) and *shown* (on screen). Switching to a file hides it but keeps it
  in the strip; closing it (×, middle click, Ctrl+W while shown) refocuses the tab that was under
  it. Closing the tab *under* Settings keeps Settings in front; the neighbour becomes the tab
  underneath (`Window.closeTab`). It is not a `TabManager` tab — it never drags, groups, previews or gets saved with the
  session. The panel learns of it via `settingsTabOpened`/`settingsTabClosed` and draws it with
  `Panel/frames/SettingsStripTab.svelte`; `currentTab` is `"settingsTab"` while it is shown
  (a panel-only `PanelTabId`, not part of `Types.TabIdType`).
- Owns a `WarmTabManager` (`src/main/Ui/WarmTabManager.ts`) that keeps a **warm tab**: a pre-loaded new-file `Tab` kept in the background for instant opening (TTL: 5 minutes), attached hidden from creation so promoting it is a plain `setVisible(true)`. Pre-warming happens after a file tab is opened.

**TabManager** (`src/main/Ui/TabManager.ts`):
- Per-window tab management
- Three live tab types: `MainTab` (always present), regular `Tab`s, `CommunityTab`, plus
  `DiscardedTab` — a shell with no `WebContentsView` for a saved tab that is not loaded yet
  (`app.lazyRestoreTabs`); `reviveTab()` turns it into a `Tab` when it is first needed
- Each tab is a `WebContentsView` positioned below the panel
- Only one tab visible at a time

**ExtensionManager** (`src/main/ExtensionManager.ts`):
- Loads the local plugins listed in `app.savedExtensions` (added through Figma's "Import plugin
  from manifest…", which opens a file dialog). There is no scanned Extensions directory.
- Watches each registered plugin's files with Chokidar for hot-reloading during development
- Observer pattern for manifest and code file changes

**Storage** (`src/main/Storage.ts`):
- Singleton (`storage`) for settings persistence to `~/.config/figma-linux-next/settings.json`
- `storage.initialize()` must be called at startup before App
- Deep-merges saved settings with `DEFAULT_SETTINGS` on load
- IPC registration is in `SettingsController`, not in `storage` itself

**Dialogs** (`src/main/Dialogs/`):
- Provider pattern: Native (Electron dialogs) or Zenity (GTK dialogs)
- `dialogs.switchProvider(useZenity)` switches at runtime; controlled by `settings.app.useZenity`

**MCP Server** (`src/main/MCP/McpServer.ts`):
- MCP protocol (JSON-RPC 2.0 over Streamable HTTP) on port **3845**
- Exposes Figma design context to AI assistants via `webContents.executeJavaScript()`
- Started in `App.ready()`
- Tool surface mirrors Figma's remote MCP: `use_figma` runs Plugin API `code` (atomic via an undo
  marker, `scripts/useFigmaCode.ts`), every file tool takes `fileKey` (routes to that file's tab,
  `utils/fileKey.ts` + `WindowManager.findFileTab`), plus `whoami`, `download_assets`,
  `upload_assets` (single-use `POST /upload/<token>`), `create_new_file` (a real file),
  `get_comments` / `get_versions` (figma.com endpoints the page can read). `get_design_context`
  answers in markup with CSS and variable/style/component legends (`scripts/designContext.ts`);
  component search uses Figma's internal asset search, found in the page's bundler by method
  name. Third tier behind `mcp.enableAiTools` (default off, spends AI credits): Figma's agent
  (`figma_agent_prompt/threads/read`), image generation/editing, credits
  (`scripts/figmaAgent.ts`, `scripts/figmaAi.ts`). Settings lists every tool with its
  description via the `getMcpTools` invoke. The page's
  `figma` is not a plugin sandbox: no `documentchange`, read-only `root.name`, unloaded pages look
  empty — see the `figma-mcp-driving` skill. Requests with a non-loopback `Origin` get 403.
- `get_design_context` has two forms. Default: markup with CSS. With `clientFrameworks` naming
  React / Next.js / Remix / Gatsby, or `format: "react"`: a React + Tailwind component like Figma's
  remote tool (asset URLs as constants, `data-node-id`, a screenshot appended unless
  `excludeScreenshot`). The React form is built in Node from the same markup
  (`utils/markup.ts` → `utils/tailwind.ts` → `utils/reactCode.ts`); the page script only gains a
  `forCode` option (every instance written out, image fills named by hash). To check a change to
  it, render the output in a browser next to `get_screenshot` of the node — that is how the missing
  gradient direction and the misplaced line-height were found (2026-11-13).
- `get_motion_context` (`scripts/motion.ts`) reads `node.manualKeyframeTracks`,
  `node.animationStyles` and `node.timelines`. Presets do not expose the keyframes they generate,
  only their props. `applyManualKeyframeTrack` takes `{type: "PROPERTY", name: "OPACITY"}` as the
  field, not a string.
- `use_figma` also has the helpers Figma's `figma-use` skill teaches and its remote runtime
  provides (`figma.createAutoLayout`, `figma.io.write`, `node.set/query/matches/screenshot/tree/
  placeholder`, `page.findPlacement`): `scripts/figmaHelpers.ts`. Page `figma` is frozen, so code
  gets a Proxy over it; node helpers go onto each node type's prototype as that type passes by,
  plus a one-time probe (creates and removes one node per type, inside the undo step) only when
  the code mentions a node helper. Images from `screenshot()` / `io.write` come back as MCP
  `image` items. Without them agents lost a round trip per run to `... is not a function`
  (measured in an agent benchmark against Figma's remote MCP, 2026-11-06).
- A tab that is not in front gets no `requestAnimationFrame`, and Figma waits for a frame before
  `exportAsync`, `importComponentByKeyAsync` and team-library calls — they hung to the 60 s
  timeout. `executeInBrowserView` wraps every MCP script in `BackgroundWaker.during()`
  (`utils/backgroundWaker.ts`): `setBackgroundThrottling(false)` for the call, back to `true`
  after 60 s idle, untouched if it was already off. Not caused by the node being on another page.
- Tools never bring a tab or the window to the front (issue #90). A lazily restored tab named by
  `fileKey` is loaded where it is (`Window.loadTabInBackground`); a tab whose editor is still
  loading makes `ToolHandlers.exec` wait up to 20 s for `window.figma` and run the script again
  (measured 2026-11-13 under headless mutter: never-shown tab ready in ~2 s, lazily restored one
  screenshotted in 5.5 s, minimized window fine). A file with no Plugin API for good (plugins off
  in the org) pays the wait once, then fails at once for 2 min. A file with no tab at all is
  still an error.
- With the screen locked or off GNOME gives no window any frames, even the tab in front, so
  rAF-waiting calls stalled whatever the throttling setting. `withFrames`
  (`utils/framePump.ts`) wraps every MCP script: one still running after 300 ms gets a 1x1
  `capturePage({stayHidden: true})` every 250 ms, which makes the compositor produce a frame.
  Measured 2026-11-13 on the locked session: never-shown background tab, `get_screenshot`
  timed out without it and took 0.7 s with it. `stayHidden: false` left the page drawing after
  the pump stopped; keep it true. If a script still times out, the error says whether the page
  gets frames (`FRAMES_PROBE_SCRIPT`).
- Testing MCP against a real compositor without the user's screen: `mutter --headless --wayland
  --no-x11 --wayland-display fln-wl --virtual-monitor 2200x1300@60`, then launch the app with
  `WAYLAND_DISPLAY=fln-wl` and an isolated `XDG_CONFIG_HOME`. Unlike xvfb it behaves like the
  user's GNOME (hidden views really are hidden) and frames always arrive.
- `search_design_system` covers UI kits (Simple Design System, iOS, Material) through the Assets
  panel's kit search (`/api/search/community_libraries/library_assets`); `figma.teamLibrary` and
  the team component search never return them. `includeLibraryKeys` takes a library name or key.
- Live check: `bun scripts/mcp-smoke.ts <port> --file <scratch fileKey>`

**FigmaAgent** (`src/main/FigmaAgent.ts`):
- The local helper figma.com looks for from a *browser*. The page never uses `figma://` for
  "Open in desktop app": it probes `http://127.0.0.1:44950/figma/...` (the official app's font
  helper) and, if it answers, shows the menu item, the "Open links in desktop app" preference and
  redirects file links on load. Its platform check includes Linux. Endpoints answered: `/version`
  (`{version}`, ≥ 24 or the page skips the preference push), `/desktop/can-open-url`
  (`{canOpen}`), `/desktop/open-url` (`{opened}`, routed to `WindowManager.openUrl`), and the
  preference POST. Everything else 404s. Requests without a figma.com `Origin` get 403 — the
  open-url GET is a simple request any page could fire — and only https figma.com URLs for a
  signed-in user id (`WindowManager.getKnownUserIds`) are opened. Protocol read out of the
  production bundle on 2026-10-11 (`routeAgentRequest` is pure and unit-tested). Setting:
  `app.figmaAgentEnabled`, **default off**: `figma-agent-linux` (AUR, local fonts for figma.com in
  a browser) listens on the same `127.0.0.1:44950` via a systemd socket. If this app binds first,
  the browser silently loses local fonts — we 404 the font endpoints. The port is fixed by Figma's page.

**UrlHandlerIntegration** (`src/main/UrlHandlerIntegration.ts`):
- Makes sure `figma://` reaches the app when no package registered it: an AppImage always writes/refreshes its own `.desktop` (path may move); a bare binary (`nix run`, unpacked zip) writes a "local" entry only if `xdg-mime` reports no handler at all. Flatpak and dev are skipped. Rules live in the pure `planUrlHandler()` (unit-tested)

### Renderer Process Structure

**Preload Bridge** (`src/main/preload/bridge.ts`):
- Exposes `window.figmaApi` via `contextBridge` — the only IPC surface for Panel and Settings
- Four typed methods: `send(channel, ...args)`, `invoke(channel, ...args)`, `on(channel, listener)` (returns an unsubscribe function), `once(channel, listener)`
- `SEND_CHANNELS`, `RECEIVE_CHANNELS`, `INVOKE_CHANNELS` act as an allowlist — see the file for the current list
- **Adding a new IPC channel requires updating all three of: the allowlist in bridge.ts, the ipcRegistry in the relevant controller, and the renderer call site**

**Panel** (`src/renderer/Panel/App.svelte`):
- Top toolbar with frame-specific Left/Tabs/Right components
- IPC listeners registered in `src/renderer/Panel/ipc.svelte.ts`
- Svelte stores in `src/renderer/Panel/store/`: `currentTab`, `tabs`, `panelZoom`

**Settings** (`src/renderer/Settings/`):
- Full-size page in the Settings tab: sidebar (search + five sections) and one section view at a time
  (`Components/Views/{General,Appearance,Tabs,Integrations,Advanced}View.svelte`).
- `schema.ts` holds every row's section, title, help text and search keywords; rows render
  their text from it (`<SettingRow setting={SETTINGS.x}>`), so search can't drift from the UI.
  An e2e test fails if a schema entry has no row on screen. New setting = schema entry + row +
  (if editable) a key in `Utils/Common/settingsEdit.ts`.
- Frame choices are drawn by `FramePreview.svelte` from the panel's own icon config and
  `--frame-*` palette (`.frame-preview[data-frame]` in theme.css) — not screenshots.
- Help text uses `--text-secondary` (AA on `--bg-card` in both themes); `--text-disabled` is for
  disabled things only.
- Saves as you edit (`autosave.svelte.ts` → `updateSettings` invoke, 300 ms debounce, flushed when the tab is hidden); closing only hides the view.
  The page dies with its window, and a pending save timer with it, so closing a window, Quit,
  Restart and a window-manager close all await `Window.flushSettings()` first (calls
  `window.__flushSettings` in the page, bounded to 1 s). The debounce always queues the latest
  state and compares with the last save only when sending — a switch flipped and flipped back
  within the delay must not write the first flip.
  Only the fields listed in `Utils/Common/settingsEdit.ts` are sent — never the whole settings object, which
  would overwrite main-owned state (`windowsState`, `recentlyClosedTabs`, `userId`) with the snapshot Settings
  loaded with. A new user-editable setting must be added to that list, and its side effect to
  `planSettingsUpdate`. Restart-only settings are compared against launch values and shown as a banner.

**DesktopAPI** (`src/renderer/DesktopAPI/`):
- `webBinding.ts` — Establishes two-way MessageChannel with Figma web app; exposes `window.__figmaDesktop`
- This is NOT the preload IPC bridge — messages come through the MessageChannel, not `window.figmaApi`

### IPC Communication

All IPC goes through `window.figmaApi` (renderer) ↔ `ipcRegistry` (main). The authoritative channel lists live in `src/main/preload/bridge.ts` (`SEND_CHANNELS`, `RECEIVE_CHANNELS`, `INVOKE_CHANNELS`).

### Path Aliases (tsconfig.json)

The project uses TypeScript path aliases for cleaner imports:

```typescript
import { logger } from "Main/Logger";
import { CheckBox } from "Common/Input";
import { BASE_DEFAULT_SETTINGS } from "Utils/Common/defaultSettings";
```

Aliases:
- `Main/*` → `src/main/*`
- `Utils/*` → `src/utils/*`
- `Common/*` → `src/renderer/Common/*`
- `Icons`, `Containers`, `DesktopAPI` → their folders under `src/renderer/Common` / `src/renderer`
- `Types/*` → `src/types/*`
- `Const` → `src/constants`

When adding new code, use these aliases instead of relative paths.

### Settings Structure

Persisted at `~/.config/figma-linux-next/settings.json`. Authoritative source:
`src/utils/Common/defaultSettings.ts` (`BASE_DEFAULT_SETTINGS`) and `src/types/` interfaces.

Three files carry the name `defaultSettings.ts`, and only the first holds values:

| File | Holds |
|---|---|
| `Utils/Common/defaultSettings.ts` | `BASE_DEFAULT_SETTINGS` — every environment-independent default |
| `Utils/Main/defaultSettings.ts` | Main-process layer: `clientId`, `$HOME`-derived paths |
| `Utils/Render/defaultSettings.ts` | `export { BASE_DEFAULT_SETTINGS as DEFAULT_SETTINGS }` — 4 lines, a shape placeholder; the renderer's real values arrive over the `getSettings` IPC |

## Extension System

Extensions are local Figma plugins imported from their `manifest.json` (Plugins → Development →
"Import plugin from manifest…"). Their paths are stored in `settings.json` under
`app.savedExtensions`; there is no folder the app scans.

**Structure**:
- `manifest.json` - Extension metadata
- UI/Code/Resource files (`.ts`, `.js`, `.css`, `.html`)

**Development**:
- Import the plugin once from its manifest
- ExtensionManager watches its files with Chokidar
- Hot-reloading on code changes
- No app restart needed

## Platform-Specific Features

### GPU Acceleration & Wayland

`applyChromiumSwitches()` (`src/main/applyChromiumSwitches.ts`, called from `src/main/index.ts`
before `App` exists) applies the Chromium flags:
- GPU acceleration flags (critical for Figma's WebGL canvas)
- Wayland support detection and enablement
- Hardware video decoding (VAAPI)
- Color space management (sRGB option)

Custom switches can be added in settings under `app.commandSwitches`.

WebGPU shaders (`app.enableWebGPU`): Chromium blocks WebGPU-to-GL interop on Linux
(`software_rendering_list.json` entry 186, crbug 442791440) except Intel Gen12+ (Chrome 145+)
and NVIDIA ≥ 535.183.01 (Chrome 147+); AMD has no exception as of 2026-10. On a blocked GPU the
toggle relaunches the packaged app under XWayland (`shouldRelaunchUnderX11` in
`src/main/applyChromiumSwitches.ts`, called from `src/main/index.ts`).
`Utils/Main/nativeWebGpu.ts` reads `/proc/driver/nvidia/version` before Chromium starts and skips
the relaunch only when all DRM GPUs are NVIDIA and the driver is allowlisted — measured 2026-10-11 on an RTX 3080 with Electron 44:
native Wayland, no flags, "WebGPU interop: Hardware accelerated". Intel is not detected yet.

### Window Frame Styles

`Types.FrameStyle` is `"windows" | "gnome" | "macos" | "kde"` (`src/types/Common/index.d.ts`).

- `app.frameStyleAuto` (default `true`) picks the frame from the desktop environment:
  `detectFrameStyle()` in `src/utils/Main/desktopEnvironment.ts` reads `XDG_CURRENT_DESKTOP` /
  `DESKTOP_SESSION` — KDE/Plasma → `kde`, GNOME/Budgie → `gnome`, anything else → `windows` (Legacy). Only main can see the env,
  so renderers get the resolved value from the `getRuntimeInfo` invoke, never from `app.frameStyle`.
- `app.frameStyle` is the manual override, used only when `frameStyleAuto` is off.
- `gnome` (Adwaita), `kde` (Breeze glyphs, `Icons/Breeze*.svelte`, LGPL) and `windows` are
  implemented; `macos` is a placeholder on top of the Windows style.
- Frames are theme-aware: every colour goes through the `--frame-*` palette in
  `src/renderer/theme.css`, scoped by `#panel[data-frame]` × `html[data-theme]`. Figma's theme
  choice (`dark`/`light`/`system`) arrives via `setFigmaTheme`, is resolved in `src/main/Theme.ts`
  (`system` → `nativeTheme.shouldUseDarkColors`) and pushed to panels as `figmaThemeChanged`.
  Never hardcode a colour in `src/renderer/Panel/frames/`.

## Logging

**Logger** (`src/main/Logger/AppLogger.ts`):
- Multi-sink architecture: console + file
- File logs: `~/.config/figma-linux-next/logs/figma-linux-next.log` (Flatpak: `~/.var/app/app.borys.FigmaLinuxNext/config/figma-linux-next/logs/`), file level `debug`
- Console and file levels are fixed at `debug` (`src/main/Logger/index.ts`); `app.logLevel` exists in
  the settings but nothing reads it

## Critical Files Reference

| File | Purpose |
|------|---------|
| `vite.config.mts` | Vite build config (main + renderer) |
| `src/main/index.ts` | App entry point; initializes storage, dialogs, dependencies |
| `src/main/App.ts` | Lifecycle orchestration, controller wiring, MCP server and FigmaAgent start |
| `src/main/applyChromiumSwitches.ts` | Chromium command-line switches, WebGPU/XWayland relaunch decision |
| `src/main/controllers/registry.ts` | IPC channel registry (seal-on-startup pattern) |
| `src/main/controllers/` | IPC controllers: Settings, Auth, Font, Clipboard, File, Changelog |
| `src/main/preload/bridge.ts` | contextBridge → `window.figmaApi`; IPC channel allowlists |
| `src/main/Storage.ts` | Settings persistence |
| `src/main/Ui/WindowManager.ts` | Window lifecycle & routing |
| `src/main/Ui/Window.ts` | Single window: BrowserWindow + TabManager + warm tab |
| `src/main/Ui/TabManager.ts` | Tab management per window |
| `src/main/Dialogs/index.ts` | Dialog provider (Native / Zenity) |
| `src/main/MCP/McpServer.ts` | MCP protocol server (port 3845) |
| `src/main/UrlHandlerIntegration.ts` | figma:// handler registration for AppImage / bare-binary launches |
| `src/main/FigmaAgent.ts` | Local helper figma.com probes from a browser (port 44950) so browser links open in the app |
| `src/main/ExtensionManager.ts` | Plugin system with hot-reloading |
| `src/renderer/Panel/App.svelte` | Main toolbar UI |
| `src/renderer/Panel/ipc.svelte.ts` | Panel IPC listener registrations |
| `src/renderer/DesktopAPI/webBinding.ts` | Figma web ↔ desktop MessageChannel bridge |
| `src/utils/Common/defaultSettings.ts` | `BASE_DEFAULT_SETTINGS` — authoritative settings schema |
| `src/utils/Main/defaultSettings.ts` | Env-dependent defaults layered on the base (clientId, `$HOME` paths) |
| `src/utils/Render/defaultSettings.ts` | Re-export of the base for the renderer — no values of its own |
| `src/utils/Render/frameTheme.ts` | Frame style icon/component config (`FrameConfig`) |
| `src/renderer/Panel/frames/` | Per-frame Svelte components (`FramedPanel`, `FramedLeft`, `FramedTabs`, `FramedRight`) |
| `config/builder.json` | electron-builder package config |
| `src/package.json` | Production manifest copied to `dist/` during build — **must stay in sync with `package.json` dependencies** |

## Important Gotchas

### Electron version is exact (no caret) — every bump needs a manual OAuth test
`package.json` lists an exact version, currently `"electron": "45.1.0"` (Chromium 156, Node 24), bumped 2026-10-29 from 44.5.1 (via 44.10.0). OAuth first login re-verified on 45.1.0 (2026-10-30, clean profile, bundled binary): `__Host-figma.authn` lands. 44.10.0 was never shipped or login-tested on its own.

45 strips `Buffer`, `setImmediate` and the `events`/`timers`/`url` modules from sandboxed preloads. Ours (`bridge.js`, `loadContent.js`, `loadMainContent.js`) only `require("electron")`; keep it that way or add a polyfill.

History: 43.3.0 shipped a StatusNotifierItem regression (tray icons invisible on GNOME/AppIndicator, Cinnamon, XFCE; electron#52674, fixed in 43.4.1). 44.0 rebuilt the `clipboard` module: every method is async, payloads are `ClipboardItem` → `Blob` by MIME type, `readImage/writeImage/readBuffer/writeBuffer` are gone, and the module no longer exists in renderers — which is why `ClipboardController` now owns both read and write and the tab preload only forwards `getClipboardData`/`setClipboardData`.

The pin exists because of a past regression: Electron 42.3.0 (Chromium 148.0.7778.180) shipped a Chromium roll (PR #51600, 1293 commits) carrying a `request_header_integrity` change in Google's closed-source signed-integrity-headers component. Figma's server validated those headers and silently rejected `/app_auth/redeem` — the response was login HTML instead of `Set-Cookie`, so first-login and add-account both broke with no error message. The project sat on 42.0.1 until 43.3.0 was confirmed clean.

**Before any bump**, build and run a first login against clean storage and verify `Set-Cookie` lands. Two things make this test easy to get wrong:

- **Test the bundled binary from `node_modules`.** Distro Electron packages (Arch's `electronNN`) are rebuilt from source and may not carry the same closed-source components, so a green run there says nothing about what electron-builder ships.
- **Isolate config via `XDG_CONFIG_HOME`, and copy `~/.config/mimeapps.list` into it.** The default-browser mapping lives in that file; without it gio picks an arbitrary browser and the login opens in the wrong one.

The `figma://` redirect must reach the instance under test. Registering a second `.desktop` does not work — Firefox keeps its own handler list and offers the installed entry. Shadow `/usr/share/applications/figma-linux-next.desktop` with a copy in `~/.local/share/applications` that keeps `Name`/`MimeType` and redirects `Exec`.

Not called anywhere at the moment; if it comes back: `app.getApplicationInfoForProtocol()` gained Linux support during the 42.x line (absent in 41.x and 42.0.1, present in 42.8.0+). Guard it with `typeof` before calling — the AUR `figma-linux-next` package runs against whatever system Electron is installed.

### Two package.json files — keep dependencies in sync
`package.json` is the dev manifest. `src/package.json` is a separate production manifest that gets copied to `dist/` during `bun run build`, then `bun install --production` runs inside `dist/`. **When updating a runtime dependency version in `package.json`, update `src/package.json` too**, otherwise the installed package in production builds will be the old version.

### fontkit 3 is ESM-only, loaded with require()
`fontkit` is external to the main bundle, which is CommonJS, so `dist/main/main.js` does
`require("fontkit")` on a package that ships only ES modules (3.0.0, 2026-11). That relies on
Node's require(esm) (Node ≥ 22.12): fine on the bundled Electron 45 (Node 24, checked), and a
startup crash on a system Electron older than that for the AUR `figma-linux-next` package.
2.0.4 threw on some variable fonts (SF Pro, New York, Cantarell: "reading 'en'"), which the
font scan swallowed, so those lost their axes; 3.0.0 reads them. To compare two versions, dump
`fontkit.open()` results for `fc-list : file variable` files with each and diff.

### TabManager.getById() and unknown IDs
`TabManager.getById(id)` returns `undefined` for an unknown numeric ID (it used to fall back to
`mainTab`, so `closeTab()` / `removeChildView()` on a stale ID silently hit the home tab; a unit
test pins the current behaviour). The string IDs `"mainTab"` / `"communityTab"` still resolve.
Keep guarding dynamic IDs with `tabManager.getAll().has(id)` — `closeTab` relies on it.

### Figma web app → desktop IPC (webBinding.ts)
Figma sends fire-and-forget messages to `window.__figmaDesktop` via the message channel. Unhandled messages log `[desktop] Unhandled message <name>` warnings. To silence a message without implementing it, add a no-op stub in the `publicAPI` object in `src/renderer/DesktopAPI/webBinding.ts`. DEV-mode `console.debug` is acceptable for stubs to aid future implementation.

### Warm tab and double-close
When the user clicks Home Tab, the renderer sends both `setFocusToMainTab` IPC **and** `closeTab(newFileTabId)`. The main process `setFocusToMainTab()` also calls `closeNewFileTab()` internally. This double-close is intentional — the guard in `closeTab()` (`tabManager.getAll().has(id)`) prevents the second call from accidentally removing `mainTab`.

### Child views are attached once — switch with setVisible, never detach and re-attach
Tab views, the tab preview card, the Settings tab and the What's New overlay are added to
`window.contentView` once, hidden, the moment they are created (`Window.attachHidden()`; the
overlay in the `ModalViewManager` constructor) and afterwards only toggled with
`view.setVisible()`. On Wayland with Electron 44 a `WebContentsView` that is `removeChildView`ed and
later `addChildView`ed again never becomes visible: `document.visibilityState` stays `hidden`,
nothing paints and the tab shows white until a relayout (verified 2026-09-07 on GNOME 50 with a
minimal repro; Electron 43 was fine, and X11/xvfb — where the e2e suite runs — never reproduces it).
Re-adding an *attached* view is safe and is how the overlay raises itself above tabs attached since
(`addChildView` on a current child reorders it to the top). `removeChildView` is reserved for views
about to be destroyed (`closeTab`, `closeAllTab`, community close, warm-tab discard).

Tab thumbnails: `captureThumbnail()` is fired *before* the outgoing tab is hidden — a hidden view
has no compositor surface and `capturePage()` rejects with `UnknownVizError`. Do not try to capture
a background tab on demand; `tab.thumbnail` is the only source the hover card has.

### openFile must close the New File tab
`Window.openFile()` must call `closeNewFileTab()` after opening the file tab. Without this, the New File tab stays visible as a leftover. `createFile()` already does this — keep them consistent.

### Restart in `bun run dev` goes through Vite
vite-plugin-electron spawns Electron and ends the dev server when it exits, so `app.relaunch()`
under `bun run dev` comes back to a dead server: no panel, `chrome-error://chromewebdata/`.
`App.relaunchApp` therefore saves state and sends `DEV_RELAUNCH_MESSAGE` (`src/constants/dev.mts`)
to Vite over the plugin's IPC channel; `onstart` in `vite.config.mts` restarts Electron with
`startup()`, which unhooks the exit handler first. Packaged builds still `app.relaunch()`.

### app.whenReady() not app.on('ready', ...)
Always use `app.whenReady().then(...)` for the Electron ready handler. `app.on('ready', ...)` silently misses the event if registration is delayed (e.g. async startup). `app.whenReady()` resolves immediately if the app is already ready.

### IpcRegistry seal pattern
`ipcRegistry.seal()` is called in the `App` constructor after all controllers register. Any attempt to register an IPC handler after sealing throws immediately. This catches duplicate registrations and modules that try to add handlers too late. Never call `ipcMain` directly for new handlers — always go through `ipcRegistry`.

### contextBridge channel allowlist
`window.figmaApi` enforces channel allowlists at runtime. Any `send()`/`invoke()`/`on()` call with an unlisted channel silently no-ops or rejects. When adding a new IPC flow, update the allowlists in `src/main/preload/bridge.ts` (`SEND_CHANNELS`, `RECEIVE_CHANNELS`, or `INVOKE_CHANNELS`).

### EPIPE guard in uncaughtException
`src/main/index.ts` ignores `EPIPE` errors in the `uncaughtException` handler. Logging an EPIPE through the same broken pipe triggers another EPIPE → infinite loop. This guard is intentional — do not remove it.

### Branching strategy
- `staging` — integration branch, all features/fixes and version bumps happen here
- `dev` — stable release branch, **protected**: no direct pushes, no force pushes, CI must pass; merges only via PR from `staging`
- `.jules/` — local-only folder (gitignored) with task instructions for the Jules AI agent

**Release flow** (tag push triggers CI/release — push tag ONLY after staging merges into dev):
1. Commit all changes to `staging`, update `CHANGELOG.md`
2. `perl scripts/bump_version.pl X.Y.Z` — rewrites `package.json`, `src/package.json` and the Flatpak metadata (via `sync_flatpak_release.py --version`), then creates the version bump commit + tag **locally** on `staging`. It aborts before committing if the Flatpak step fails.
3. `git push origin staging` — push branch only, **do NOT push the tag yet**
4. Open PR: `staging → dev` on GitHub, wait for CI green, merge
5. `git push origin vX.Y.Z` — push tag **after merge** → triggers `release.yml` → GitHub Release + AUR update

⚠️ Never push the tag before the PR is merged — that would release before dev is updated, defeating branch protection.

**`enforce_admins: false`** — owner can bypass protection in emergencies.

### CI/CD automation (`release.yml`)

Tag push (`v*.*.*`) triggers `release.yml`. The four build jobs run in parallel, `release` waits for
all of them, then the publishing jobs (`aur`, `aur-bin`, `flake`, `flatpak-repo`) run in parallel
and `flatpak-pin` runs after `flake`:

1. **`build-x64`** — builds deb, rpm, AppImage, zip on Ubuntu (electron-builder bundles Electron)
2. **`build-arm64`** — same formats on native ARM runner
3. **`build-pacman`** — builds `.pacman` in Arch container (electron-builder bundles Electron)
4. **`build-flatpak`** — builds a `.flatpak` bundle from `flatpak/app.borys.FigmaLinuxNext.yml` in the `ghcr.io/flathub-infra/flatpak-github-actions:freedesktop-25.08` container. x64 only (the manifest hardcodes the x64 Electron zip), and `continue-on-error: true` — a Flatpak failure costs the release its `.flatpak` and nothing else. Note this builds the manifest's `tag:`, so `sync_flatpak_release.py` keeping that tag current is what makes the bundle match the release.
5. **`release`** — collects all artifacts, computes SHA256SUMS, creates GitHub Release via `softprops/action-gh-release`. The Flatpak download step is `continue-on-error` since the artifact may not exist.
6. **`aur`** — clones `ssh://aur@aur.archlinux.org/figma-linux-next.git`, updates `pkgver` + SHA256 in PKGBUILD, generates `.SRCINFO`, pushes to AUR
7. **`aur-bin`** — same for `figma-linux-next-bin` (hashes the release zip instead of the tarball)
8. **`flake`** — recomputes the release zip hashes as SRI, runs `scripts/update_flake_release.py`, commits the pinned `flake.nix` to `dev` first, then mirrors it to `staging`
9. **`flatpak-repo`** — runs after `release`: pulls the previous repository state back from the live
   Pages site (`ostree pull --mirror --depth=1`), imports this release's `.flatpak` with
   `flatpak build-import-bundle`, signs and prunes (`--prune-depth=1`), writes the `.flatpakrepo` /
   `.flatpakref` files and `flatpak/pages/index.html`, then deploys the whole site with
   `actions/deploy-pages`. Pages is in **workflow** build mode (switched 2026-09-06), so the old
   Jekyll rendering of README at the same URL is gone — the site is now the Flatpak repo. Skipped
   when `build-flatpak` produced no bundle. Signing key: `FLATPAK_GPG_KEY` secret (armored private
   key, fingerprint `0519BE241207E6F2F0E18F0788A28A2C84E355F9`); public half committed as
   `flatpak/figma-linux-next-repo.gpg`. Losing the private key means every existing install must
   re-add the remote — keep a copy outside GitHub. The `github-pages` environment has a
   deployment-branch policy; the job runs from a *tag*, so the policy must include a `v*` rule of
   type `tag` next to `dev` (added 2026-09-07 after v0.20.0 failed with "Tag is not allowed to
   deploy to github-pages"). Check with
   `gh api repos/arximus88/figma-linux-next/environments/github-pages/deployment-branch-policies`.
10. **`flatpak-pin`** — runs `scripts/sync_flatpak_release.py --commit <tag sha>` and commits the pinned manifest to `dev`, then `staging`. Depends on `flake` as well as `release`: both push to `dev`, and run in parallel the loser is rejected as non-fast-forward. Distinct from `build-flatpak`, which produces the bundle.

Secrets required: `ID_RSA` (AUR SSH key, base64-encoded), `USER_NAME`, `EMAIL`, `RELEASE_PAT`, `FLATPAK_GPG_KEY` (armored GPG private key that signs the Pages Flatpak repo).

**`flake.nix` pins version + hashes together** and is updated by CI, not by `bump_version.pl` — the hashes don't exist until the release binaries are built. Never bump the version in `flake.nix` by hand: it would name a release whose hashes it doesn't have, and every `nix build` would fail on a hash mismatch.

### Flatpak release metadata — `scripts/sync_flatpak_release.py`

The app version appears in four files, and the Flatpak one fails quietly: a stale `tag:` in
`flatpak/app.borys.FigmaLinuxNext.yml` builds, installs and runs — it just packages the
*previous* release. Nothing else in the pipeline notices. The script is the single writer:

| Mode | Called by | Does |
|---|---|---|
| `--version X.Y.Z` | `bump_version.pl` | rewrites `tag:`, `flatpak/package.json` version, adds a `<release>` to the metainfo, drops the previous `commit:` pin |
| `--commit SHA` | `release.yml` `flatpak-pin` job | pins the git source to the tag's commit |
| `--check` | `ci.yml` on every push/PR | fails on any drift |

The split exists because the commit sha does not exist until the tag is pushed, the same
reason `flake.nix` is CI-owned.

`--check` covers more than the version: the Electron pin across `package.json`,
`flatpak/package.json`, the `unzip` path and `generated-sources.json`; dependency equality
between root and `flatpak/package.json`; and the vendored sources themselves — every npm
tarball's hash against `flatpak/package-lock.json`, plus a host allowlist
(npm/github.com/electronjs.org) so a hand-added source is rejected.

**Electron bumps are checked, never rewritten** — a new Electron needs
`flatpak-node-generator` re-run with network access (commands are in the manifest header),
so the script reports the drift instead of producing a lockfile it cannot vendor.

**`RELEASE_PAT`** is a fine-grained PAT (`Contents: Read and write`, this repo only, created 2026-08-05, **expires 2027-08-05**). It exists because Nix resolves `github:arximus88/figma-linux-next` from `dev`, and the default `GITHUB_TOKEN` cannot push to a protected branch — without it NixOS users would always install the previous release. When it expires the `flake` job starts failing with a 403 on push and nothing else changes; regenerate it and `gh secret set RELEASE_PAT`. The job runs last and depends on `release`, so a rejected push never blocks the release itself.

Other workflows:
- `ci.yml` — runs on push **and** PR to both `staging` and `dev` (changelog data generation, type check, lint, unit tests, production build, e2e under xvfb, Flatpak metadata check)
- `remove_artefacts.yml` — cleanup

### AUR packages

| Package | Electron | Auto-updated | Repo |
|---------|----------|-------------|------|
| `figma-linux-next` | System (whatever `pacman -S electron` gives) | Yes — `release.yml` `aur` job | `ssh://aur@aur.archlinux.org/figma-linux-next.git` |
| `figma-linux-next-bin` | Bundled (from GitHub Release zip) | Yes — `release.yml` `aur-bin` job | `ssh://aur@aur.archlinux.org/figma-linux-next-bin.git` |

Local AUR repos: `/home/arx/aur/figma-linux-next/`, `/home/arx/aur/figma-linux-next-bin/`

**Pacman uses system Electron** — version may lag behind project's Electron. `-bin` package bundles Electron from the release zip for version parity.

### bun test and electron mocking
bun validates named ESM exports statically before mocks run. `src/utils/Main/net.ts` imports `{ net }` from electron, so any test that touches the `Utils/Main` import chain needs electron pre-mocked. The preload at `tests/unit/electron-preload.ts` (registered via `bunfig.toml`) handles this globally — do not add per-file electron mocks.

## Common Development Tasks

When modifying the codebase:

1. **Adding a new setting**:
   - Add the value to `src/utils/Common/defaultSettings.ts` (`BASE_DEFAULT_SETTINGS`) —
     the `Render/` and `Main/` files of the same name will not do what you want
   - Add to TypeScript interface in `src/types/`
   - Update Settings UI if user-configurable

2. **Adding IPC handlers**:
   - Create or update a controller in `src/main/controllers/`
   - Register via `ipcRegistry.on()` or `ipcRegistry.handle()` (never `ipcMain` directly)
   - Add the channel to the appropriate allowlist in `src/main/preload/bridge.ts`
   - Call from renderer via `window.figmaApi.send()`, `.invoke()`, or `.on()`

3. **Working with tabs**:
   - TabManager handles lifecycle; each tab is a `WebContentsView`
   - Always check `tabManager.getAll().has(id)` before `getById()` on dynamic IDs
   - URL changes propagate to main process for state saving

4. **Working with extensions**:
   - ExtensionManager loads the plugins listed in `app.savedExtensions`
   - manifest.json required
   - File watching enables hot-reloading

## Testing Package Builds

```bash
# Build and install locally
bun run pack
bun run local:install

# Run from /opt/figma-linux-next
/opt/figma-linux-next/figma-linux-next
```

## Environment Variables

`bun run dev` needs none. Renderer pages load from the Vite dev server at the address
vite-plugin-electron passes in `VITE_DEV_SERVER_URL` (`devPageUrl()` in
`src/utils/Main/url.ts`). Vite takes the next free port when 5173 is busy, so never hard-code
it — a hard-coded 5173 once loaded another project's SvelteKit 404 into the panel. The old
`DEV_PANEL_PORT` / `DEV_SETTINGS_PORT` variables are gone (setting the latter pointed every
overlay at the Settings page).
