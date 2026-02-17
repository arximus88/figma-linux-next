#!/bin/bash
set -e

# Figma-Linux Arch Linux Build Script

echo "📦 Building Figma-Linux Arch package (pacman)"
echo "============================================"
echo ""

# Check if makepkg is installed (implies Arch-based system usually, but we use electron-builder via npm mostly)
# However, the user might want to use the PKGBUILD.
# The package.json script "pack:pacman" uses electron-builder.
# Let's support both or default to npm script which is more reliable for electron apps usually unless PKGBUILD is strictly preferred.

# Check if we should use PKGBUILD (native system build) or Electron-Builder (bundled)
# For testing local changes effectively on Arch/CachyOS with system optimizations,
# we might want to modify PKGBUILD to use local source, but that's complex.
# The standard "dev" way is electron-builder.

if [ "$1" == "--native" ]; then
    echo "🔹 Method: Native (makepkg)"
    echo "⚠️  Note: This uses the PKGBUILD which pulls release sources by default."
    echo "    To test LOCAL changes, use the default method (Electron-Builder)."
    echo ""
    makepkg -si
else
    echo "🔹 Method: Electron-Builder (via npm)"
    echo "    (Builds from local source - best for testing changes)"
    echo ""
    npm run pack:pacman
fi

BUILD_DIR="build/installers"

echo ""
echo "✅ Build process finished."
echo ""
echo "📦 Output:"
ls -lh $BUILD_DIR/*.pacman 2>/dev/null || true
ls -lh *.pkg.tar.zst 2>/dev/null || true

echo ""
echo "To install (Electron-Builder):"
echo "  sudo pacman -U $BUILD_DIR/figma-linux-*.pacman"
echo ""
echo "To build native system package (if preferred):"
echo "  ./scripts/build-arch.sh --native"
echo ""
