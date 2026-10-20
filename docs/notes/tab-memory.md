# Tab memory: keep lazy restore, drop eviction

Captured on 2026-10-14. This records the maintainer's scope decision and the
contributor's follow-up, rather than a guarantee about Figma's memory usage.

## Sources

- [PR #63 — background-tab memory-budget eviction](https://github.com/arximus88/figma-linux-next/pull/63).
- [PR #64 — lazy session restore](https://github.com/arximus88/figma-linux-next/pull/64).
- [Maintainer decision, @arximus88, 2026-10-02](https://github.com/arximus88/figma-linux-next/pull/64#issuecomment-5954924269).
- [Contributor follow-up, @jangoux, 2026-10-14](https://github.com/arximus88/figma-linux-next/pull/64#issuecomment-6159220086).
- [PR #77 — replacement implementation](https://github.com/arximus88/figma-linux-next/pull/77).

## Decision

The maintainer said that the memory report motivating #63/#64 had been withdrawn:
the reporter had no swap, and comparable Figma workloads used similar memory on
Windows. The decision was to retain lazy startup restoration while dropping
ongoing memory-budget eviction.

Retain:

- A lightweight `DiscardedTab` shell for saved tabs whose views have not been
  created yet.
- Lazy session restore, creating background views only when needed.
- Tests that restored tabs keep their title, group, and order and load on first
  focus.

Drop:

- Automatic destruction of loaded background tabs when a memory budget is exceeded.
- Memory sampling on every tab switch and periodic budget checks.
- The corresponding budget settings and controls.

The concerns stated at the time were repeated unload/reload cycles without
hysteresis or a minimum tab age, sampling overhead, and the lack of a safeguard
for unsynced edits before destroying a loaded view. The original review also
noted missing eviction tests; tests were subsequently added during integration,
but the maintainer's decision to exclude eviction still applies.

## Follow-up

On 2026-10-14, @jangoux submitted #77 with the shell and lazy restore only,
removing memory-budget eviction and adding restore-path tests. The contributor
proposed closing both #63 and #64 in favor of #77.

At capture time, all three PRs were still open. #77's CI passed, including build,
type checking, lint, unit tests, and Electron E2E under xvfb. The replacement
was not yet merged. This note does not mark issue #40's freezing report as resolved.
