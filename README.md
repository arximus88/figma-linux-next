# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next (unofficial)

Figma Linux Next is a **community-driven fork** of the unofficial [Electron](http://electron.atom.io)-based [Figma](https://figma.com) desktop app for Linux. This project is maintained by the Figma Linux Community to ensure it remains open, modern, and high-performance.

> **🧪 Status: Active Testing**
> The project is under active development and testing. Stable packages are not yet available in AUR or other package stores.
> Pre-built binaries (`.pacman`, `.deb`, `.rpm`, `.AppImage`) are published as GitHub tags:
> **https://github.com/arximus88/figma-linux-next/tags**

### Why "Next"?
- **Modern Stack:** Built with Bun, Vite 8, and Svelte 5 (Runes).
- **Native Wayland:** First-class support for modern compositors (Sway, Hyprland, GNOME Wayland).
- **Independent Configuration:** Uses `~/.config/figma-linux-next` to avoid conflicts with legacy versions.
- **Optimized for CachyOS/Arch:** Tailored performance flags and system integration.

## Tech Stack
- **Electron 41** (Chromium 134)
- **Bun** (Package manager & runtime)
- **Svelte 5** (UI framework, runes)
- **Vite 8** (Build system)
- **Fontconfig (`fc-list`)** (System font enumeration — variable fonts, all named instances)

## Installation

### Manual install from GitHub tags (recommended for now)

Download the package for your distro from **https://github.com/arximus88/figma-linux-next/tags**:

```bash
# Arch / CachyOS
sudo pacman -U figma-linux-next_*_linux_x64.pacman

# Debian / Ubuntu
sudo dpkg -i figma-linux-next_*_amd64.deb

# Fedora / openSUSE
sudo rpm -i figma-linux-next_*_x86_64.rpm
```

### AppImage

```bash
chmod +x figma-linux-next-*.AppImage
./figma-linux-next-*.AppImage
```

### AUR / other stores

Not available yet. Will be published once testing stabilizes.

## Migration from legacy figma-linux

Settings are stored in `~/.config/figma-linux-next` (separate from the old `~/.config/figma-linux`). You can manually copy `settings.json` between them if needed.

## Building from source

```bash
git clone https://github.com/arximus88/figma-linux-next.git
cd figma-linux-next
bun install
bun run dev       # development mode with HMR
bun run build     # production build
bun run start     # run production build
bun run pack      # build all packages (.deb, .rpm, .pacman, .AppImage, .zip)
```

## Community & Feedback

- **Issues:** https://github.com/arximus88/figma-linux-next/issues
- **Discussions:** https://github.com/arximus88/figma-linux-next/discussions

## License

MIT License — See [LICENSE](LICENSE) file.
