# Project notes

This directory preserves useful information from GitHub issues and discussions:
community workarounds, investigation results, and decisions from comments.
Each note links to its original sources and distinguishes reported observations
from verified project behavior. Closing an issue does not remove its context.

## Archive

- [Native Termux setup — issue #22](notes/termux.md): community Electron/Bun setup,
  GPU flags, login workaround, and reported performance.
- [Tab memory scope — PRs #63, #64, #77](notes/tab-memory.md): maintainer decision
  to keep lazy restore and drop background eviction, with the replacement PR.

## Adding a note

Use one file per topic in `notes/`. Record the issue or PR links, authors,
original dates, and the date the note was captured. Summarize the useful details
and relevant follow-up comments, keeping unresolved questions explicit. Link
individual comments when they explain a workaround or a decision. Add the note
to this index; leave the main repository README focused on the app.
