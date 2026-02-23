# Unhandled Figma Desktop API Messages

Analysis of messages sent by Figma's web frontend to the desktop wrapper via `postMessage` → `webBinding.ts`.
These are logged as `[desktop] Unhandled message <name>` because they have no handler in `publicAPI`.

> **How it works:** Figma's web app calls `window.__figmaDesktop.postMessage(name, args)` which routes through a MessageChannel to `onWebMessage()` in `webBinding.ts`. If `name` is not a key in the `publicAPI` object, it's logged as unhandled.

---

## 🔴 High Priority — Directly Impacts UX

| Message | Args (estimated) | Description | Benefit |
|---|---|---|---|
| **setIsLibrary** | `{ isLibrary: boolean }` | Indicates this file is a shared component library | Show library badge/icon on tab. Distinguish library files from regular design files |
| **setEditorType** | `{ editorType: "design" \| "figjam" \| "slides" }` | Identifies whether file is Design, FigJam, or Slides | Show different icons per tab type. Enables editor-specific menu items and keyboard shortcuts |
| **setTabColor** | `{ color: string }` | The color assigned to this tab by Figma (derived from file cover) | Color-coded tab strips for easy identification |
| **setTabPreviewData** | `{ previewData: string }` | Base64 thumbnail preview of the current file | Show file thumbnails in tab hover tooltips or tab switcher |
| **setLocales** | `{ locales: string[] }` | Available locale/language list from Figma | Persist user locale preference, sync with system locale |

---

## 🟡 Medium Priority — Nice-to-Have Features

| Message | Args (estimated) | Description | Benefit |
|---|---|---|---|
| **setThemePreference** | `{ theme: "light" \| "dark" \| "system" }` | Figma's in-editor theme preference | Sync panel theme with editor theme automatically |
| **setRealtimeToken** | `{ realtimeToken: string, fileKey: string }` | Token for real-time collaboration (multiplayer cursors) | Could enable presence indicators in tab bar (e.g., "3 collaborators") |
| **updateViewport** | `{ viewport: { x, y, zoom } }` | Current canvas viewport position and zoom | Status bar zoom indicator, viewport sync across windows |
| **setEditFilePermissions** | `{ canEdit: boolean, ... }` | User's edit permissions for the file | Show read-only badge on tab, disable edit menu items |
| **updateColorProfile** | `{ colorProfile: string }` | Monitor color profile used for rendering | Display color space info in status bar (useful for designers) |
| **setIsTeamTemplate** | `{ isTeamTemplate: boolean }` | Whether file is a team template | Show template badge on tab |

---

## 🟢 Low Priority — Platform Stubs & Optional

| Message | Args (estimated) | Description | Benefit |
|---|---|---|---|
| **getKeyboardLayout** | `{}` | Requests keyboard layout info (e.g., QWERTY, AZERTY) | Correct shortcut display for non-US layouts. Return `navigator.keyboard.getLayoutMap()` |
| **getActiveNSScreens** | `{}` | macOS NSScreen API — requests active display info | Linux equivalent: return display bounds via `screen.getAllDisplays()` |
| **spellingGetLanguages** | `{}` | Requests available spellcheck languages | Hook into system spellcheck (hunspell/aspell on Linux) |
| **initLivegraph** | `{ ... }` | Initializes the real-time collaboration graph | Would need full Livegraph protocol implementation |

---

## Implementation Guide

### Quick-Win Pattern (for simple forwarding messages)

Add to `publicAPI` in `webBinding.ts`:

```typescript
// Example: setTabColor handler
setTabColor(args: { color: string }) {
  sendMsgToMain("setTabColor", args.color);
},
```

Then handle in the main process (e.g., `WindowManager.ts` or `Window.ts`):

```typescript
ipcRegistry.on("setTabColor", (event, color) => {
  const tab = this.getTabByWebContentsId(event.sender.id);
  if (tab) tab.color = color;
  // Update panel UI
  this.window.webContents.send("updateTabColor", tab.id, color);
}, "WindowManager");
```

### Promise-Based Pattern (for request/response messages)

```typescript
// Example: getKeyboardLayout handler
async getKeyboardLayout() {
  return { data: "us" }; // stub for now
},
```

---

## Currently Handled Messages (for reference)

These are already implemented in `publicAPI`:

| Message | Status |
|---|---|
| setTitle | ✅ |
| setUser | ✅ |
| setUsingMicrophone | ✅ |
| setIsInVoiceCall | ✅ |
| newFile | ✅ |
| openFile | ✅ |
| openCommunity | ✅ |
| openPrototype | ✅ |
| createFile | ✅ |
| close | ✅ |
| setLoading | ✅ |
| setSaved | ✅ |
| updateFullscreenMenuState | ✅ |
| showFileBrowser | ✅ |
| setIsPreloaded | ✅ |
| setInitialOptions | ✅ |
| setFeatureFlags | ✅ |
| startAppAuth / finishAppAuth | ✅ |
| openDevTools | ✅ |
| setAuthedUsers | ✅ |
| setWorkspaceName | ✅ |
| setFigjamEnabled | ✅ |
| getZoomFactor | ✅ |
| getFonts / getFontFile | ✅ |
| getClipboardData / setClipboardData | ✅ |
| writeFiles | ✅ |
| Extension APIs (6 methods) | ✅ |
| isDevToolsOpened | ✅ |
| requestMicrophonePermission | ✅ |
| addTabAnalyticsMetadata | ⚠️ stub |
| setMediaEnabled | ⚠️ stub |

---

## Commented-Out (Partially Implemented)

Found in `webBinding.ts` as commented TODO blocks:

```typescript
// setEditorType(args) — sends "updateEditorType" to main
// setRealtimeToken(args) — sends token + fileKey to main
// setTheme(args) — sends theme preference to main
```

These can be uncommented and wired up as a starting point.
