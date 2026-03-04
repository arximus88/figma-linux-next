# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

figma-linux-next is a fork of the unofficial Electron-based Figma desktop app for Linux. It provides native Wayland support, GPU acceleration, system integration, themes, extensions, and advanced window management.

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
# Run linting and formatting
bun run lp

# ESLint (uses config/eslintrc.js)
bun run lint

# Prettier formatting
bun run prettier

# Svelte type checking
bun run check

# Pre-commit hook (runs linting/formatting on staged files)
bun run precommit
```

ESLint rules: Uses TypeScript ESLint with Prettier integration, 120 char line limit

## Architecture

### Process Architecture

The application is a classic Electron app with two processes:

**Main Process** (`src/main/`) - Node.js backend that manages:
- Windows and tabs (WindowManager, TabManager)
- Extensions/plugins (ExtensionManager)
- Themes (ThemeManager)
- Figma session authentication (Session)
- System fonts (FontManager)
- Persistent settings (Storage)

**Renderer Process** (`src/renderer/`) - Browser frontend with two Svelte apps:
- **Panel** (`src/renderer/Panel/`) - Top toolbar UI with tabs
- **Settings** (`src/renderer/Settings/`) - Settings modal

Communication between processes uses Electron IPC (ipcMain/ipcRenderer).

### Main Process Structure

Entry point: `src/main/index.ts` instantiates the App class with dependency injection:

```typescript
new App(
  new WindowManager(),
  new ExtensionManager(),
  new Session(),
  new FontManager(),
  new ThemeManager(new ThemeValidator()),
);
```

**App class** (`src/main/App.ts`):
- Orchestrates lifecycle events (ready, second-instance, window-all-closed)
- Applies Chromium command-line switches (GPU acceleration, Wayland, VAAPI)
- Registers IPC handlers for renderer communication
- Manages single-instance locking

**WindowManager** (`src/main/Ui/WindowManager.ts`):
- Maintains Map of all windows (keyed by window ID)
- Tracks last focused window
- Restores/saves window state from settings
- Handles protocol URLs (`figma://` links)
- Manages closed tabs history (last 10 for "reopen closed tab")

**TabManager** (`src/main/Ui/TabManager.ts`):
- Per-window tab management
- Three tab types: MainTab (always present), regular tabs, CommunityTab
- Each tab is a BrowserView positioned below the panel
- Only one tab visible at a time

**ExtensionManager** (`src/main/ExtensionManager.ts`):
- Scans `~/.config/figma-linux/Extensions/` directory
- File watching with Chokidar for hot-reloading during development
- Observer pattern for manifest and code file changes
- Extensions loaded from `savedExtensions` in settings

**ThemeManager** (`src/main/Ui/ThemeManager/index.ts`):
- Loads themes from `~/.config/figma-linux/Themes/`
- Two theme types: community themes (downloaded) and creator themes (user-created)
- ThemeValidator validates theme structure
- Themes applied via CSS custom properties injected into Figma

**Storage** (`src/main/Storage.ts`):
- Singleton for settings persistence to `~/.config/figma-linux/settings.json`
- Dual-initialization: works in both main and renderer processes
- IPC synchronous getter for renderer: `ipcMain.on('getSettings')`
- Deep-merges defaults with saved settings

### Renderer Process Structure

**Panel** (`src/renderer/Panel/App.svelte`):
- Top toolbar with left/tabs/right components
- Svelte stores in `src/renderer/Panel/store`:
  - `currentTab` - Active tab ID
  - `tabs` - Collection of open tabs
  - `panelZoom` - Panel scale factor
- IPC listeners in `src/renderer/Panel/ipc.ts` for main process events

**Settings** (`src/renderer/Settings/`):
- Modal dialog for app settings
- Theme selection and Theme Creator UI
- Settings saved via IPC to main process, which persists to disk

**DesktopAPI** (`src/renderer/DesktopAPI/`):
- `webBinding.ts` - Establishes two-way message channel with Figma web app
- `ThemesApplier.ts` - Injects theme CSS into Figma's stylesheet
- Exposes `window.__figmaDesktop` API to Figma

### IPC Communication

**Main → Renderer** (using `ipcRenderer.on()`):
- `loadCurrentTheme` - Apply theme
- `didTabAdd` / `tabWasClosed` - Tab lifecycle events
- `frameStyleChanged` - Window frame style updates
- `syncThemesEnd` - Theme list updated

**Renderer → Main**:

Async handlers (`ipcMain.handle()`):
- `getFonts` - Get system fonts
- `getFontFile` - Get font file for rendering
- `themesIsDisabled` - Check theme status

Event handlers (`ipcMain.on()`):
- `frontReady` - Renderer ready
- `setClipboardData` - Write to clipboard (images, SVG, PDF)
- `setFeatureFlags` - Toggle feature flags
- `getSettings` - Synchronous settings getter
- `relaunchApp` / `quitApp` - App control

### Path Aliases (tsconfig.json)

The project uses TypeScript path aliases for cleaner imports:

```typescript
import { logger } from "Main/Logger";
import { ThemesApplier } from "DesktopAPI/ThemesApplier";
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

Settings are stored in `~/.config/figma-linux/settings.json` with this structure:

```typescript
{
  clientId: UUID,
  userId: string,
  app: {
    logLevel: string,
    panelHeight: number,
    frameStyle: "windows" | "gnome" | "macos",
    fontDirs: string[],
    commandSwitches: { switch: string, value?: string }[],
    windowsState: { [windowId]: WindowState },
    lastOpenedTabs: { [tabId]: TabData },
    savedExtensions: ExtensionData[],
    featureFlags: { [flag]: boolean },
    enableColorSpaceSrgb: boolean,
    saveLastOpenedTabs: boolean
  },
  theme: {
    currentTheme: string  // theme ID
  },
  ui: {
    scalePanel: number,
    scaleFigmaUI: number
  }
}
```

Default settings in `src/utils/Render/defaultSettings.ts`.

## Extension System

Extensions are plugins loaded from `~/.config/figma-linux/Extensions/`.

**Structure**:
- `manifest.json` - Extension metadata
- UI/Code/Resource files (`.ts`, `.js`, `.css`, `.html`)

**Development**:
- Drop extension folder into Extensions directory
- ExtensionManager watches files with Chokidar
- Hot-reloading on code changes
- No app restart needed

Extensions registered in `settings.json` under `savedExtensions`.

## Theme System

**Two theme types**:

1. **Community Themes** (`~/.config/figma-linux/Themes/`)
   - Downloaded from online repository
   - Applied application-wide

2. **Creator Themes** (`~/.config/figma-linux/ThemeCreator/`)
   - User-created in Theme Creator UI
   - Live preview support

**Theme File Structure**:
```typescript
{
  id: string,
  name: string,
  palette: {
    [colorName: string]: hexColor
  }
}
```

Themes applied by injecting CSS custom properties into Figma's stylesheet via `ThemesApplier`.

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
- File logs: `~/.config/figma-linux/logs/app.log`
- Configurable log level in settings

## Critical Files Reference

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build config (main + renderer) |
| `src/main/index.ts` | App entry point, dependency injection |
| `src/main/App.ts` | Main event orchestration, IPC handlers |
| `src/main/Storage.ts` | Settings persistence & IPC bridge |
| `src/main/Ui/WindowManager.ts` | Window lifecycle & routing |
| `src/main/Ui/TabManager.ts` | Tab management per window |
| `src/main/ExtensionManager.ts` | Plugin system with hot-reloading |
| `src/main/Ui/ThemeManager/index.ts` | Theme loading & management |
| `src/renderer/Panel/App.svelte` | Main toolbar UI |
| `src/renderer/Panel/ipc.svelte` | Panel IPC handlers |
| `src/renderer/DesktopAPI/webBinding.ts` | Figma web app bridge |
| `src/renderer/DesktopAPI/ThemesApplier.ts` | Theme injection |
| `src/utils/Render/defaultSettings.ts` | Default settings definition |
| `src/utils/Render/frameConfig.ts` | Frame style icon/component config |
| `src/utils/Render/frameStyles.ts` | Frame style CSS variables |
| `config/builder.json` | electron-builder package config |

## Common Development Tasks

When modifying the codebase:

1. **Adding a new setting**:
   - Update `defaultSettings.ts`
   - Add to TypeScript interface in `src/types/`
   - Update Settings UI if user-configurable

2. **Adding IPC handlers**:
   - Async: Use `ipcMain.handle()` for request/response
   - Event: Use `ipcMain.on()` for fire-and-forget
   - Add renderer listener in appropriate `ipc.ts` file

3. **Working with tabs**:
   - TabManager handles lifecycle
   - Each tab is a BrowserView
   - URL changes propagate to main process for state saving

4. **Modifying themes**:
   - Theme files in Themes directory
   - ThemeValidator validates structure
   - ThemesApplier injects CSS vars into Figma

5. **Working with extensions**:
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
