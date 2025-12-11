# Building Figma-Linux v0.12.0

Comprehensive build instructions for all major Linux package formats and architectures.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Support](#architecture-support)
- [Quick Start](#quick-start)
- [Package Formats](#package-formats)
  - [PKGBUILD (Arch/Manjaro)](#pkgbuild-archmanjaro)
  - [DEB (Debian/Ubuntu)](#deb-debianubuntu)
  - [RPM (Fedora/RHEL/openSUSE)](#rpm-fedorarhlopensuse)
  - [AppImage (Universal)](#appimage-universal)
  - [Snap](#snap)
  - [Flatpak](#flatpak)
- [Multi-Architecture Builds](#multi-architecture-builds)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

```bash
# Node.js 18+ and npm 8+
node --version  # Should be >= 18.0.0
npm --version   # Should be >= 8.0.0

# Git
git --version
```

### Platform-Specific Tools

#### For All Builds
```bash
# Install build dependencies
npm install
```

#### For DEB/RPM (on any platform)
```bash
npm install --save-dev electron-builder
```

#### For AppImage
```bash
# Install appimagetool (Arch/Ubuntu)
sudo pacman -S appimagetool  # Arch
sudo apt install appimagetool  # Ubuntu

# Or download manually
wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x appimagetool-x86_64.AppImage
sudo mv appimagetool-x86_64.AppImage /usr/local/bin/appimagetool
```

#### For Snap
```bash
sudo snap install snapcraft --classic
```

#### For Flatpak
```bash
# Fedora
sudo dnf install flatpak-builder

# Ubuntu/Debian
sudo apt install flatpak-builder

# Arch
sudo pacman -S flatpak-builder
```

---

## Architecture Support

| Architecture | Status | Electron Support | Notes |
|--------------|--------|------------------|-------|
| **x86_64** (x64) | ✅ Full | Yes | Primary target, fully tested |
| **aarch64** (ARM64) | ✅ Full | Yes | Raspberry Pi 4+, Apple Silicon via Rosetta |
| **armv7l** (ARM 32-bit) | ⚠️ Limited | Yes | Raspberry Pi 3, may have performance issues |
| **i686** (x86 32-bit) | ❌ Deprecated | Limited | Not recommended, Electron support ending |

**Recommendation**: Focus on **x86_64** and **aarch64** for production builds.

---

## Quick Start

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/arximus88/figma-linux-next.git
cd figma-linux-next

# Install dependencies
npm install

# Build the application
npm run build

# Test locally
npm run dev
```

---

## Package Formats

### PKGBUILD (Arch/Manjaro)

**Best for**: Arch Linux, Manjaro, EndeavourOS, CachyOS

#### Build from PKGBUILD

```bash
# The PKGBUILD is already in the root directory
cd figma-linux-next

# Build the package
makepkg -si

# Or without installing
makepkg

# Install manually
sudo pacman -U figma-linux-0.12.0-1-x86_64.pkg.tar.zst
```

#### Multi-Architecture PKGBUILD

```bash
# For x86_64 (default)
makepkg -si

# For aarch64 (ARM64) - requires cross-compilation
# Edit PKGBUILD and change:
arch=('aarch64')
# Then build on ARM64 system or use distcc
```

#### Create AUR Package

```bash
# Generate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Create tarball
tar -czf figma-linux-0.12.0.tar.gz PKGBUILD .SRCINFO

# Upload to AUR
# Follow: https://wiki.archlinux.org/title/AUR_submission_guidelines
```

---

### DEB (Debian/Ubuntu)

**Best for**: Debian, Ubuntu, Linux Mint, Pop!_OS, Elementary OS

#### Build DEB Package

```bash
# Build all targets (includes deb)
npm run package

# Build only DEB
npm run package -- --linux deb

# Output location
ls build/installers/figma-linux_0.12.0_amd64.deb
```

#### Multi-Architecture DEB

```bash
# x86_64 (amd64)
npm run package -- --linux deb --x64

# ARM64 (arm64)
npm run package -- --linux deb --arm64

# ARMv7 (armhf)
npm run package -- --linux deb --armv7l
```

#### Install DEB

```bash
# Install
sudo dpkg -i build/installers/figma-linux_0.12.0_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

# Or use gdebi (recommended)
sudo gdebi build/installers/figma-linux_0.12.0_amd64.deb
```

#### Create Repository

```bash
# For hosting your own APT repository
# See scripts/create-deb-repo.sh
./scripts/create-deb-repo.sh
```

---

### RPM (Fedora/RHEL/openSUSE)

**Best for**: Fedora, RHEL, CentOS, Rocky Linux, AlmaLinux, openSUSE

#### Build RPM Package

```bash
# Build all targets (includes rpm)
npm run package

# Build only RPM
npm run package -- --linux rpm

# Output location
ls build/installers/figma-linux-0.12.0.x86_64.rpm
```

#### Multi-Architecture RPM

```bash
# x86_64
npm run package -- --linux rpm --x64

# ARM64 (aarch64)
npm run package -- --linux rpm --arm64
```

#### Install RPM

```bash
# Fedora/RHEL
sudo dnf install build/installers/figma-linux-0.12.0.x86_64.rpm

# openSUSE
sudo zypper install build/installers/figma-linux-0.12.0.x86_64.rpm

# Generic
sudo rpm -ivh build/installers/figma-linux-0.12.0.x86_64.rpm
```

---

### AppImage (Universal)

**Best for**: Universal Linux, works on any distribution

#### Build AppImage

```bash
# Build AppImage
npm run package -- --linux AppImage

# Output location
ls build/installers/figma-linux-0.12.0-x86_64.AppImage
```

#### Multi-Architecture AppImage

```bash
# x86_64
npm run package -- --linux AppImage --x64

# ARM64
npm run package -- --linux AppImage --arm64
```

#### Run AppImage

```bash
# Make executable
chmod +x build/installers/figma-linux-0.12.0-x86_64.AppImage

# Run
./build/installers/figma-linux-0.12.0-x86_64.AppImage

# Install system-wide
./build/installers/figma-linux-0.12.0-x86_64.AppImage --appimage-install

# Uninstall
./build/installers/figma-linux-0.12.0-x86_64.AppImage --appimage-uninstall
```

#### AppImage Tips

```bash
# Extract contents (debugging)
./figma-linux-0.12.0-x86_64.AppImage --appimage-extract

# Run extracted version
./squashfs-root/AppRun

# Integration with system
# AppImages auto-integrate via AppImageLauncher if installed
sudo apt install appimagelauncher  # Ubuntu
```

---

### Snap

**Best for**: Ubuntu, elementary OS, any distribution with snapd

#### Prerequisites

```bash
# Install snapcraft
sudo snap install snapcraft --classic

# Install multipass (for isolated builds)
sudo snap install multipass
```

#### Build Snap

```bash
# Clean build
snapcraft clean

# Build snap (uses snapcraft.yaml)
snapcraft

# Output location
ls figma-linux_0.12.0_amd64.snap
```

#### Multi-Architecture Snap

```bash
# Build for amd64 (x86_64)
snapcraft --target-arch amd64

# Build for arm64
snapcraft --target-arch arm64 --destructive-mode

# Build for armhf (ARM 32-bit)
snapcraft --target-arch armhf
```

#### Install Snap

```bash
# Install locally
sudo snap install figma-linux_0.12.0_amd64.snap --dangerous

# Or publish to Snap Store
snapcraft login
snapcraft upload figma-linux_0.12.0_amd64.snap --release stable
```

#### Snap Configuration

The `snapcraft.yaml` file is in the root directory. Key features:
- **Confinement**: `strict` with necessary interfaces
- **Base**: `core22` (Ubuntu 22.04)
- **Grade**: `stable`
- **Plugs**: `desktop`, `network`, `home`, `audio-playback`, `opengl`

---

### Flatpak

**Best for**: Flathub distribution, sandboxed applications

#### Prerequisites

```bash
# Install flatpak-builder
sudo apt install flatpak-builder  # Debian/Ubuntu
sudo dnf install flatpak-builder  # Fedora
sudo pacman -S flatpak-builder    # Arch

# Add Flathub repository
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

#### Build Flatpak

```bash
# Build using manifest
flatpak-builder build-dir com.figma.FigmaLinux.yml --force-clean

# Test the build
flatpak-builder --run build-dir com.figma.FigmaLinux.yml figma-linux

# Create repository
flatpak-builder --repo=repo build-dir com.figma.FigmaLinux.yml

# Build bundle for distribution
flatpak build-bundle repo figma-linux.flatpak com.figma.FigmaLinux
```

#### Multi-Architecture Flatpak

```bash
# Build for x86_64
flatpak-builder --arch=x86_64 build-dir com.figma.FigmaLinux.yml

# Build for aarch64
flatpak-builder --arch=aarch64 build-dir com.figma.FigmaLinux.yml
```

#### Install Flatpak

```bash
# Install from bundle
flatpak install figma-linux.flatpak

# Or install from repository
flatpak install --user flathub com.figma.FigmaLinux

# Run
flatpak run com.figma.FigmaLinux
```

#### Publish to Flathub

```bash
# 1. Fork flathub/com.figma.FigmaLinux
# 2. Update manifest with new version
# 3. Submit PR to Flathub
# See: https://github.com/flathub/flathub/wiki/App-Submission
```

---

## Multi-Architecture Builds

### Cross-Compilation Setup

#### For ARM64 on x86_64

```bash
# Install cross-compilation tools (Ubuntu/Debian)
sudo apt install gcc-aarch64-linux-gnu g++-aarch64-linux-gnu

# Install QEMU for testing
sudo apt install qemu-user-static

# Configure npm for cross-compilation
npm config set arch arm64
npm config set target_arch arm64

# Build
npm run package -- --arm64
```

#### For x86_64 on ARM64

```bash
# Install cross-compilation tools
sudo apt install gcc-x86-64-linux-gnu g++-x86-64-linux-gnu

# Configure and build
npm config set arch x64
npm run package -- --x64
```

### Build Matrix (All Architectures)

Create a `build-all.sh` script:

```bash
#!/bin/bash
# Build for all architectures

ARCHITECTURES=("x64" "arm64")
FORMATS=("deb" "rpm" "AppImage")

for arch in "${ARCHITECTURES[@]}"; do
  for format in "${FORMATS[@]}"; do
    echo "Building $format for $arch..."
    npm run package -- --linux $format --$arch
  done
done

echo "All builds complete!"
ls -lh build/installers/
```

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/build.yml`:

```yaml
name: Build Packages

on:
  push:
    tags:
      - 'v*'

jobs:
  build-linux:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        arch: [x64, arm64]
        format: [deb, rpm, AppImage]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run package -- --linux ${{ matrix.format }} --${{ matrix.arch }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: figma-linux-${{ matrix.arch }}-${{ matrix.format }}
          path: build/installers/*
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - build
  - package

build:
  stage: build
  image: node:18
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - dist/

package:
  stage: package
  image: electronuserland/builder:wine
  parallel:
    matrix:
      - ARCH: [x64, arm64]
        FORMAT: [deb, rpm, AppImage]
  script:
    - npm run package -- --linux $FORMAT --$ARCH
  artifacts:
    paths:
      - build/installers/
```

---

## Build Scripts

### Automated Build Script

Create `scripts/build-all.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Figma-Linux Build Script v0.12.0"
echo "===================================="

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf build/installers dist node_modules/.cache

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build application
echo "🔨 Building application..."
npm run build

# Package for all formats
echo "📦 Creating packages..."

# x86_64 builds
npm run package -- --linux deb --x64
npm run package -- --linux rpm --x64
npm run package -- --linux AppImage --x64

# ARM64 builds (if supported)
if command -v aarch64-linux-gnu-gcc &> /dev/null; then
    echo "🦾 Building ARM64 packages..."
    npm run package -- --linux deb --arm64
    npm run package -- --linux rpm --arm64
    npm run package -- --linux AppImage --arm64
fi

# List generated packages
echo "✅ Build complete! Generated packages:"
ls -lh build/installers/

echo ""
echo "📋 Package locations:"
echo "  DEB:      build/installers/*.deb"
echo "  RPM:      build/installers/*.rpm"
echo "  AppImage: build/installers/*.AppImage"
echo "  PKGBUILD: ./PKGBUILD (build with makepkg)"
```

Make it executable:
```bash
chmod +x scripts/build-all.sh
./scripts/build-all.sh
```

---

## Package Size Comparison

| Format | x86_64 Size | ARM64 Size | Notes |
|--------|-------------|------------|-------|
| **PKGBUILD** | ~5 MB | ~5 MB | Uses system Electron |
| **DEB** | ~120 MB | ~115 MB | Bundled runtime |
| **RPM** | ~120 MB | ~115 MB | Bundled runtime |
| **AppImage** | ~150 MB | ~145 MB | Fully self-contained |
| **Snap** | ~130 MB | ~125 MB | Uses core22 base |
| **Flatpak** | ~140 MB | ~135 MB | Uses freedesktop runtime |

---

## Troubleshooting

### Build Errors

#### "Cannot find module 'electron'"
```bash
npm install --save-dev electron@39.1.0
```

#### "ENOSPC: System limit for number of file watchers reached"
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

#### "Permission denied" for AppImage
```bash
chmod +x build/installers/*.AppImage
```

### Architecture Issues

#### "Unsupported architecture"
- Ensure you're building on the correct architecture or using cross-compilation tools
- Check `npm config get arch` matches your target

#### ARM builds fail on x86_64
```bash
# Install QEMU
sudo apt install qemu-user-static

# Register ARM interpreters
sudo docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
```

### Electron Rebuild Issues

```bash
# Rebuild native modules
npm run rebuild

# Or manually
./node_modules/.bin/electron-rebuild
```

---

## Distribution Recommendations

### For End Users
1. **Ubuntu/Debian**: DEB package
2. **Fedora/RHEL**: RPM package
3. **Arch/Manjaro**: PKGBUILD (install from AUR)
4. **Universal**: AppImage
5. **Sandboxed**: Flatpak from Flathub
6. **Ubuntu users**: Snap from Snap Store

### For Developers
- **Development**: Use `npm run dev`
- **Testing**: Build AppImage for easy distribution
- **CI/CD**: Generate all formats and upload to GitHub Releases

### Architecture Priority
1. **x86_64** - Primary, most users
2. **aarch64** - Growing (Raspberry Pi 4+, ARM servers)
3. **armv7l** - Legacy, limited support
4. **i686** - Deprecated, skip

---

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Update `PKGBUILD` version and checksums
- [ ] Update `snapcraft.yaml` version
- [ ] Update `com.figma.FigmaLinux.yml` version
- [ ] Run `npm run build` locally
- [ ] Test on at least 2 distributions
- [ ] Build all package formats
- [ ] Test AppImage on clean system
- [ ] Create GitHub release with binaries
- [ ] Submit to AUR (if Arch package)
- [ ] Submit to Flathub (if Flatpak)
- [ ] Update Snap Store (if Snap)

---

## Additional Resources

- **Electron Builder**: https://www.electron.build/
- **PKGBUILD Wiki**: https://wiki.archlinux.org/title/PKGBUILD
- **Snapcraft Docs**: https://snapcraft.io/docs
- **Flatpak Docs**: https://docs.flatpak.org/
- **AppImage Docs**: https://docs.appimage.org/

---

**Version**: 0.12.0
**Last Updated**: 2025-12-11
**Maintainer**: Figma-Linux Contributors
