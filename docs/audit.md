# Engineering Audit: figma-linux-next (2026 Edition)

## 1. Executive Summary
The project is a high-performance Figma client for Linux. While it utilizes modern versions of Electron (v39) and Svelte (v5), the architecture is currently "Legacy-Hybrid." It suffers from synchronous IPC calls, Svelte 4 syntax in a Svelte 5 runtime, and a fragmented main process.

## 2. Technical Debt & Critical Issues

### A. Electron & IPC (High Risk)
- **Direct `ipcRenderer` Access:** Components import `electron` directly. This violates `contextIsolation` and security best practices.
- **Synchronous Calls:** `ipcRenderer.sendSync('getSettings')` is used in the UI thread. This causes micro-stutters during startup and re-renders.
- **Fragmentation:** No centralized IPC registry. Event handlers are bound manually in `App.ts`.

### B. Svelte 5 Implementation (Medium Risk)
- **Runes Missing:** ZERO use of `$state`, `$derived`, or `$effect`. The app relies on Svelte 4 stores and legacy reactivity, which is less efficient in Svelte 5.
- **Build Tooling:** Rollup is significantly slower than Vite for modern Svelte development. The current plugin chain is brittle.

### C. Native Linux Integration
- **Hardcoded Themes:** Manual pallet calculation (`getColorPallet`) instead of subscribing to system-wide dark mode/accent changes via DBus or xdg-portal.
- **CSD vs SSD:** The "Gnome" style is a custom CSS implementation rather than true GTK-headerbar integration.

---

## 3. Targeted Refactoring Strategy (Agent Tasks)

### Phase 1: Controller-Based IPC (LobeChat Pattern)
- [ ] **Task 1.1:** Implement `ControllerModule` and `IpcRegistry` in `src/main/controllers/`.
- [ ] **Task 1.2:** Migrate all logic from `App.ts` and `WindowManager.ts` into specialized Controllers (e.g., `SettingsController`, `WindowController`).
- [ ] **Task 1.3:** Create a robust Preload Script (`src/main/preload/bridge.ts`) that exposes a typed `window.figmaApi`.

### Phase 2: Svelte 5 "Rune-ification"
- [ ] **Task 2.1:** Convert `src/renderer/Common/Store/` from Svelte Stores to Rune-based universal states (`.svelte.ts`).
- [ ] **Task 2.2:** Refactor `App.svelte` and major components to use `$state` and `$effect`.
- [ ] **Task 2.3:** (Optional but Recommended) Migrate from Rollup to **Vite** for the renderer build.

### Phase 3: Performance & System Integration
- [ ] **Task 3.1:** Eliminate all `sendSync` calls. Implement an asynchronous "bootstrap" data load.
- [ ] **Task 3.2:** Implement native Linux accent color detection using `libadwaita` patterns (even in CSS).
- [ ] **Task 3.3:** Optimize Figma Canvas rendering by fine-tuning the `ozone-platform-hint` and GPU memory buffers dynamically.

---

## 4. Verification Benchmarks
1.  **Boot Time:** Cold start to Figma Canvas < 2s.
2.  **Security:** `contextIsolation: true` and `nodeIntegration: false` must be enabled without breaking features.
3.  **Reactivity:** Zero `.subscribe()` calls in Svelte components.
4.  **IPC:** 100% of communication must go through the typed `bridge.ts`.
