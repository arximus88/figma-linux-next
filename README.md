# <img src="resources/icons/128x128.png" width="32"> Figma Linux Next

Unofficial [Electron](http://electron.atom.io)-based browser wrapper for the [Figma](https://figma.com) web app on Linux.
Loads figma.com directly — no private APIs, no data scraping, no account sharing.
Not affiliated with or endorsed by Figma, Inc.

> **🧪 Status: Active Testing**
> Pre-built binaries (`.pacman`, `.deb`, `.rpm`, `.AppImage`) for x64 and arm64:
> **https://github.com/arximus88/figma-linux-next/releases**

## What's different from other forks

- **Increased performance and build times** — thanks to [Bun](https://bun.sh), Vite 8, and Electron 41.
- **Instant new-file tab** — pre-loaded in background after login, opens without delay
- **No duplicate tabs** — opening the same file twice focuses the existing tab
- **Full local font support** — uses fontconfig (`fc-list`) instead of fontkit; variable fonts and all named instances work correctly
- **Updated Google Fonts support** — new fonts available: Google Sans, Google Sans Flex, Google Sans Code, etc
- **Native window frame styles** — GNOME and Windows frame styles that match your DE (macOS and KDE TBD); no custom theming injections that break visual rendering
- **Native Wayland** — works on GNOME Wayland, KDE Plasma, Sway, Hyprland
- **Launched on different enviroments** — tested on Asahi Linux (Apple Silicon), Niri compositor ot OpenSuse.
- **Config isolation** — uses `~/.config/figma-linux-next`, no conflicts with legacy installations

## Tech Stack

- **Electron 41** (Chromium 134)
- **Svelte 5** with runes
- **Vite 8**
- **Bun**

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

MIT — see [LICENSE](LICENSE).
