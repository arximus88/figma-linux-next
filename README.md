# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next

Native app based on [Electron](http://electron.atom.io)-based browser wrapper for the [Figma](https://figma.com) web app on Linux.
Loads figma.com directly — no private APIs, no data scraping, no account sharing.
Not affiliated with or endorsed by Figma, Inc.

> **🧪 Status: Active Testing**
> Pre-built binaries (`.pacman`, `.deb`, `.rpm`, `.AppImage`) for x64 and arm64:
> **https://github.com/arximus88/figma-linux-next/releases**

## Features

- **Local system fonts** — full fontconfig (`fc-list`) enumeration plus fontkit for variable-font axes; variable fonts and all named instances work, just like the official desktop app (the web app can't reach them).
- **Shader, Halftone & Noise effects** — Figma's new WebGPU canvas effects render, matching the official app (opt-in, Experimental). They require X11/XWayland: on a Wayland session, enabling them relaunches the app under XWayland, so you trade native Wayland features (fractional scaling, per-monitor DPI) for shaders while they're on.
- **Local plugin development** — import a plugin from its `manifest.json` and iterate locally with hot-reload.
- **Built-in MCP server for AI assistants** — a [Model Context Protocol](https://modelcontextprotocol.io) server (port 3845) exposes your open design to AI tools like Claude Code.
- **Latest Chromium engine** — Electron 42 / Chromium 148, so the canvas, WebGL and color handling track the current web app.
- **Up-to-date Google Fonts** — Google Sans, Google Sans Flex, Google Sans Code and other recent additions are available.
- **Runs on both Wayland and X11** — native Wayland on GNOME, KDE Plasma, Sway, Hyprland, with a clean X11 fallback. Tested on Asahi Linux (Apple Silicon), Niri, and openSUSE.
- **Native window frame styles** — GNOME and Windows frames that match your DE (macOS and KDE TBD), with an option to hide the minimize/maximize buttons for a stock-GNOME look.
- **Instant new-file tab** — pre-loaded in the background after login, opens with no delay.
- **Config isolation** — uses `~/.config/figma-linux-next`, no conflicts with legacy installations.

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
