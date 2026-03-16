# Changelog

## [Unreleased]

### Fixed
- Duplicate tabs: opening the same file from Home, Community, or New File tab now focuses the existing tab instead of creating a copy
- New File (warm) tab navigating to a file URL now routes through deduplication instead of bypassing it
- Settings modal now resizes correctly when the main window is resized
- `SettingsView` IPC and app event listeners now properly removed when the window closes (memory leak fix)
- `TabManager.closeAll()` now destroys WebContents before clearing (memory leak fix)
- Opening a file from Home tab now switches focus to the new tab immediately
- Dead links in Help menu removed (Telegram channel, outdated plugin docs URL, duplicate Community Forum entry)

### Changed
- Settings UI redesigned: toggles use accent color when enabled, info tooltips added to settings items
- Settings modal background color follows Figma dark/light theme preference
- `package.json` description updated with legal disclaimer (not affiliated with Figma, Inc.)

## [0.13.0] — GNOME frame redesign

- GNOME frame UI redesign and codebase cleanup
