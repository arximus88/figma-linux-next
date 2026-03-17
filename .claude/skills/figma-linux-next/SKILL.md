---
name: figma-linux-next
description: |
  Developer reference skill for the figma-linux-next project — an Electron-based unofficial Figma desktop client for Linux.
  Use this skill whenever working on ANY task in this repository: adding features, fixing bugs, tracing IPC flows, modifying tabs/windows, touching the renderer, working with extensions, or debugging Electron-specific behavior. Load this skill at the start of every figma-linux-next coding session — it saves significant re-reading of architecture files.
---

# figma-linux-next Developer Reference

## Process Architecture

Two Electron processes communicate via IPC:

```
Main Process (src/main/)          Renderer Process (src/renderer/)
─────────────────────────         ────────────────────────────────
App.ts          ←──IPC──→         Panel/   (Svelte toolbar + tabs UI)
WindowManager                     Settings/ (Svelte settings modal)
TabManager                        DesktopAPI/ (Figma web app bridge)
ExtensionManager
Storage (singleton)
```

Build: **Vite + vite-plugin-electron** → `dist/main/main.js` + `dist/renderer/`.

---

## Main Process: Window & Tab Model

**WindowManager** (`src/main/Ui/WindowManager.ts`): owns a `Map<windowId, Window>`, tracks last-focused window, handles `figma://` protocol URLs and "reopen closed tab" history.

**TabManager** (`src/main/Ui/TabManager.ts`): per-window, owns three tab kinds — each is a `WebContentsView` (BrowserView successor) positioned below the panel:

| Type | Notes |
|---|---|
| `MainTab` | Always present — the home/files page |
| `Tab` | Regular Figma file/design tab |
| `CommunityTab` | Community browser (Extensions, Apps, etc.) |

Only one tab is visible at a time. `setTabFocus()` swaps visibility.

### TabManager.getById() footgun
`getById(id)` returns `mainTab` as fallback when the ID is not found — it never returns `undefined`. **Always guard** with `tabManager.getAll().has(id)` before calling `getById` for a dynamic ID, or you'll silently operate on `mainTab`.

### Warm tab / double-close (intentional)
Clicking Home Tab sends both `setFocusToMainTab` IPC and `closeTab(newFileTabId)`. `setFocusToMainTab()` also calls `closeNewFileTab()` internally. The second call is safe because `closeTab()` guards with `tabManager.getAll().has(id)`.

---

## CommunityTab: window.open routing

`setWindowOpenHandler` only intercepts `window.open()` from the **main frame**. Cross-origin iframes (which Figma uses for the Apps/Extensions section) bypass it — they go directly to `did-create-window`.

Pattern for both handlers:
```typescript
// setWindowOpenHandler — main frame popups
private windowOpenHandler(details: HandlerDetails) {
  const url = details.url;
  if (isPrototypeUrl(url) || isValidProjectLink(url) || isValidFigjamLink(url)) {
    app.emit("openUrlFromCommunity", url);
  } else {
    shell.openExternal(url);
  }
  return { action: "deny" };
}

// did-create-window — cross-origin iframe popups (safety net)
private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
  window.close(); // always close the raw window
  const url = details.url;
  if (isPrototypeUrl(url) || isValidProjectLink(url) || isValidFigjamLink(url)) {
    app.emit("openUrlFromCommunity", url);
  } else {
    shell.openExternal(url);
  }
}
```

`Tab` and `MainTab` follow the same dual-handler pattern.

---

## DesktopAPI: Figma web app bridge

`src/renderer/DesktopAPI/webBinding.ts` establishes a **MessageChannel** between Figma's web app and the desktop layer. Figma sends fire-and-forget messages to `window.__figmaDesktop`.

Routing: `msg.name` is looked up in the `publicAPI` object. Unknown messages log `[desktop] Unhandled message <name>`.

**To silence an unhandled message without implementing it**, add a no-op stub:
```typescript
// in publicAPI object:
someNewMessage(args: any) {
  if (import.meta.env.DEV) console.debug("[stub] someNewMessage", args);
},
```

This is NOT IPC — messages come through the MessageChannel, not `ipcRenderer`. For things that need main-process handling, the stub calls `sendMsgToMain("channelName", args)`.

---

## IPC Conventions

| Pattern | Use when |
|---|---|
| `ipcMain.handle()` + `ipcRenderer.invoke()` | Request/response (async, needs return value) |
| `ipcMain.on()` + `ipcRenderer.send()` | Fire-and-forget event |

Renderer-side listeners live in `ipc.ts` files alongside each Svelte app (e.g., `src/renderer/Panel/ipc.ts`).

Controllers in `src/main/controllers/` register handlers via `ipcRegistry` (thin wrapper around `ipcMain`) — prefer this over direct `ipcMain.on/handle` in new code.

---

## Storage

**`src/main/Storage.ts`** — singleton, persists to `~/.config/figma-linux/settings.json`.

- Deep-merges saved settings with `defaultSettings` on load
- Works in both main and renderer processes
- Renderer reads via `ipcRenderer.invoke('getSettings')` → async, registered as `ipcRegistry.handle('getSettings', ...)`
- Top-level keys: `clientId`, `userId`, `app`, `ui`

When adding a setting:
1. `src/utils/Render/defaultSettings.ts` — add with default value
2. `src/types/` — update the TypeScript interface

---

## Path Aliases (tsconfig)

```typescript
import { logger }       from "Main/Logger";        // src/main/*
import { storage }      from "Main/Storage";
import { isDev }        from "Utils/Common";        // src/utils/*
import { TabManager }   from "Main/Ui/TabManager";
// Also: Types/*, Common/*, Components/*, Store/*, Const
```

Use aliases instead of relative paths in all new code.

---

## Two package.json files — keep in sync

| File | Purpose |
|---|---|
| `package.json` | Dev manifest (dev deps + runtime deps) |
| `src/package.json` | **Production manifest** — copied to `dist/`, then `bun install --production` runs inside |

When bumping a **runtime** dependency version in `package.json`, update `src/package.json` too. Dev-only deps (vite, eslint, etc.) only go in the root `package.json`.

---

## Extension System

Extensions hot-reload from `~/.config/figma-linux/Extensions/` via Chokidar. Each extension needs a `manifest.json`. Registered in `settings.savedExtensions`. No restart required during development.

---

## Styling

Panel and Settings UI use static CSS custom properties defined in `src/renderer/theme.css`, imported by both renderers. These are hardcoded design tokens — there is no dynamic theme system. Native Figma dark/light mode is controlled via `settings.app.figmaTheme` and passed to Figma's web app.

---

## GPU / Wayland / Chromium flags

All Chromium command-line switches applied in `App.applySwitches()` (`src/main/App.ts`). Custom switches live in `settings.app.commandSwitches`. `contextIsolation: false` is required in all `WebContentsView` instances for Figma web app compatibility.

---

## Key Commands

```bash
bun run dev    # build main + hot-reload renderer
bun run lp     # lint + prettier (run before committing)
bun run check  # Svelte type checking
# For builds/packaging/releases → use the figma-linux-next-build skill
```

---

## Critical Files Quick Reference

| File | What it does |
|---|---|
| `src/main/App.ts` | Lifecycle orchestration, IPC handlers, Chromium switches |
| `src/main/Ui/WindowManager.ts` | Window lifecycle, protocol URL handling |
| `src/main/Ui/TabManager.ts` | Tab CRUD, visibility, getById() footgun |
| `src/main/Ui/CommunityTab.ts` | Community browser, window.open routing |
| `src/main/Storage.ts` | Settings persistence + sync IPC bridge |
| `src/renderer/DesktopAPI/webBinding.ts` | Figma web ↔ desktop message bridge, publicAPI stubs |
| `src/renderer/Panel/ipc.ts` | Panel IPC listener registrations |
| `src/utils/Render/defaultSettings.ts` | All setting defaults + structure |
| `src/utils/Common/` | Shared URL predicates (`isFigmaUrl`, `isPrototypeUrl`, etc.) |
| `config/builder.json` | electron-builder targets (deb, rpm, pacman, AppImage) |
