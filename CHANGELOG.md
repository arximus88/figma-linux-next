# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Flatpak support** — the Flatpak manifest now builds for real. Every npm dependency and the
  Electron binary itself are vendored up front, so the build works on Flathub's network-less
  builders. Thanks to [@blossomlabs-gh](https://github.com/blossomlabs-gh)
  ([#45](https://github.com/arximus88/figma-linux-next/pull/45)).

### Fixed

- Under Flatpak the app no longer crashes on start in a Wayland session. It used to relaunch
  itself under XWayland to enable WebGPU shaders, which zypak's spawn interception cannot
  survive; inside a Flatpak the app now stays on Wayland and runs without shaders.

## [0.16.0] - 2026-08-06

### Added

- **NixOS support** — a Nix flake with a `programs.figma-linux-next.enable` module that also
  registers the `figma://` handler needed for login redirects. Thanks to
  [@iamcalledrob](https://github.com/iamcalledrob) ([#42](https://github.com/arximus88/figma-linux-next/pull/42)).

### Changed

- **Updated to Electron 43 (Chromium 150)** from Electron 42 / Chromium 148. The app starts
  noticeably faster — this release boots the main process from a startup snapshot and caches
  preload scripts as bytecode — and picks up three months of Chromium security fixes along
  with a newer WebGPU and canvas stack. Login, image paste and window decorations were all
  verified against the new build.

### Fixed

- **Export video from Figma Motion now works.** The export queue used to open in your web
  browser, where it always showed "Your rendering queue is empty" — the queue belongs to the
  app's session, so a browser could never see it. It now opens as a tab inside the app, and
  pressing Export again reuses that tab instead of stacking duplicates. The queue also fills
  in on its own now — it used to open empty and stay empty until you switched tabs away and
  back. ([#41](https://github.com/arximus88/figma-linux-next/issues/41))
- WebGPU now follows the "WebGPU shaders" setting on X11 sessions. It was switched on for
  every X11 session regardless of the toggle, so users who had turned it off were still
  paying for it.
- With "Use Zenity for dialogs" enabled, prompts were cut off mid-sentence — the restart
  prompt never showed which setting needed the restart. Dialogs without a detail line came up
  empty altogether, and the cancel button read "No" instead of "Cancel". All three fixed.

### Under the hood

- Every `window.open` from a tab is logged with its URL, frame name and disposition, which is
  what made the export bug diagnosable at all.
- Links that the desktop browser cannot open (`about:blank`, `blob:`, `javascript:`) are no
  longer handed to it as a silent no-op — they are logged as blocked instead.

## [0.15.0] - 2026-07-01

### Added

- New tools for the built-in AI assistant integration: quickly locate layers by name or
  type, get a compact outline of a design, and safely edit text (fonts load automatically).
- You can now turn the AI assistant server on or off, change its port, and see its live
  status under Settings → General → MCP integrations.

### Changed

- Smoother tab reordering: dragging a tab lifts and selects it and shows a placeholder where
  it will drop.
- The Settings window now uses your system's native sans-serif font.

### Fixed

- Fixed a crash when creating a file from a template while no "New file" tab was open.
- Tabs that got stuck showing a loading placeholder now clear on their own.
- The AI assistant integration no longer fails on layer/page names or search text that
  contain quotes or backslashes, and its screenshot links now use the configured port.

### Under the hood

No behavior change, but a large chunk of the codebase was reorganized this cycle:

- Modularized the built-in AI-assistant (MCP) server — the single large file was split into
  focused modules (tool handlers, injected scripts, tool schemas, an HTTP session transport,
  and shared utilities) with data-driven, compile-time-checked tool dispatch.
- Broke window handling into standalone pieces: a warm-tab state machine, a modal-view
  manager for the Settings/changelog panels, and a tab-bounds geometry helper.
- Simplified the panel frame components (one shared frame; merged the per-style left/right and
  tab variants) and routed the extensions and logger subsystems through the central IPC layer.
- Replaced the vendored drag-and-drop library with the in-house tab reorder.
- Grew the automated test suite (MCP transport & write-tool gating, warm-tab lifecycle, window
  geometry, frame-style visual baselines) and trimmed overlapping end-to-end cases.

---

## [0.14.0] - 2026-06-25

### Added

- **WebGPU shader effects** — Figma's new **Shader, Halftone and Noise** effects now actually render on the canvas (previously editable in the Effects panel but with no visual output). Off by default; turn on **Settings → "Enable WebGPU shaders" (Experimental)**. They composite via Chromium's WebGPU↔GL interop, which only works under X11 ozone — so when enabled on a Wayland session the app relaunches itself once under a clean XWayland environment. While the toggle is on the app runs under XWayland, so native Wayland niceties (fractional scaling, per-monitor DPI) are traded off. Requires restart.
- **Hide minimize & maximize buttons** — new Settings option to show only the close button in the window controls, to match stock GNOME / Adwaita apps. Applies to all frame styles and updates live, no restart ([#34](https://github.com/arximus88/figma-linux-next/issues/34)).

### Changed

- **Redesigned Settings** — the General view is rebuilt in GNOME/Adwaita "boxed-list" style: grouped sections (Display, Preferences, Developer) of rounded cards with a label/description on the left and the control on the right, and the `.mcp.json` snippet in its own card beside the MCP toggles. The window title is now "Settings".
- **Toolchain migrated to Biome** — ESLint + Prettier replaced by [Biome](https://biomejs.dev/) for linting/formatting all `.ts` (same 100-col/double-quote/semicolon style, ~15× faster); `.svelte` files remain covered by `svelte-check`.
- **Dependency cleanup** — removed 11 unused dev/runtime dependencies and bumped the toolchain (Playwright, Vite, Svelte, svelte-check, electron-builder, lint-staged, @types/node) to latest. **Electron stays pinned at 42.0.1** (newer Chromium breaks Figma sign-in).

### Fixed

- **Ctrl+Shift+T reopened *all* recently closed tabs** at once — it now reopens only the most recently closed tab, and each subsequent press restores the next one, like a browser ([#35](https://github.com/arximus88/figma-linux-next/issues/35)).

### Tests

- Added unit coverage for the startup Chromium-switch logic — the full Wayland-vs-X11 truth-table (ozone platform, GPU blocklist, Vulkan/WebGPU, feature flags, colour space) and the WebGPU self-relaunch decision, including the dev/test guards. This is the area that previously had zero coverage and let a relaunch regression slip through (which hung the e2e suite under `NODE_ENV=test`; also fixed here).

---

## [0.13.8] - 2026-05-27

### Fixed

- **Multi-account sign-in** — adding a second account now actually adds it; the profile switcher shows both, and switching between them works ([#31](https://github.com/arximus88/figma-linux-next/issues/31)).
- **Sign-in flow no longer silently fails** — completing login in the browser reliably brings you back into the app authenticated.
- **No blank screen after add-account** — the empty page that sometimes appeared after the second sign-in is gone.
- **"+" new-file tab no longer opens blank** — if the page is still loading, you see the skeleton placeholder instead of a black void.
- **Non-Figma tabs (`chrome://gpu`, `about:blank`) show their real title** — they were stuck on a permanent loading skeleton.
- **"Save last opened tabs" actually persists** — closing the last window with the X button no longer drops your tab list.
- **Tab click area now covers the full visible tab** — the bottom edge is no longer a dead zone.

### Changed

- **Electron pinned to 42.0.1** — newer versions break Figma's sign-in flow (a Chromium change Figma's server rejects). The bundled AUR build was already on this version; only local dev was affected.

---

## [0.13.7] - 2026-05-12

### Added

- **File-type icons in the tab strip** — each tab now shows a colored editor-type icon (design, FigJam, Slides, Buzz, Sites, Make, library, prototype) with a grey monochrome variant for inactive tabs; a skeleton (grey icon + pulsing title bar) renders while the tab is loading; the New File picker tab gets a dedicated placeholder. Icons stay in sync via Figma's `setEditorType` / `setIsLibrary` signals, with URL-based seeding before the codename arrives.
- **In-app "What's new" overlay** — Help → Release Notes now opens a built-in overlay rendered from `CHANGELOG.md` (previously linked to GitHub). Auto-shows once after a version bump; `lastSeenChangelogVersion` is persisted in settings. The changelog HTML is generated at build time by a Vite plugin (no runtime parsing, no IPC roundtrip for content).

### Fixed

- **Zombie process after closing the last window** — the X-button close path no longer leaves a hung process holding the single-instance lock (which silently broke the next launch). `Window.getState()` short-circuits when the BrowserWindow is destroyed, state is snapshotted on `close` before destroy, and `WindowManager.saveState()` is now exception-safe per window.
- **MCP server kept the process alive on quit** — the MCP HTTP server on port 3845 is now stopped on `window-all-closed`, not only on the menu Quit path. Its open socket was preventing the event loop from exiting after the last window closed.
- **Login redeem silently failed on first open** — `app_auth/redeem` now navigates MainTab directly to the redeem URL so Figma's server sets the `figma_session` cookie reliably. The old IPC-via-webPort path was unreliable on `/login`, where the `__figmaDesktop` bridge hadn't been established yet, and the 1-second fallback bounced through a redirect loop back to `/login`.
- **`/files/` links from the New File tab opened a redirect-looping tab** — clicking "Browse more recent files" (or any file-browser URL) no longer creates a broken design-file tab. SPA navigations to `/files/…` on non-MainTab WebContents are intercepted via `did-navigate-in-page` and re-routed to MainTab, which also closes the originating New File tab — matching macOS behavior.
- **White-strip flash on `bun run dev`** — the BrowserWindow now stays hidden until the Panel renderer signals `frontReady` (with a 3s safety fallback), so Vite's empty HTML never flashes before Svelte mounts.

### Changed

- **Electron** `41.1.1` → `42.0.1` (Chromium 148, Node 24.15, V8 14.8 — includes 10 CVE backports). Breaking changes audited: `Session.clearStorageData()` `'quotas'` removal — we call it without args; macOS notification code-signing — N/A on Linux; OSR scale factor — we don't use offscreen rendering; postinstall binary download removed (replaced by the new `install-electron` CLI) — packaged builds are unaffected because electron-builder bundles its own runtime; `ELECTRON_INSTALL_PLATFORM` now respected, improving arm64 cross-build in CI.
- **lint-staged** `16.4.0` → `17.0.4` (requires Node 22.22+ / Git 2.32+ — both already satisfied).
- Minor/patch bumps across vite, svelte, typescript, eslint, prettier, and related tooling.

### Refactor

- Replaced deprecated `url.parse()` with `parseURL()` + WHATWG `URL` across `Tab`, `MainTab`, `TabManager`, and `Window` (silences Node DEP0169).
- `SwitchListItem` binds directly to the deep-reactive settings store item instead of via intermediate `$state` + write-back `$effect` — clears two svelte-check warnings about `$state` capturing only the initial prop value.
- Cleaned ~10 stale diagnostics in `WindowManager.ts` (unused imports/params) and removed dead `App.frontReady` and `MenuManager.widgetsMenu()`.

### Tests

- **E2E launcher** — `ELECTRON_RUN_AS_NODE` and `ELECTRON_NO_ATTACH_CONSOLE` are cleared inline before Playwright launches Electron. VSCode and the Claude Code extension propagate these to child shells, which made every spec fail with "bad option: --remote-debugging-port=0".
- **Unit** — 20 new tests cover `normalizeEditorType` (confirmed codenames, case-insensitivity, unknown values, non-string input) and a per-type fixture verifying URL + codename both resolve to the same canonical editor type.

---

## [0.13.6] - 2026-04-17

### Added

- **Tab cycling shortcuts** — `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle through open tabs in insertion order, wrapping around ([#25](https://github.com/arximus88/figma-linux-next/issues/25))
- **.desktop: "New Window" launcher action** — right-click the dock/taskbar icon to spawn a new window alongside existing ones; `--new-window` CLI flag added

### Fixed

- **Fonts: "Installed by you" list populated** — added snake-case `user_installed` field to the font payload that Figma's indexer classifies on (matches `neetly/figma-agent-linux` shape); local fonts now appear under the filter instead of the unclassified pool
- **Prototype tab collapsed into editor tab** — `/proto/<key>` and `/file/<key>` now produce distinct dedup keys, so clicking "Open in presentation view" while an editor tab is open spawns a separate prototype tab instead of doing nothing (or vice versa when proto opens first)
- **Dock actions ignored while app running** — `second-instance` handler now parses `--new-file=<type>` and `--new-window`; previously "New Design File" / "New FigJam" from the launcher only worked on cold start
- **"Save last opened tabs" persistence** — `onWindowAllClosed` now flushes state before quit (previously only the menu "Quit" path saved), and `saveState` drops the tabs array when the toggle is off to avoid stale restores
- **Renderer tsconfig TS6/TS5090 errors** — set `rootDir: ".."` and prefixed `DesktopAPI` path aliases with `./` after the TypeScript 6 upgrade tightened non-relative path handling

---

## [0.13.5] - 2026-04-14

### Fixed

- **Extensions: file type whitelist removed** — plugins can now use any file type (`.txt`, `.wasm`, etc.); path traversal guard added to prevent writes outside extension directory ([#23](https://github.com/arximus88/figma-linux-next/pull/23))
- **MainTab: Google SSO popup** — `window.open` for Google SSO URLs now allowed instead of blocked
- **MainTab: external URLs** — non-Figma URLs opened via `shell.openExternal` instead of loading in-app

### Added

- **AUR: `figma-linux-next-bin` package** — prebuilt binary package with bundled Electron for Arch/CachyOS users who want version parity without depending on system Electron

### CI/CD

- **`release.yml`: `aur-bin` job** — automatically updates `figma-linux-next-bin` AUR package on tag push (runs in parallel with existing `aur` job)
- **Removed `push_aur_dev_git.yml`** — targeted non-existent `figma-linux-next-dev-git` AUR package

---

## [0.13.4] - 2026-04-06

### Added

- **GPU: `DirectRenderingDisplayCompositor`** — enabled on X11 sessions; moves the display compositor onto the GPU process thread, reducing frame-delivery latency; disabled on Wayland to avoid compositor conflicts

### Fixed

- **Settings: Chromium switches editor** — `SwitchListItem` inputs now use local `$state` + `$effect` for Svelte 5 compatibility; values correctly sync back to the settings store
- **Settings: list item disabled prop** — removed `bind:disabled` in `List.svelte` (was a non-reactive Svelte 5 binding producing console warnings)
- **inputEnhancer: production log noise** — replaced bare `console.log` calls with an `isDev` log helper; init/Wayland/WebGL messages are now suppressed in production builds
- **`local:install` script** — was installing to `/opt/figma-linux` (original project path); fixed to `/opt/figma-linux-next`
- **`src/package.json` metadata** — `repository` and `homepage` fields were placeholder `"none"`; now point to the correct GitHub URL

### CI/CD

- **Branch protection on `dev`** — direct pushes blocked; merges require a PR from `staging` with CI passing; release flow updated: version bump and tag happen on `staging`, tag push triggers `release.yml`
- **Deleted dead workflows** — `update_assets.yml`, `update_amd64_assets.yml` (Docker/old-author artifacts), `manualrun_aur.yml`, `manualrun_launchpad.yml` (referenced non-existent reusable workflows)
- **`ci.yml`** — fixed unit test target: `bun test src/` → `bun test tests/unit/` (tests migrated); removed misplaced `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env
- **`push_aur_dev_git.yml`** — added `GIT_SSH_COMMAND` to clone and push steps for consistency with `release.yml`

### Removed

- **Old-project artifacts** — deleted desktop files referencing `figma-linux-test` (`figma-linux.desktop`, `figma-linux-dev.desktop`, `figma-linux-snap.desktop`)
- **Dead scripts** — `scripts/appimage.sh` (replaced by electron-builder), `scripts/build-snap.sh`, `scripts/build_ppa.sh`, `scripts/build_artefacts.sh` (Docker-based), `scripts/update_rev_changelog.pl`
- **`scripts/debian/`** — entire directory removed (Launchpad PPA dropped); `bump_version.pl` no longer generates Debian changelogs

### Refactor

- **Test infrastructure** — unit tests migrated from `src/**/*.test.ts` to `tests/unit/`; `bunfig.toml` preload path updated; `tsconfig.json` includes `tests/**`
- **`bump_version.pl`** — removed PPA/Debian changelog section; commit message now follows conventional commits format

### Dependencies

- `electron` 41.0.3 → 41.1.1
- `vite` 8.0.2 → 8.0.4
- `svelte` 5.55.0 → 5.55.1
- `svelte-check` 4.4.5 → 4.4.6
- `adm-zip` 0.5.16 → 0.5.17 (synced in `src/package.json`)
- `@playwright/test` 1.58.2 → 1.59.1
- `dotenv` 17.3.1 → 17.4.1
- `eslint` 10.1.0 → 10.2.0
- `@typescript-eslint/*` 8.57.2 → 8.58.0
- `@types/node` 25.5.0 → 25.5.2

---

## [0.13.3] - 2026-03-27

### Added

- **MCP: `use_figma` write tool** — create frames, text, and rectangles; update or delete nodes; create design token variables; reparent nodes — gated behind a new settings toggle
  - Full auto-layout support: `layoutMode`, `padding*`, `itemSpacing`, `primaryAxisSizingMode` / `counterAxisSizingMode` (HUG/FIXED), `primaryAxisAlignItems` / `counterAxisAlignItems`
  - Strokes on all create/update actions: `strokes`, `strokeWeight`, `strokeAlign`
  - `parentNodeId` on all create actions — places new nodes inside a parent frame directly
  - `reparent_node` action — move any existing node to a new parent
- **MCP: `search_design_system` tool** — search local variables, styles, and components by text query; results include values by mode and are capped at 50 per category
- **MCP: `create_new_file` write tool** — creates a new page in the current file — gated behind write tools toggle
- **MCP Write Tools toggle** — new "Enable MCP Write Tools" checkbox in Settings → General → MCP Server; disabled by default for safety; labeled **Experimental**
- **MCP: Chrome DevTools Protocol (CDP) support** — new "Enable Chrome DevTools Protocol" toggle and port field in Settings → MCP Server; enables `chrome-figma` MCP server for AI agents to interact with the app via browser automation
- **`.mcp.json`** — project-level MCP config with `chrome-figma` CDP server entry for Claude Code setup

### Improved

- **MCP: `get_variable_defs`** — when nothing is selected, now returns ALL local variable collections and styles from the entire file
- **MCP: `create_design_system_rules`** — style extraction now includes full values: paint arrays, text properties (fontSize, fontName, lineHeight, letterSpacing), effects, and grid configurations
- **MCP: session stability** — `DELETE /mcp` handler added per MCP spec 2025-03-26; `lastActivity` tracking; 30-minute idle session reaper

### Fixed

- **MCP: "needs authentication" on connect** — removed dummy OAuth discovery endpoints that caused Claude Code to require auth
- **MCP: auto-layout HUG sizing** — `frame.resize()` now runs before sizing mode assignments so `AUTO` (HUG) is not overridden to FIXED
- **MCP: fills/strokes on reparented nodes** — fills and strokes now applied after `appendChild` (Figma Plugin API resets fills on reparent)
- **MCP: font loading** — `Regular` style always loaded before non-Regular variants to prevent "font not loaded" errors on Bold/Medium text
- **CI: flaky `fs.access` unit tests** — replaced `spyOn(fs.promises, "access")` mocks with real filesystem paths; deterministic in any environment

---

## [0.13.2] - 2026-03-25

### Fixed

- **Settings** — sRGB color profile restart dialog now fires only on *enable*, not on disable; eliminated duplicate dialog when toggling rapidly

### Performance

- **Tabs** — during window resize, only the active tab's bounds are updated (previously all tabs were recalculated); reduces resize overhead proportionally to number of open tabs

### Tests

- **E2E** — added resize bounds correctness tests verifying active tab fills the window correctly after resize

---

## [0.13.1-2] - 2026-03-24 — AUR packaging fix

### Fixed

- **AUR package** — installed files were nested under an extra `dist/` directory, causing `electron` to fail with "Unable to find Electron app"; fixed by installing `dist/` contents flat into `/usr/lib/figma-linux-next/`
- **AUR launcher** — updated path check to match new flat layout

### CI

- Release workflow: split monolithic `build` job into parallel `build-x64` (ubuntu-latest) and `build-arm64` (ubuntu-24.04-arm) jobs — ARM packages now built natively; a single target failure no longer kills the whole pipeline
- AUR job: added missing `actions/checkout@v4` step (script was unavailable in container); added `curl` to pacman deps; fixed git ownership error after `chown` to non-root user

---

## [0.13.1] - 2026-03-24

### Added

- **Instant new-file tab** — warm tab preloading: "New file" tab is pre-loaded in background after login, opens immediately without network delay
- **Figma theme sync** — `setTheme` message now persists dark/light preference to settings; new tabs get correct `setBackgroundColor` (`#1e1e1e` / `#ffffff`) eliminating white flash
- **Font loading via `fc-list`** — replaced fontkit parser with fontconfig enumeration; variable fonts (Open Sans, Google Sans Flex, e-Ukraine, etc.) now correctly appear with all named instances
- **Unhandled message stubs** — `getActiveNSScreens`, `getKeyboardLayout`, `spellingGetLanguages`, `setTabColor`, `setThemePreference`, `initLivegraph` and others are now handled; dev mode logs payload for future feature work
- **Local MCP Server** — complete rewrite of the Model Context Protocol server, matching Figma Desktop behavior for seamless integration with AI coding assistants (Claude Code, Cursor, OpenCode, etc.):
  - Uses Figma Plugin API (`window.figma`) via `executeJavaScript()` instead of REST API (which was blocked by CORS)
  - Streamable HTTP transport (MCP spec `2025-03-26`) with Mcp-Session-Id session management
  - Legacy SSE transport (`/sse` + `/messages`) for backward compatibility
  - Security: host validation, CSP headers, X-Frame-Options, localhost-only binding
  - 9 tools implemented:
    - `get_design_context` — full scene-graph subtree with layout, typography, fills, effects, component metadata
    - `get_metadata` — sparse XML outline of selection for efficient large-design workflows
    - `get_screenshot` — node/canvas capture with Plugin API `exportAsync()` and `capturePage()` fallback
    - `get_variable_defs` — design tokens (variables by mode, applied styles) from selection
    - `get_code_connect_map` / `add_code_connect_map` — in-memory Figma↔code component mappings
    - `create_design_system_rules` — generates design system rules file for agent context
    - `get_figjam` — FigJam diagram XML with stickies, shapes, connectors, and node screenshots
    - `generate_diagram` — Mermaid syntax → FigJam shapes and connectors (flowcharts, state/sequence diagrams)

### Changed

- **TypeScript** `5.9` → `6.0` (removed deprecated `baseUrl`, migrated paths to `./`-relative)
- **ESLint** `9` → `10`
- **@types/node** `22` → `25`
- **yallist** `4` → `5`; `hosted-git-info` overridden to `^7` (drops `lru-cache@6` / `yallist@^4` nested dependency that conflicted with yallist 5)
- **Electron** `39` → `41.0.3`, **svelte** `5.53` → `5.55`, **vite** `8.0.0` → `8.0.2`
- **Vite** `7` → `8.0.0`
- **@sveltejs/vite-plugin-svelte** `6` → `7`
- Settings UI redesigned: toggles use accent color when enabled, info tooltips added to settings items
- Settings modal background color follows Figma dark/light theme preference
- `package.json` description updated with legal disclaimer (not affiliated with Figma, Inc.)

### Fixed

- **Team switch opens infinite-loading tab** — clicking a team/project in the sidebar now navigates the main tab instead of opening a new unresolvable tab
- **Design files opening in home tab** — `openFile()` from the home tab now correctly opens a new tab for design/proto/board URLs; only file-browser URLs (`/files/…`) stay in-place
- **Figma Make / Sites / Buzz / Slides open in browser + popup** — added `/make/`, `/site/`, `/buzz/`, `/slides/` to the `isFigmaRunUrl` whitelist and fixed `Tab.onNewWindow` to always close the popup window before routing
- **New File tab leftover** — opening an existing file from the New File tab now correctly closes it (previously only `createFile` did this, `openFile` did not)
- **App startup race with async Storage** — `app.on('ready', ...)` replaced with `app.whenReady()` to handle cases where Electron's ready event fires before async initialization completes
- **`import.meta.url` in CJS build** — Vite 8 breaking change patched via `define` in `vite.config.ts`
- **`openFileFromNewTab` 404** — files opened from new-file tab now correctly resolve URL via `new URL(args.url)`
- **Font micro-freezes** — variable fonts with non-standard name tables (e.g. Cantarell) no longer cause repeated `Cannot read properties of undefined` errors; fallback to static font metadata
- **Warm tab cascade** — `warmTabScheduled` flag prevents duplicate tab init when warm tab sends `setUser` back to main process
- **`setTabTitle` crash** — `uncaughtException` on IPC from warm tab fixed with null guard and explicit warm-tab check
- **`openFile` handlers** — null guards added across WindowManager to prevent crashes from unknown webContentsIds
- Duplicate tabs: opening the same file from Home, Community, or New File tab now focuses the existing tab instead of creating a copy
- New File (warm) tab navigating to a file URL now routes through deduplication instead of bypassing it
- Settings modal now resizes correctly when the main window is resized
- `SettingsView` IPC and app event listeners now properly removed when the window closes (memory leak fix)
- `TabManager.closeAll()` now destroys WebContents before clearing (memory leak fix)
- Opening a file from Home tab now switches focus to the new tab immediately
- Dead links in Help menu removed (Telegram channel, outdated plugin docs URL, duplicate Community Forum entry)

### Removed

- Leftover one-off patch scripts from repo root (`fix-storage-3.js`, `patch_*.py`, `patch_find_*.js`, `test.js`)

---

## [0.13.0] - 2026-02-23 — GNOME frame redesign & modernization

### 🔧 Modernization & Renaming

Project renamed from `figma-linux` to `figma-linux-next` and comprehensively modernized.

- **Configuration Isolation** — Changed config path to `~/.config/figma-linux-next` to prevent conflicts with legacy installations.
- **Branding Update** — All repository links, documentation, and app metadata updated to `arximus88/figma-linux-next`.

### Added

- **Vite Build System** — Replaced Rollup with Vite + `vite-plugin-electron` for faster builds and HMR
- **Svelte 5 Runes** — `$state`, `$derived`, `$effect`, `$props()` throughout most components
- **Fontkit Integration** — Variable Font and TrueType Collection support via fontkit library
- **Typed Bridge API** — `window.figmaApi` preload bridge with `invoke`/`send`/`on` methods
- **Async Bootstrap** — Settings fetched asynchronously, no more `sendSync` in renderer
- **Frame Style Config System** — `frameConfig.ts` + `frameStyles.ts` for declarative frame rendering
- **GNOME/Adwaita Icons** — Custom SVG icon set for GNOME frame style; GNOME frame UI redesign

### Changed

- **Package Manager**: `npm` → `bun` for all development and build commands
- **Build Tooling**: Rollup configs → single `vite.config.ts`
- **Project Name**: `figma-linux` → `figma-linux-next` across package.json, builder.json
- **Electron**: `39.1.0` → `39.6.0`
- **Svelte**: `5.x` with runes (from Svelte 4 store patterns)
- **TypeScript**: `5.7.3` → `5.9.3`
- **Vite**: Added `7.3.1`
- **svelte-check**: `4.3.3` → `4.4.0`

### Removed

- **Legacy Theme System** — Removed unstable theme engine and related constants/UI to improve application stability and performance.

### Fixed

- **Settings view crash** — Fixed `require is not defined` in renderer by bundling as IIFE
- **Auth flow** — Deep link handling, cookie persistence, preload timing
- **Panel rendering** — Clone error on tab close, file navigation behavior
- **Build conflicts** — Synchronized package names and versions across all config files

### Documentation

- All docs updated to reflect v0.13.0, Vite, and figma-linux-next naming
- `CLAUDE.md` updated with Vite build system references
- `audit.md` refreshed with current project state

---

## [0.12.0] — Major Rebuild

### 🎉 Critical Issues Addressed

This is a comprehensive rebuild addressing critical architectural and performance issues.

### Added

#### Core Features

- **Native Wayland Support** — Automatic detection and configuration of Wayland sessions (Ozone platform auto-detection, WaylandWindowDecorations, eliminates XWayland overhead)
- **Advanced Input Management** — New preload script for enhanced input handling (trackpad gesture optimization, enhanced pointer events, desynchronized canvas contexts)
- **Smart Launcher Script** (`scripts/figma-linux-launcher.sh`) — Auto-detects Wayland vs X11, applies GPU optimization flags, memory management, system Electron detection
- **Desktop Actions** — Quick actions from app launcher ("New Design File", "New FigJam Board", enhanced protocol handler support)
- **System Integration for Arch/CachyOS** — PKGBUILD for pacman, system Electron dependency, desktop entry with MIME types, multi-size icons

#### GPU & Performance

- `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy` rendering, native GPU memory buffers
- WebGL2 compute context, accelerated 2D canvas, VA-API hardware video encoding/decoding, canvas OOP rasterization
- PipeWire screen capture, zero-copy DMABUF rendering path, native Wayland window decorations

### Changed

- **Electron** `30.0.8` → `39.1.0` (Chromium 130+)
- **TypeScript** `4.9.4` → `5.7.3`
- **Rollup** `3.29.5` → `4.52.5`
- **electron-builder** `24.13.3` → `26.0.12`
- **chokidar** `3.5.3` → `4.0.3`
- **ESLint** `8.33.0` → `9.39.1`
- **Prettier** `2.8.3` → `3.6.2`
- All `@rollup/*` plugins, `@types/*` definitions, svelte-check, svelte-preprocess updated
- TypeScript module resolution → `bundler`, target → `ES2022`, added `esModuleInterop`, `resolveJsonModule`, `isolatedModules`, `skipLibCheck`
- **App.ts** — New `applyDefaultOptimizations()` for automatic GPU/Wayland configuration
- **Args.ts** — Enhanced CLI arg handling (`--new-file=TYPE`, better help output)

### Fixed

- **Wayland Input Lag** — Native Wayland eliminates XWayland translation layer
- **Fractional Scaling Blur** — Proper Wayland scaling fixes blur at 125%/150%
- **Trackpad Gestures** — Pinch-to-zoom now zooms canvas, not browser UI
- **GPU Blocklist** — Aggressive flags override conservative Chromium defaults
- **Protocol Handler** — `figma://` URLs now properly open in desktop app
- **Multi-Monitor DPI** — Correct window positioning on mixed DPI setups
- **Font Loading** — Improved font detection and loading performance

---

## [0.11.4] — Previous Release

See original repository history for changes prior to the v0.12.0 rebuild.
