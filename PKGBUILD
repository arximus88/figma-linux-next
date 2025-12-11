# Maintainer: Figma-Linux Contributors
# Optimized for Arch Linux and CachyOS with system-integrated Electron

pkgname=figma-linux
pkgver=0.12.0
pkgrel=1
pkgdesc="Unofficial Figma desktop app for Linux with native Wayland support and GPU acceleration"
arch=('x86_64')
url="https://github.com/Figma-Linux/figma-linux"
license=('MIT')
depends=(
  'electron'
  'hicolor-icon-theme'
)
makedepends=(
  'npm'
  'nodejs'
  'typescript'
  'rollup'
)
optdepends=(
  'libappindicator-gtk3: for system tray icon support'
  'libnotify: for desktop notifications'
)
provides=('figma-linux')
conflicts=('figma-linux-bin' 'figma-linux-git')
source=(
  "figma-linux-$pkgver.tar.gz::https://github.com/Figma-Linux/figma-linux/archive/refs/tags/v$pkgver.tar.gz"
  "figma-linux.desktop"
  "figma-linux-launcher.sh"
)
sha256sums=(
  'SKIP'
  'SKIP'
  'SKIP'
)

prepare() {
  cd "$srcdir/$pkgname-$pkgver"

  # Remove bundled electron - we use system electron
  # This is critical for CachyOS optimization
  sed -i '/"electron":/d' package.json

  # Install dependencies (dev dependencies only, no electron)
  npm install --ignore-scripts
}

build() {
  cd "$srcdir/$pkgname-$pkgver"

  # Build the application
  npm run build

  # Clean up source maps for production
  find dist -name "*.map" -delete
}

package() {
  cd "$srcdir/$pkgname-$pkgver"

  # Create application directory
  install -d "$pkgdir/usr/lib/$pkgname"

  # Install application files
  cp -r dist "$pkgdir/usr/lib/$pkgname/"
  cp -r resources "$pkgdir/usr/lib/$pkgname/"
  cp -r lib "$pkgdir/usr/lib/$pkgname/" 2>/dev/null || true
  cp package.json "$pkgdir/usr/lib/$pkgname/"

  # Install the optimized launcher script
  install -Dm755 "$srcdir/figma-linux-launcher.sh" "$pkgdir/usr/bin/figma-linux"

  # Install desktop entry
  install -Dm644 "$srcdir/figma-linux.desktop" \
    "$pkgdir/usr/share/applications/figma-linux.desktop"

  # Install icons
  for size in 16 24 32 48 64 128 256 512; do
    if [ -f "resources/icons/${size}x${size}.png" ]; then
      install -Dm644 "resources/icons/${size}x${size}.png" \
        "$pkgdir/usr/share/icons/hicolor/${size}x${size}/apps/figma-linux.png"
    fi
  done

  # Install license
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"

  # Install documentation
  install -Dm644 README.md "$pkgdir/usr/share/doc/$pkgname/README.md"
}

# vim:set ts=2 sw=2 et:
