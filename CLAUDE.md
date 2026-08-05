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

# Run built production version
bun run start

# Run in watch mode (restarts on file changes)
bun run run:watch
```

### Build System

The project uses **Vite** with `vite-plugin-electron`:
- `vite.config.ts` - Unified build config for main + renderer processes

Build outputs to `dist/`:
- `dist/main/main.js` - Main process entry point
- `dist/renderer/` - UI bundles (Panel + Settings)

### Packaging

```bash
# Package for all configured formats (deb, rpm, pacman, AppImage, zip)
bun run package

# Build and create installers (includes AppImageTool dependency)
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

# Pre-commit hook (runs Biome on staged files via lint-staged)
bun run precommit
```

Linting/formatting: **Biome** (`biome.json`) for all `.ts` (src + tests) — formatter matches the
former Prettier (100 cols, double quotes, semicolons, trailing-all); `noExplicitAny` and
`noNonNullAssertion` are disabled to match project conventions; `*.d.ts` has a small rule carve-out.
`.svelte` files are not linted/formatted — only `svelte-check` (Biome doesn't parse Svelte 5 runes
yet). ESLint and Prettier were removed in favor of Biome.

### Testing

```bash
# Unit tests
bun run test:unit

# E2E tests (Playwright)
bun run test:e2e
```

Unit tests live next to source files (`*.test.ts`). E2E tests are in `tests/e2e/`.

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

**Renderer Process** (`src/renderer/`) - Browser frontend with two Svelte apps:
- **Panel** (`src/renderer/Panel/`) - Top toolbar UI with tabs
- **Settings** (`src/renderer/Settings/`) - Settings modal

Communication between processes goes through a typed **preload bridge** (`src/main/preload/bridge.ts`) that exposes `window.figmaApi` — direct `ipcRenderer` usage in renderers is not allowed.

### Main Process Structure

Entry point: `src/main/index.ts` initializes storage and dialogs, then instantiates App:

```typescript
new App(new WindowManager(), new Session(), new FontManager());
```

`ExtensionManager` is instantiated separately, not passed to App.

**App class** (`src/main/App.ts`):
- Acquires single-instance lock
- Applies Chromium command-line switches (GPU acceleration, Wayland, VAAPI)
- Instantiates all IPC controllers and seals the registry
- Registers `figma://` protocol handler and starts the MCP server
- Manages lifecycle events (ready, second-instance, window-all-closed)

**IpcRegistry** (`src/main/controllers/registry.ts`):
- Central registry for all IPC handlers — replaces direct `ipcMain` calls
- `ipcRegistry.on(channel, handler, source)` / `ipcRegistry.handle(channel, handler, source)`
- `ipcRegistry.seal()` called after all controllers register — throws on duplicate or post-seal registration
- **Always use `ipcRegistry` instead of `ipcMain` directly** for new IPC handlers

**Controllers** (`src/main/controllers/`):
- `SettingsController` — settings get/set, frame style, scaling, export dir
- `FontController` — font enumeration and file serving
- `ClipboardController` — clipboard writes (images, SVG, PDF)
- `AuthController` — login, logout, app auth flow
- `FileController` — file creation and export

**WindowManager** (`src/main/Ui/WindowManager.ts`):
- Maintains Map of all Window instances (keyed by window ID)
- Tracks last focused window
- Restores/saves window state from settings
- Handles protocol URLs (`figma://` links)
- Manages closed tabs history

**Window** (`src/main/Ui/Window.ts`):
- Wraps a `BrowserWindow` with a `TabManager` and a `SettingsView`
- Maintains a **warm tab**: a pre-loaded new-file `Tab` kept in the background for instant opening (TTL: 5 minutes). Pre-warming happens after a file tab is opened.

**TabManager** (`src/main/Ui/TabManager.ts`):
- Per-window tab management
- Three tab types: `MainTab` (always present), regular `Tab`s, `CommunityTab`
- Each tab is a `WebContentsView` positioned below the panel
- Only one tab visible at a time

**ExtensionManager** (`src/main/ExtensionManager.ts`):
- Scans `~/.config/figma-linux-next/Extensions/` directory
- File watching with Chokidar for hot-reloading during development
- Observer pattern for manifest and code file changes
- Extensions loaded from `savedExtensions` in settings

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

**AppImageIntegration** (`src/main/AppImageIntegration.ts`):
- On first AppImage launch, writes a `.desktop` file and calls `xdg-mime` to register the `figma://` URL scheme handler

### Renderer Process Structure

**Preload Bridge** (`src/main/preload/bridge.ts`):
- Exposes `window.figmaApi` via `contextBridge` — the only IPC surface for Panel and Settings
- Three typed methods: `send(channel, ...args)`, `invoke(channel, ...args)`, `on(channel, listener)`
- `SEND_CHANNELS`, `RECEIVE_CHANNELS`, `INVOKE_CHANNELS` act as an allowlist — see the file for the current list
- **Adding a new IPC channel requires updating all three of: the allowlist in bridge.ts, the ipcRegistry in the relevant controller, and the renderer call site**

**Panel** (`src/renderer/Panel/App.svelte`):
- Top toolbar with frame-specific Left/Tabs/Right components
- IPC listeners registered in `src/renderer/Panel/ipc.svelte.ts`
- Svelte stores in `src/renderer/Panel/store/`: `currentTab`, `tabs`, `panelZoom`

**Settings** (`src/renderer/Settings/`):
- Modal dialog for app settings
- Settings saved via `window.figmaApi.send("closeSettingsView", settings)`

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
import { defaultSettings } from "Utils/Render/defaultSettings";
```

Aliases:
- `Main/*` → `src/main/*`
- `Utils/*` → `src/utils/*`
- `Common/*` → `src/renderer/Common/*`
- `Components/*` → `src/renderer/components/*`
- `Store/*` → `src/renderer/stores/*`
- `Types/*` → `src/types/*`
- `Const` → `src/constants`

When adding new code, use these aliases instead of relative paths.

### Settings Structure

Persisted at `~/.config/figma-linux-next/settings.json`. Authoritative source: `src/utils/Render/defaultSettings.ts` and `src/types/` interfaces.

## Extension System

Extensions are plugins loaded from `~/.config/figma-linux-next/Extensions/`.

**Structure**:
- `manifest.json` - Extension metadata
- UI/Code/Resource files (`.ts`, `.js`, `.css`, `.html`)

**Development**:
- Drop extension folder into Extensions directory
- ExtensionManager watches files with Chokidar
- Hot-reloading on code changes
- No app restart needed

Extensions registered in `settings.json` under `savedExtensions`.

## Platform-Specific Features

### GPU Acceleration & Wayland

The App class applies extensive Chromium flags in `applySwitches()`:
- GPU acceleration flags (critical for Figma's WebGL canvas)
- Wayland support detection and enablement
- Hardware video decoding (VAAPI)
- Color space management (sRGB option)

Custom switches can be added in settings under `app.commandSwitches`.

### Window Frame Styles

Three frame styles configurable in settings (`app.frameStyle`):
- `windows` - Windows-style frame
- `gnome` - GNOME-style frame
- `macos` - macOS-style frame

## Logging

**Logger** (`src/main/Logger/AppLogger.ts`):
- Multi-sink architecture: console + file
- File logs: `~/.config/figma-linux-next/logs/app.log`
- Configurable log level in settings

## Critical Files Reference

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build config (main + renderer) |
| `src/main/index.ts` | App entry point; initializes storage, dialogs, dependencies |
| `src/main/App.ts` | Lifecycle orchestration, Chromium switches, controller wiring |
| `src/main/controllers/registry.ts` | IPC channel registry (seal-on-startup pattern) |
| `src/main/controllers/` | IPC controllers: Settings, Auth, Font, Clipboard, File |
| `src/main/preload/bridge.ts` | contextBridge → `window.figmaApi`; IPC channel allowlists |
| `src/main/Storage.ts` | Settings persistence |
| `src/main/Ui/WindowManager.ts` | Window lifecycle & routing |
| `src/main/Ui/Window.ts` | Single window: BrowserWindow + TabManager + warm tab |
| `src/main/Ui/TabManager.ts` | Tab management per window |
| `src/main/Dialogs/index.ts` | Dialog provider (Native / Zenity) |
| `src/main/MCP/McpServer.ts` | MCP protocol server (port 3845) |
| `src/main/AppImageIntegration.ts` | AppImage figma:// URL handler registration |
| `src/main/ExtensionManager.ts` | Plugin system with hot-reloading |
| `src/renderer/Panel/App.svelte` | Main toolbar UI |
| `src/renderer/Panel/ipc.svelte.ts` | Panel IPC listener registrations |
| `src/renderer/DesktopAPI/webBinding.ts` | Figma web ↔ desktop MessageChannel bridge |
| `src/utils/Render/defaultSettings.ts` | Default settings — authoritative settings schema |
| `src/utils/Render/frameConfig.ts` | Frame style icon/component config |
| `src/utils/Render/frameStyles.ts` | Frame style CSS variables |
| `config/builder.json` | electron-builder package config |
| `src/package.json` | Production manifest copied to `dist/` during build — **must stay in sync with `package.json` dependencies** |

## Important Gotchas

### Electron is pinned to 42.0.1 — do NOT bump without manual OAuth test
`package.json` lists `"electron": "42.0.1"` with no caret. Electron 42.3.0 (Chromium 148.0.7778.180) shipped a Chromium roll (PR #51600, 1293 commits) that includes a `request_header_integrity` change in Google's closed-source signed-integrity-headers component. Figma's server validates those headers and silently rejects `/app_auth/redeem` from the new Chromium — the response is the login HTML instead of `Set-Cookie`, breaking first-login and add-account flows. AUR releases ship with bundled 42.0.1 and work fine. Before any Electron bump, manually run `bun run start` and verify both first-login (clean storage) and add-account end-to-end. If either breaks, the bump is not safe.

### Two package.json files — keep dependencies in sync
`package.json` is the dev manifest. `src/package.json` is a separate production manifest that gets copied to `dist/` during `bun run build`, then `bun install --production` runs inside `dist/`. **When updating a runtime dependency version in `package.json`, update `src/package.json` too**, otherwise the installed package in production builds will be the old version.

### TabManager.getById() fallback
`TabManager.getById(id)` falls back to returning `mainTab` when the ID is not found (instead of `undefined`). This is a known footgun — calling `closeTab()` or `removeChildView()` on the result of an unknown ID will silently operate on `mainTab`. Always guard with `tabManager.getAll().has(id)` before calling `getById` for dynamic IDs.

### Figma web app → desktop IPC (webBinding.ts)
Figma sends fire-and-forget messages to `window.__figmaDesktop` via the message channel. Unhandled messages log `[desktop] Unhandled message <name>` warnings. To silence a message without implementing it, add a no-op stub in the `publicAPI` object in `src/renderer/DesktopAPI/webBinding.ts`. DEV-mode `console.debug` is acceptable for stubs to aid future implementation.

### Warm tab and double-close
When the user clicks Home Tab, the renderer sends both `setFocusToMainTab` IPC **and** `closeTab(newFileTabId)`. The main process `setFocusToMainTab()` also calls `closeNewFileTab()` internally. This double-close is intentional — the guard in `closeTab()` (`tabManager.getAll().has(id)`) prevents the second call from accidentally removing `mainTab`.

### openFile must close the New File tab
`Window.openFile()` must call `closeNewFileTab()` after opening the file tab. Without this, the New File tab stays visible as a leftover. `createFile()` already does this — keep them consistent.

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
2. `perl scripts/bump_version.pl X.Y.Z` — creates version bump commit + tag **locally** on `staging`
3. `git push origin staging` — push branch only, **do NOT push the tag yet**
4. Open PR: `staging → dev` on GitHub, wait for CI green, merge
5. `git push origin vX.Y.Z` — push tag **after merge** → triggers `release.yml` → GitHub Release + AUR update

⚠️ Never push the tag before the PR is merged — that would release before dev is updated, defeating branch protection.

**`enforce_admins: false`** — owner can bypass protection in emergencies.

### CI/CD automation (`release.yml`)

Tag push (`v*.*.*`) triggers `release.yml` which runs these jobs **in sequence**:

1. **`build-x64`** — builds deb, rpm, AppImage, zip on Ubuntu (electron-builder bundles Electron)
2. **`build-arm64`** — same formats on native ARM runner
3. **`build-pacman`** — builds `.pacman` in Arch container (electron-builder bundles Electron)
4. **`release`** — collects all artifacts, computes SHA256SUMS, creates GitHub Release via `softprops/action-gh-release`
5. **`aur`** — clones `ssh://aur@aur.archlinux.org/figma-linux-next.git`, updates `pkgver` + SHA256 in PKGBUILD, generates `.SRCINFO`, pushes to AUR
6. **`aur-bin`** — same for `figma-linux-next-bin` (hashes the release zip instead of the tarball)
7. **`flake`** — recomputes the release zip hashes as SRI, runs `scripts/update_flake_release.py`, commits the pinned `flake.nix` to `staging`

Secrets required: `ID_RSA` (AUR SSH key, base64-encoded), `USER_NAME`, `EMAIL`.

**`flake.nix` pins version + hashes together** and is updated by CI, not by `bump_version.pl` — the hashes don't exist until the release binaries are built. The commit lands on `staging` (`dev` is protected), so the flake in `dev` trails by one release. Never bump the version in `flake.nix` by hand: it would name a release whose hashes it doesn't have, and every `nix build` would fail on a hash mismatch.

Other workflows:
- `ci.yml` — runs on PRs to `dev`
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
   - Update `defaultSettings.ts`
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
   - ExtensionManager scans Extensions directory
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

For local development, create `.env`:

```env
NODE_ENV=dev
DEV_PANEL_PORT=3330
DEV_SETTINGS_PORT=3331
```
