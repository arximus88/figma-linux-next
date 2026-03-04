# Engineering Audit: figma-linux-next (v0.13.0)

## 1. Executive Summary
The project is a high-performance Figma client for Linux. It uses Electron v39, Svelte 5, and Vite. The architecture has been substantially modernized from the original fork: build tooling migrated from Rollup to Vite, most components use Svelte 5 runes ($state/$derived/$effect), and IPC communication goes through a typed bridge. Remaining debt is concentrated in a few legacy store modules and frame style polish.

## 2. Current State

### ✅ Completed
- **Vite Migration** — Build system moved from Rollup to Vite (`vite.config.ts`)
- **Svelte 5 Runes** — Most components use `$props()`, `$state`, `$derived`, `$effect`
- **Typed Bridge** — Renderer communicates via `window.figmaApi` (preload bridge)
- **Async Bootstrap** — `invoke("getSettings")` replaces `sendSync("getSettings")` in UI
- **Fontkit** — Font handling migrated to fontkit library with Variable Font support
- **Frame Styles** — Config-driven architecture (`frameConfig.ts` + `frameStyles.ts`)

### ⚠️ Remaining Debt

#### A. Svelte 4 Store Remnants (Low Risk)
- `src/renderer/Common/Store/TabView/index.ts` — uses `writable` from `svelte/store`
- `src/renderer/Common/Store/Settings/index.ts` — same pattern
- A few icon components still use `export let` instead of `$props()`

#### B. Frame Style Polish (Medium Risk)
- Gnome and Windows frame styles share some CSS variables with incomplete isolation
- macOS and KDE configs are placeholders (`{...WINDOWS_CONFIG}`)
- Header button padding inconsistencies in Gnome mode

#### C. Build Infrastructure Naming (Medium Risk)
- Docker files, PKGBUILD, snapcraft, .desktop still reference old `figma-linux` name
- Some scripts still use `npm` instead of `bun`

---

## 3. Targeted Refactoring Strategy

### Phase 1: Global Cleaning (Current)
- [x] Migrate Rollup → Vite
- [x] Adopt Svelte 5 runes in main components
- [ ] Convert remaining Svelte 4 stores to rune-based patterns
- [ ] Rename distribution artifacts to `figma-linux-next`
- [ ] Polish Gnome frame style header UI

### Phase 2: Deeper Modernization (Future)
- [ ] Implement `ControllerModule` pattern for IPC
- [ ] Native Linux accent color detection
- [ ] Flatpak/Snap distribution pipeline
- [ ] Offline mode with service worker caching

---

## 4. Verification Benchmarks
1. **Boot Time:** Cold start to Figma Canvas < 2s.
2. **Security:** `contextIsolation: true` and `nodeIntegration: false` enabled.
3. **Reactivity:** Zero `.subscribe()` calls in Svelte components (stores only).
4. **IPC:** All communication through typed `bridge.ts`.
