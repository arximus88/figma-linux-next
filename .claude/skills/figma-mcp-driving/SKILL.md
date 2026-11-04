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
  pattern between them. The built-in MCP mirrors Figma's remote MCP (use_figma with Plugin API code,
  fileKey on every tool, batched search_design_system, download/upload_assets, create_new_file), so
  also use this skill to learn where running in the page differs from Figma's plugin sandbox.
---

# Driving figma-linux-next with two MCPs

The app exposes two MCP surfaces that are strongest **together**. They are different planes, not
alternatives:

| | **chrome-figma** (CDP) | **Figma MCP** (HTTP :3845) |
|---|---|---|
| Plane | **Control** — drives the app window | **Data** — design semantics |
| Transport | `mcp__chrome-figma__*` (Chrome DevTools Protocol) | HTTP JSON-RPC / any MCP client |
| Good at | navigate a page, click UI, type, scroll, screenshot the **real** window, run raw JS | read scene graph, metadata, variables, Code Connect; **mutate** nodes; semantic screenshots |
| Operates on | any CDP page/target in the app | the open tab named by `fileKey`, else the **active tab** |

**`fileKey` first.** Every file tool takes an optional `fileKey` (the id in
`figma.com/design/<fileKey>/…`; a pasted file URL works too). With it the tool runs in the open tab
showing that file, whichever tab is in front — no switching. Without it the tool runs in the last
focused window's active tab (`viewProvider` in `src/main/App.ts`). A `fileKey` for a file that is not
open, or whose tab is only lazily restored, is an error, never a silent fallback to the active tab.

The Figma MCP mirrors **Figma's remote MCP** (claude.ai Figma connector): `use_figma` takes Plugin
API `code`, `get_metadata` without a node lists pages, `search_design_system` takes `queries[]`,
plus `whoami`, `download_assets`, `upload_assets`, `create_new_file`. Figma's own `figma-use` skill
therefore applies to `use_figma` here; the differences of running in the page instead of a plugin
sandbox are listed under Gotchas.

**Where chrome-figma still matters:** clicking UI, typing into Figma's own panels, the real window's
pixels, console/network, and tab focus when a tool must run in the *active* tab.

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

Prefer `fileKey` (above): it removes the handoff entirely. One caveat: Figma installs
`window.figma` in a tab only after that tab has been in front once, so a file opened in the
background may answer "tab is in the background…" until it is shown — then focus it once (below).

Without `fileKey`, the Figma MCP follows the app's **active (focused) tab** — the field `TabManager.lastFocusedTab`, which
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
`whoami` / `get_file_info` with each file's `fileKey` (take the keys from the tab URLs:
`chrome-figma list_pages`, or ask the user) → run the read with that `fileKey` → collect. No tab
switching needed, unless a file answers "in the background" (focus it once, then retry).

**Build with code** — anything the Plugin API can do, in one call.
`use_figma` with `code` (body of an async function, `figma` in scope, top-level `await`,
`return` the ids you created). Example, the instance case from issue #69:
`const set = await figma.importComponentSetByKeyAsync(key); const i = set.defaultVariant.createInstance(); return { createdNodeIds: [i.id] };`
— take `key` from `search_design_system`, which also finds library components the file already uses.
A throwing script is undone; the error says "…were undone; the file is as it was".

**Move images between files** — `download_assets(nodeId)` on the source (its `rawImages` are the
original bytes) → `upload_assets({ fileKey: <target>, nodeIds: [...] })` → `curl -X POST -H
'Content-Type: image/png' --data-binary @img.png <url>` per URL. Each POST answers with the node.

**New file** — `create_new_file({ fileName })` opens it in a new tab, in the drafts of the current
team, and returns its `fileKey` (seconds on a normal machine; it waits up to 3 min for Figma to
save the file). Then pass that `fileKey` to everything else.

**Visual-verify-writes** — prove a mutation actually rendered, not just returned success.
Figma MCP `use_figma` (create/edit) → screenshot → inspect the pixels. Two screenshot options: Figma MCP
`get_screenshot` (exports the node via the Plugin API — best when the node is off-viewport, as new nodes
often are), or chrome-figma `take_screenshot` of the real window (best when you also want chrome/panel
state). The API returning `{success:true}` is not proof the canvas looks right; the screenshot is pixel
truth. (Verified live: a magenta test frame + text showed correct pixels via `get_screenshot`.)

**Open-by-URL** — jump straight to a design.
Open `figma://file/…` or `https://figma.com/…` through the app's open flow → this lands as a **new
focused tab** → confirm with `get_file_info` → operate.

**Debug a stuck read** — a "Figma Plugin API not available — <reason>" error names the reason:
read it. "you can only view this file", "not a Figma file", Dev Mode without full access and
Sites files will not change by waiting or switching tabs. "finished loading … plugins are allowed"
means the file is still loading or the org has turned plugins off — check that the Plugins menu runs
a plugin in that file. "No Figma window open" means no window at all.

## Gotchas

- **Only app tab-focus retargets the MCP.** The Figma MCP reads the app's active tab (`lastFocusedTab`).
  Changing it requires `setTabFocus` (panel click / IPC) or the app open-file flow. chrome-figma
  `select_page` / `bringToFront` / `navigate_page` on a background target do **not** retarget it — that's
  the single most common mistaken assumption. Re-confirm with `get_file_info` after every real switch.
- **When Figma installs `window.figma`** (read from its bundle, 2026-10-15): early.js makes it a
  getter that stays `undefined` forever when `editing_file.can_edit === false` — Dev seats and files
  shared as "can view", **Dev Mode included**. Otherwise it appears after the file loads, in a team or
  org file, when plugins are allowed (`canRunExtensions`; Dev Mode: full Dev Mode access and
  `can_export`). Background tabs get it a second or so after they are switched to. A tab that never
  got it although none of these apply was seen only in test setups (several instances on one profile
  copy) and was not reproduced on clean installs.
- **Scripts are bounded at 60 s.** A Figma call that never settles (a raster `exportAsync` stalled once
  on the host, SVG fine, not reproduced since) returns "Figma did not answer within 60 s" instead of
  hanging the client.
- **Recents / Home has no Plugin API.** Figma installs it only with a file open, so tools fail there
  with "not a Figma file". Switch to a design tab.
- **CDP needs a restart.** Toggling CDP or its port does nothing until the app relaunches. The Figma MCP
  server port, by contrast, rebinds live on save.
- **Write tools are gated.** `use_figma`, `figma_text`, `create_new_file`, `upload_assets` only appear
  when Settings → *Enable write tools* is on; otherwise `tools/list` hides them and calls return
  "disabled". An upload URL re-checks the switch when the bytes arrive.
- **Only local clients.** Requests with an `Origin` header that is not localhost/127.0.0.1 get 403:
  a web page cannot reach the server through the browser. CLI/desktop clients send no Origin and
  are served; browser tools (MCP Inspector) must run on localhost.
- **Page `figma`, not a plugin sandbox** — measured live 2026-11-04, differences from Figma's
  remote `use_figma`:
  - `documentchange` / `nodechange` never fire. Do not rely on them.
  - `figma.root.name` is read-only (assignment is silently ignored); a file is renamed by
    `create_new_file`'s `fileName`, which uses the web app's `PUT /api/files/<key>`.
  - Pages load on demand and an **unloaded page reports no children and finds nothing, without
    an error**. `await page.loadAsync()` (or `get_metadata` with the page id) before reading it.
    `search_design_system` does this for you, within a time budget, and names pages it skipped.
  - `figma.fileKey`, `currentUser`, `createImage`, `getImageByHash().getBytesAsync()`,
    `createNodeFromSvg`, `exportAsync` (PNG/JPG/SVG/SVG_STRING/PDF), `teamLibrary` variables,
    `importComponentByKeyAsync` / `importComponentSetByKeyAsync` all work.
- **How `use_figma` stays atomic.** An undo after an empty undo step reverts the *user's* last
  action (measured), so the wrapper opens the script's step with a marker
  (`figma.root.setSharedPluginData("fln_mcp", "txn", …)`), and on a throw runs `commitUndo` +
  `triggerUndo`, which reverts exactly the marker and the script's changes. Do not call
  `figma.commitUndo()` in your code: rollback then only reaches changes after it, and the error
  says so. A successful script is one Ctrl+Z for the user and leaves no marker.
- **Library reach.** Variables of enabled libraries are searchable; library components only
  once the file uses them (found through instances). Unused library components and library
  styles cannot be listed through the Plugin API — Figma's remote server can, this one cannot.
- **`get_variable_defs` is selection-sensitive.** With a node selected it runs in selection mode (only
  bound vars); for the whole file, clear the selection first. `search_design_system` is always file-wide.
- **`get_metadata` without nodeId lists pages** (as Figma's remote tool does), no longer the
  current page's tree. Pass a page id for its outline.
- **Screenshots differ.** Figma MCP `get_screenshot` exports a node via the Plugin API (design pixels);
  chrome-figma `take_screenshot` captures the actual window (chrome, panels, loading states). Pick by
  what you're verifying.

## Validating that each tool works

`scripts/mcp-smoke.ts` is a live, self-bootstrapping harness: it builds a known scene with the write
tools, reads it back through every read tool, mutates, and cleans up — printing a PASS/FAIL matrix. Use
it to confirm the Figma MCP is healthy end-to-end (needs a Design file open + write tools on):

```
bun scripts/mcp-smoke.ts                          # default port, the active tab
bun scripts/mcp-smoke.ts 4000                     # custom serverPort
bun scripts/mcp-smoke.ts 3845 --file <fileKey>    # a specific open file — use a scratch file, it writes
```

It also checks the remote-parity surface: `use_figma` code, rollback and syntax errors, the page
list, batched queries, `maxDimension`, `download_assets` and an `upload_assets` round trip. It does
not run `create_new_file` (that creates a real draft). 30 PASS / 1 SKIP on 2026-11-04.

FigJam-only tools (`get_figjam`, `generate_diagram`) show SKIP unless a FigJam file is open.

## Tool quick-reference

**Figma MCP (data) — read:** `whoami`, `get_file_info`, `get_metadata` (no nodeId → pages),
`get_design_context`, `figma_find` (locate nodes by name/type/text), `figma_tree` (compact indented
outline), `get_variable_defs`, `search_design_system` (`queries: [{entity, query}]`),
`get_screenshot` (`maxDimension`, `contentsOnly`), `download_assets`, `get_code_connect_map` /
`add_code_connect_map`, `create_design_system_rules`, `get_figjam`.
**Figma MCP — write (gated):** `use_figma` (`code`; legacy `action`+`params` still works),
`figma_text` (safe text edit w/ font autoload), `create_new_file` (a real file), `upload_assets`,
`generate_diagram` (FigJam).
All file tools take an optional `fileKey`.

**chrome-figma (control):** `list_pages` / `select_page` / `new_page` / `navigate_page`, `click` / `fill`
/ `type_text` / `hover` / `press_key`, `take_screenshot` / `take_snapshot`, `evaluate_script`,
`list_console_messages` / `list_network_requests`, `wait_for`, `resize_page`.

For app architecture (tabs, windows, IPC, the MCP internals) load the **figma-linux-next** skill; for the
MCP server's own code and the enrichment work, see `src/main/MCP/`.
