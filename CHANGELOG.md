# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
