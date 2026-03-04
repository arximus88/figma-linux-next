# Building figma-linux-next v0.13.0

Build instructions for all major Linux package formats and architectures.

---

## Prerequisites

```bash
# Bun (package manager & runtime)
bun --version  # Should be >= 1.x

# Node.js 18+ (for Electron tooling)
node --version  # Should be >= 18.0.0

# Git
git --version
```

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/arximus88/figma-linux-next.git
cd figma-linux-next

# Install dependencies
bun install

# Build the application
bun run build

# Development mode (Vite HMR)
bun run dev
```

---

## Package Formats

### PKGBUILD (Arch/Manjaro/CachyOS)

```bash
# Build the package
makepkg -si

# Or manually install
sudo pacman -U figma-linux-next-0.13.0-1-x86_64.pkg.tar.zst
```

### DEB (Debian/Ubuntu)

```bash
# Build DEB
bun run package -- --linux deb --x64

# Install
sudo dpkg -i build/installers/figma-linux-next_0.13.0_linux_amd64.deb
sudo apt-get install -f
```

### RPM (Fedora/RHEL/openSUSE)

```bash
# Build RPM
bun run package -- --linux rpm --x64

# Install
sudo dnf install build/installers/figma-linux-next-0.13.0.x86_64.rpm
```

### AppImage (Universal)

```bash
# Build AppImage
bun run package -- --linux AppImage --x64

# Run
chmod +x build/installers/figma-linux-next-0.13.0-x86_64.AppImage
./build/installers/figma-linux-next-0.13.0-x86_64.AppImage
```

### Pacman

```bash
# Build pacman package via electron-builder
bun run pack:pacman

# Install
sudo pacman -U build/installers/figma-linux-next_0.13.0_linux_x64.pacman
```

---

## Multi-Architecture Builds

| Architecture | Status | Notes |
|--------------|--------|-------|
| **x86_64** (x64) | ✅ Full | Primary target |
| **aarch64** (ARM64) | ✅ Full | Raspberry Pi 4+ |

```bash
# ARM64 builds
bun run package -- --linux deb --arm64
bun run package -- --linux AppImage --arm64
```

---

## Build Scripts

```bash
# Full build + package
bun run pack

# Build only (no packaging)
bun run build

# Clean dist/
bun run cln

# Install locally for testing
bun run local:install

# Run built version
bun run run
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build Packages

on:
  push:
    tags: ['v*']

jobs:
  build-linux:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        arch: [x64, arm64]
        format: [deb, rpm, AppImage]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run package -- --linux ${{ matrix.format }} --${{ matrix.arch }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: figma-linux-next-${{ matrix.arch }}-${{ matrix.format }}
          path: build/installers/*
```

---

## Troubleshooting

### "Cannot find module 'electron'"
```bash
bun add -d electron@39.6.0
```

### "ENOSPC: System limit for file watchers"
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Electron Rebuild
```bash
./node_modules/.bin/electron-rebuild
```

---

## Release Checklist

- [ ] Update version in `package.json` and `src/package.json`
- [ ] Update `PKGBUILD` version
- [ ] Update `snapcraft.yaml` version
- [ ] Update `com.figma.FigmaLinux.yml` version
- [ ] Run `bun run build` locally
- [ ] Test on at least 2 distributions
- [ ] Build all package formats
- [ ] Create GitHub release

---

**Version**: 0.13.0
**Last Updated**: 2026-02-23
**Build System**: Vite 7 + vite-plugin-electron
