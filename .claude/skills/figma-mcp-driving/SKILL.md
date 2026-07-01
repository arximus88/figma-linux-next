---
name: figma-mcp-driving
description: |
  Orchestrate the TWO MCP servers of the running figma-linux-next app together — chrome-figma (Chrome
  DevTools Protocol) as the control plane that drives the app window, and the built-in Figma MCP (HTTP on
  127.0.0.1:<serverPort>, default 3845) as the data plane that reads/writes design context. Use this skill
  whenever a task means operating the LIVE app: navigating or switching Figma tabs/files, opening a Figma
  URL, reading the scene graph / variables / a screenshot of the real window, creating or editing nodes,
  visually verifying a design change, or running anything across multiple open Figma tabs. Trigger it even
  when the user doesn't name the MCPs — any "drive Figma", "look at the open file", "switch to that file
  and…", "verify it rendered", or "do X to every tab" request in this app belongs here. It explains which
  MCP does what, how they share the active tab, the enable/restart preconditions, and the reliable handoff
  pattern between them.
---

# Driving figma-linux-next with two MCPs

The app exposes two MCP surfaces that are strongest **together**. They are different planes, not
alternatives:

| | **chrome-figma** (CDP) | **Figma MCP** (HTTP :3845) |
|---|---|---|
| Plane | **Control** — drives the app window | **Data** — design semantics |
| Transport | `mcp__chrome-figma__*` (Chrome DevTools Protocol) | HTTP JSON-RPC / any MCP client |
| Good at | navigate a page, click UI, type, scroll, screenshot the **real** window, run raw JS | read scene graph, metadata, variables, Code Connect; **mutate** nodes; semantic screenshots |
| Operates on | any CDP page/target in the app | the app's **active tab** |

**Why they compose:** the Figma MCP resolves the last-focused window + active tab on *every* call
(`viewProvider` in `src/main/App.ts`). So whatever the active tab is showing at call time is what the
Figma MCP reads and writes. Change the active tab's content and the Figma MCP follows — no wiring. That
is the whole synergy: **navigate with chrome-figma, read/write with the Figma MCP.**

## Preconditions (check first)

Both must be enabled, and they enable differently — this trips people up:

- **Figma MCP** — on by default. Master toggle: Settings → *MCP integrations* → **Enable Figma MCP**.
  Applies live (start/stop the local server on save). Confirm it's reachable:
  `curl -s -X POST http://127.0.0.1:3845/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}'`
  (a 200 with `serverInfo` means it's up). The port is **configurable** (settings `mcp.serverPort`); read
  it from the *Server port* field, don't assume 3845.
- **chrome-figma** — needs Settings → *MCP integrations* → **Enable Chrome DevTools (CDP)** *and an app
  restart* (`--remote-debugging-port` is a launch flag). Until then port 9222 is closed and every
  `mcp__chrome-figma__*` call fails. A client showing "connected" only means the npx stdio process
  started — **not** that the port is open. Verify with `curl -s http://127.0.0.1:9222/json/version`.

If CDP is off, say so and ask the user to enable it + restart before attempting control-plane steps.
Data-plane-only tasks (pure read/write of the current file) need only the Figma MCP.

## The reliable handoff

The Figma MCP follows the app's **active (focused) tab** — the field `TabManager.lastFocusedTab`, which
is changed **only** by the app's own tab-focus paths. `chrome-figma select_page` / `bringToFront` /
`navigate_page` pick which **CDP target** chrome-figma's own commands act on; none of them touches
`lastFocusedTab`, so **they do NOT retarget the Figma MCP** (verified live: `select_page`+`bringToFront`
to a background file → `get_file_info` still returned the old active tab). To retarget the Figma MCP,
drive the app's real focus path, then confirm:

1. **Act** (control): change the app's *active tab* — the reliable ways are:
   - **Click the panel tab.** In the panel page (the `dist/index.html` CDP target), each tab is a
     `.g-tab-wrapper` with a `data-tab-id` attribute; clicking it sends the `setTabFocus` IPC.
   - **Send the IPC directly** from the panel: `window.figmaApi.send('setTabFocus', <data-tab-id>)`
     (proven: switched the active tab and woke the Plugin API in ~1s).
   - **Open a URL** via the app's open-file flow (`figma://…` / `figma.com/…`) — this creates a **new,
     focused tab**, not a navigate-in-place.
   - **Navigate the tab that is *already* the active one** in place also works.
2. **Confirm** (data): call Figma MCP `get_file_info` and check `fileName` / `currentPage` match what you
   expect **before** doing real work. This one cheap call prevents operating on the wrong file after a
   race or a switch that didn't land.
3. **Operate** (data): now run the read/write tools.

Skipping step 2 is the most common failure — a switch is async and CDP-level navigation of a *background*
tab never retargets the MCP at all, so it will happily read whatever tab is genuinely active.

## Recipes

**Navigate-then-inspect** — open/focus a specific file, then read it.
Switch the app's active tab (click the panel `.g-tab-wrapper`, or `window.figmaApi.send('setTabFocus',
<data-tab-id>)`) → Figma MCP `get_file_info` to confirm → `get_metadata` / `get_design_context` /
`figma_find`. Do **not** rely on `select_page`/`bringToFront` to switch what the MCP reads — they don't.

**Batch-across-tabs** — do the same read on every open file.
`chrome-figma list_pages` to enumerate targets → map each Figma file target to its panel `data-tab-id` →
for each: **`setTabFocus` that tab** (panel click / IPC), confirm with `get_file_info`, then run the read
(e.g. `create_design_system_rules`, `get_variable_defs`) → collect. Log which tab you're on each
iteration so a mis-focus is visible, not silent.

**Visual-verify-writes** — prove a mutation actually rendered, not just returned success.
Figma MCP `use_figma` (create/edit) → screenshot → inspect the pixels. Two screenshot options: Figma MCP
`get_screenshot` (exports the node via the Plugin API — best when the node is off-viewport, as new nodes
often are), or chrome-figma `take_screenshot` of the real window (best when you also want chrome/panel
state). The API returning `{success:true}` is not proof the canvas looks right; the screenshot is pixel
truth. (Verified live: a magenta test frame + text showed correct pixels via `get_screenshot`.)

**Open-by-URL** — jump straight to a design.
Open `figma://file/…` or `https://figma.com/…` through the app's open flow → this lands as a **new
focused tab** → confirm with `get_file_info` → operate.

**Debug a stuck read** — if a Figma MCP tool errors with "Figma Plugin API not available" or "No Figma
window open", the #1 cause is that the app's active tab isn't a foregrounded, fully-booted **design**
tab (it's the New-File tab, Recents mid-load, a changelog overlay, or a *background* editor whose Plugin
API is dormant). Fix: `setTabFocus` a real design tab (panel click / IPC) and retry `get_file_info` — the
Plugin API wakes within ~1–2s of the tab becoming the active foreground tab. Use chrome-figma
`take_snapshot`/`take_screenshot` only to *see* the window state when that doesn't resolve it.

## Gotchas

- **Only app tab-focus retargets the MCP.** The Figma MCP reads the app's active tab (`lastFocusedTab`).
  Changing it requires `setTabFocus` (panel click / IPC) or the app open-file flow. chrome-figma
  `select_page` / `bringToFront` / `navigate_page` on a background target do **not** retarget it — that's
  the single most common mistaken assumption. Re-confirm with `get_file_info` after every real switch.
- **Plugin API is dormant on non-active tabs.** `window.figma` (used by every read/write tool) is a lazy
  getter that returns `undefined` until Figma initializes on the tab that is the app's active,
  foreground design editor. A freshly-launched app with restored tabs, or a design tab sitting in the
  background, will fail with "Plugin API not available" — bring a design tab to focus via `setTabFocus`
  and it wakes within ~1–2s. This is state, not a bug.
- **The MainTab (Recents / Home) is a real Figma page** with `window.figma` — MCP tools work there once
  it's the active tab. A "not available" error means the tab is mid-load or on a non-Figma URL (New-File
  tab), not that Home tabs are unsupported.
- **CDP needs a restart.** Toggling CDP or its port does nothing until the app relaunches. The Figma MCP
  server port, by contrast, rebinds live on save.
- **Write tools are gated.** `use_figma`, `figma_text`, `create_new_file` only appear when Settings →
  *Enable write tools* is on; otherwise `tools/list` hides them and calls return "disabled".
- **`get_variable_defs` is selection-sensitive.** With a node selected it runs in selection mode (only
  bound vars); for the whole file, clear the selection first. `search_design_system` is always file-wide.
- **Screenshots differ.** Figma MCP `get_screenshot` exports a node via the Plugin API (design pixels);
  chrome-figma `take_screenshot` captures the actual window (chrome, panels, loading states). Pick by
  what you're verifying.

## Validating that each tool works

`scripts/mcp-smoke.ts` is a live, self-bootstrapping harness: it builds a known scene with the write
tools, reads it back through every read tool, mutates, and cleans up — printing a PASS/FAIL matrix. Use
it to confirm the Figma MCP is healthy end-to-end (needs a Design file open + write tools on):

```
bun scripts/mcp-smoke.ts            # default port
bun scripts/mcp-smoke.ts 4000       # custom serverPort
```

FigJam-only tools (`get_figjam`, `generate_diagram`) show SKIP unless a FigJam file is open.

## Tool quick-reference

**Figma MCP (data) — read:** `get_file_info`, `get_metadata`, `get_design_context`, `figma_find`
(locate nodes by name/type/text), `figma_tree` (compact indented outline), `get_variable_defs`,
`search_design_system`, `get_screenshot`, `get_code_connect_map` / `add_code_connect_map`,
`create_design_system_rules`, `get_figjam`.
**Figma MCP — write (gated):** `use_figma` (create_frame/create_text/create_rectangle/update_node/
delete_node/reparent_node/set_variable), `figma_text` (safe text edit w/ font autoload),
`create_new_file`, `generate_diagram` (FigJam).

**chrome-figma (control):** `list_pages` / `select_page` / `new_page` / `navigate_page`, `click` / `fill`
/ `type_text` / `hover` / `press_key`, `take_screenshot` / `take_snapshot`, `evaluate_script`,
`list_console_messages` / `list_network_requests`, `wait_for`, `resize_page`.

For app architecture (tabs, windows, IPC, the MCP internals) load the **figma-linux-next** skill; for the
MCP server's own code and the enrichment work, see `src/main/MCP/`.
