# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next (unofficial)

Figma-linux-next is a fork of the unofficial [Electron](http://electron.atom.io)-based [Figma](https://figma.com) desktop app for Linux.

Features:
- **Native Wayland support** — first-class support for modern Linux compositors
- **GPU acceleration** — optimized for WebGL/WebAssembly workloads
- **System integration** — protocol handlers, desktop actions, system fonts
- **Window frame styles** — GNOME/Adwaita, Windows 11
- **Extension system** — hot-reloadable plugins

## Installation

### Arch-based distros

```bash
yay -S figma-linux-next
```

### Debian-based distros

```bash
sudo dpkg -i figma-linux-next_*_amd64.deb
sudo apt-get install -f
```

### AppImage

```bash
chmod +x figma-linux-next-*.AppImage
./figma-linux-next-*.AppImage
```

## Building from source

1. Clone the repository:
```bash
git clone https://github.com/arximus88/figma-linux-next.git
cd figma-linux-next
```

2. Install dependencies:
```bash
bun install
```

3. Run in development mode:
```bash
bun run dev
```

Other commands:
- `bun run build` — build for production
- `bun run start` — run the built version
- `bun run builder` — package for distribution
- `bun run pack` — clean old packages and pack
- `bun run pack:pacman` — build pacman package

## Tech Stack
- **Electron 39** (Chromium 132)
- **Bun** (Package manager & runtime)
- **Svelte 5** (UI framework, runes)
- **Vite 7** (Build system)
- **Fontkit** (Font parsing)

### Environment Variables

```
NODE_ENV=dev
DEV_PANEL_PORT=3330
DEV_SETTINGS_PORT=3331
```

## License

MIT License — See [LICENSE](LICENSE) file.
