#!/bin/bash
set -e

# figma-linux-next Arch Linux Build Script

echo "📦 Building figma-linux-next Arch package (pacman)"
echo "==================================================="
echo ""

if [ "$1" == "--native" ]; then
    echo "🔹 Method: Native (makepkg)"
    echo "⚠️  Note: This uses the PKGBUILD which pulls release sources by default."
    echo "    To test LOCAL changes, use the default method (Electron-Builder)."
    echo ""
    makepkg -si
else
    echo "🔹 Method: Electron-Builder (via bun)"
    echo "    (Builds from local source - best for testing changes)"
    echo ""
    bun run pack:pacman
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
echo "  sudo pacman -U $BUILD_DIR/figma-linux-next-*.pacman"
echo ""
echo "To build native system package (if preferred):"
echo "  ./scripts/build-arch.sh --native"
echo ""
