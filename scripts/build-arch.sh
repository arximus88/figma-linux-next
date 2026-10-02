#!/bin/bash
set -euo pipefail

# Build a pacman package from the local tree with electron-builder.
#
# There is no makepkg path here: the Arch packages are maintained in their AUR
# repositories (figma-linux-next, figma-linux-next-bin), which release.yml
# updates on every tag. A PKGBUILD copy in this repo only went stale — and
# makepkg builds the released tarball anyway, not your local changes.

BUILD_DIR="build/installers"

echo "📦 Building figma-linux-next pacman package from the local tree"
bun run pack:pacman

echo ""
echo "📦 Output:"
ls -lh "$BUILD_DIR"/*.pacman

echo ""
echo "Install:          sudo pacman -U $BUILD_DIR/figma-linux-next-*.pacman"
echo "Released package: yay -S figma-linux-next   (or figma-linux-next-bin)"
