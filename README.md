# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next

Native app based on [Electron](http://electron.atom.io)-based browser wrapper for the [Figma](https://figma.com) web app on Linux.
Loads figma.com directly — no private APIs, no data scraping, no account sharing.
Not affiliated with or endorsed by Figma, Inc.

<p>
  <a href="https://github.com/arximus88/figma-linux-next/releases"><img alt="Release" src="https://img.shields.io/github/v/release/arximus88/figma-linux-next?style=flat-square&logo=github"></a>
  <a href="https://github.com/arximus88/figma-linux-next/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/arximus88/figma-linux-next/total?style=flat-square&color=success"></a>
  <a href="https://github.com/arximus88/figma-linux-next/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/arximus88/figma-linux-next/ci.yml?branch=dev&style=flat-square&label=CI&logo=githubactions&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/arximus88/figma-linux-next?style=flat-square"></a>
</p>
<p>
  <a href="https://github.com/arximus88/figma-linux-next/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/arximus88/figma-linux-next?style=flat-square&logo=github"></a>
  <a href="https://github.com/arximus88/figma-linux-next/issues"><img alt="Issues" src="https://img.shields.io/github/issues/arximus88/figma-linux-next?style=flat-square"></a>
  <a href="https://github.com/arximus88/figma-linux-next/commits"><img alt="Last commit" src="https://img.shields.io/github/last-commit/arximus88/figma-linux-next?style=flat-square"></a>
  <a href="https://aur.archlinux.org/packages/figma-linux-next"><img alt="AUR" src="https://img.shields.io/aur/version/figma-linux-next?style=flat-square&logo=archlinux&logoColor=white&label=AUR"></a>
  <a href="https://aur.archlinux.org/packages/figma-linux-next-bin"><img alt="AUR (bin)" src="https://img.shields.io/aur/version/figma-linux-next-bin?style=flat-square&logo=archlinux&logoColor=white&label=AUR%20(bin)"></a>
</p>
<p>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square&logo=electron&logoColor=white">
  <img alt="Svelte" src="https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white">
  <img alt="Biome" src="https://img.shields.io/badge/Biome-60A5FA?style=flat-square&logo=biome&logoColor=white">
</p>

> **🧪 Status: Active Testing**
> Pre-built binaries (`.pacman`, `.deb`, `.rpm`, `.AppImage`) for x64 and arm64:
> **https://github.com/arximus88/figma-linux-next/releases**

## Features

- **Local system fonts** — full fontconfig (`fc-list`) enumeration plus fontkit for variable-font axes; variable fonts and all named instances work, just like the official desktop app (the web app can't reach them).
- **Shader, Halftone & Noise effects** — Figma's new WebGPU canvas effects render, matching the official app (opt-in, Experimental). They require X11/XWayland: on a Wayland session, enabling them relaunches the app under XWayland, so you trade native Wayland features (fractional scaling, per-monitor DPI) for shaders while they're on.
- **Local plugin development** — import a plugin from its `manifest.json` and iterate locally with hot-reload.
- **Built-in MCP server for AI assistants** — a [Model Context Protocol](https://modelcontextprotocol.io) server (default port 3845) lets AI tools like Claude Code read **and** write your open design: scene-graph metadata, design context, variables/styles, screenshots, plus create/edit nodes and Mermaid→FigJam diagrams. Read-only by default; write tools, the port, and an optional Chrome DevTools control plane are toggled in Settings. See [AI integration (MCP)](#ai-integration-mcp).
- **Latest Chromium engine** — Electron 42 / Chromium 148, so the canvas, WebGL and color handling track the current web app.
- **Up-to-date Google Fonts** — Google Sans, Google Sans Flex, Google Sans Code and other recent additions are available.
- **Runs on both Wayland and X11** — native Wayland on GNOME, KDE Plasma, Sway, Hyprland, with a clean X11 fallback. Tested on Asahi Linux (Apple Silicon), Niri, and openSUSE.
- **Native window frame styles** — GNOME and Windows frames that match your DE (macOS and KDE TBD), with an option to hide the minimize/maximize buttons for a stock-GNOME look.
- **Instant new-file tab** — pre-loaded in the background after login, opens with no delay.
- **Config isolation** — uses `~/.config/figma-linux-next`, no conflicts with legacy installations.

## AI integration (MCP)

figma-linux-next ships a built-in [Model Context Protocol](https://modelcontextprotocol.io) server so
assistants like Claude Code can work with your **live** design — no plugin to install, no cloud
round-trip. Everything binds to `127.0.0.1` and is configured in **Settings → General → MCP integrations**.

- **Data plane — Figma MCP** (HTTP, default `127.0.0.1:3845`, on by default). Reads file info,
  scene-graph metadata, design context, variables & styles, Code Connect maps, and node screenshots;
  helper tools `figma_find` / `figma_tree` locate and outline nodes cheaply, and it can emit
  design-system rules for your codebase. With **write tools** enabled (opt-in) it also creates and edits
  frames, text, rectangles and variables, and turns Mermaid into FigJam diagrams. The port and the
  write-tools gate are both configurable.
- **Control plane — Chrome DevTools (CDP)** (opt-in, needs a restart). Exposes the app window over
  `--remote-debugging-port` so a CDP client (e.g. [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp))
  can drive the UI — switch tabs, click, type, screenshot the real window. Paired with the data plane,
  an assistant can navigate to a file and then read or edit it.

Read access is on out of the box; anything that mutates your files or exposes window control is
off-by-default and opt-in.

## Tech Stack

- **Electron 42** (Chromium 148)
- **Svelte 5** with runes
- **Vite 8**
- **Bun**
- **Biome** (lint + format)

## Installation

Download from **https://github.com/arximus88/figma-linux-next/releases**:

```bash
# Arch / CachyOS (x64)
sudo pacman -U figma-linux-next_*_linux_x64.pacman

# Debian / Ubuntu (x64 or arm64)
sudo dpkg -i figma-linux-next_*_amd64.deb
# or
sudo dpkg -i figma-linux-next_*_arm64.deb

# Fedora / openSUSE
sudo rpm -i figma-linux-next_*_x86_64.rpm

# AppImage
chmod +x figma-linux-next-*.AppImage && ./figma-linux-next-*.AppImage
```

> **AppImage note:** On first launch the app automatically registers the `figma://` URL handler required for login. If login still fails after first launch, register it manually:
>
> ```bash
> # Run once to register the handler
> ~/.local/share/applications/figma-linux-next-appimage.desktop  # created on first launch
> xdg-mime default figma-linux-next-appimage.desktop x-scheme-handler/figma
> update-desktop-database ~/.local/share/applications/
> ```

### AUR (Arch / CachyOS)

```bash
yay -S figma-linux-next
```

Or with any other AUR helper. Package: [figma-linux-next](https://aur.archlinux.org/packages/figma-linux-next)

## Migration from legacy figma-linux

Settings are stored in `~/.config/figma-linux-next`. To carry over settings from the old installation:

```bash
cp ~/.config/figma-linux/settings.json ~/.config/figma-linux-next/
```

## Building from source

```bash
git clone https://github.com/arximus88/figma-linux-next.git
cd figma-linux-next
bun install
bun run dev      # dev mode with HMR
bun run build    # production build
bun run start    # run production build
bun run pack     # build all packages
```

## Issues & Discussions

- https://github.com/arximus88/figma-linux-next/issues
- https://github.com/arximus88/figma-linux-next/discussions

## License

GPL-2.0-only — see [LICENSE](LICENSE).
