# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next (unofficial)

Unofficial [Electron](http://electron.atom.io)-based [Figma](https://figma.com) desktop client for Linux.

> **🧪 Status: Active Testing**
> Not yet available in AUR or other package stores.
> Pre-built binaries (`.pacman`, `.deb`, `.rpm`, `.AppImage`) for x64 and arm64:
> **https://github.com/arximus88/figma-linux-next/tags**

## What's different from other forks

- **Instant new-file tab** — pre-loaded in background after login, opens without delay
- **Full local font support** — uses fontconfig (`fc-list`) instead of fontkit; variable fonts and all named instances work correctly (Open Sans, Google Sans, Google Sans Flex, Google Sans Code, e-Ukraine, etc.)
- **Native window frame styles** — GNOME, KDE, Windows, macOS frames that match your desktop environment; no custom theming that breaks rendering
- **Native Wayland** — works on GNOME Wayland, KDE Plasma, Sway, Hyprland
- **Runs on arm64** — tested on Asahi Linux (Apple Silicon)
- **Config isolation** — uses `~/.config/figma-linux-next`, no conflicts with legacy installations

## Tech Stack

- **Electron 41** (Chromium 134)
- **Svelte 5** with runes
- **Vite 8**
- **Bun**

## Installation

Download from **https://github.com/arximus88/figma-linux-next/tags**:

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

### AUR / other stores

Not available yet.

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

MIT — see [LICENSE](LICENSE).
