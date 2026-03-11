# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next (unofficial)

Figma Linux Next is a **community-driven fork** of the unofficial [Electron](http://electron.atom.io)-based [Figma](https://figma.com) desktop app for Linux. This project is maintained by the Figma Linux Community to ensure it remains open, modern, and high-performance.

### Why "Next"?
- **Modern Stack:** Built with Bun, Vite, and Svelte 5 (Runes).
- **Native Wayland:** First-class support for modern compositors (Sway, Hyprland, GNOME Wayland).
- **Independent Configuration:** Uses `~/.config/figma-linux-next` to avoid conflicts with legacy versions.
- **Optimized for CachyOS/Arch:** Tailored performance flags and system integration.

## Tech Stack
- **Electron 39** (Chromium 132)
- **Bun** (Package manager & runtime)
- **Svelte 5** (UI framework, runes)
- **Vite 7** (Build system)
- **Fontkit** (Font parsing)

## Migration from legacy figma-linux

If you are moving from the old `figma-linux`, your settings will not be automatically imported to ensure a clean state. However, you can manually copy your `settings.json` from `~/.config/figma-linux/` to `~/.config/figma-linux-next/`.

## Installation

### Arch-based distros (AUR)

```bash
# Stable version (from releases)
yay -S figma-linux-next

# Development version (from master branch)
yay -S figma-linux-next-git
```

### Debian-based distros

Download the latest `.deb` from [Releases](https://github.com/arximus88/figma-linux-next/releases) and install:

```bash
sudo dpkg -i figma-linux-next_*_amd64.deb
sudo apt-get install -f
```

### AppImage

Download the `.AppImage`, make it executable, and run:

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

### Other commands:
- `bun run build` — build for production
- `bun run start` — run the built version
- `bun run builder` — package for distribution
- `bun run pack` — clean old packages and pack
- `bun run pack:pacman` — build pacman package

## Community & Feedback

- **Issues:** Report bugs at [GitHub Issues](https://github.com/arximus88/figma-linux-next/issues)
- **Discussions:** Join the community at [GitHub Discussions](https://github.com/arximus88/figma-linux-next/discussions)

## License

MIT License — See [LICENSE](LICENSE) file.
