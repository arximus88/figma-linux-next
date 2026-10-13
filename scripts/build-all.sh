#!/bin/bash
set -uo pipefail

# Build every Linux installer format from the local tree into build/installers.
#
# The app is built once, then electron-builder runs per format/arch. Not via
# `bun run package`: that script wipes build/installers and rebuilds each time,
# so only the last format would survive. Success is electron-builder's exit
# code — not grepping its output for "error". A failed format does not stop
# the others; the summary lists it and the script exits non-zero.

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

BUILD_DIR="build/installers"
VERSION=$(bun -p "require('./package.json').version")
FORMATS=("deb" "rpm" "AppImage")
ARCHITECTURES=("x64")

# electron-builder downloads the arm64 Electron itself; no cross toolchain needed.
if [ "${WITH_ARM64:-0}" = "1" ]; then
    ARCHITECTURES+=("arm64")
fi

echo "🚀 figma-linux-next $VERSION — formats: ${FORMATS[*]}, arch: ${ARCHITECTURES[*]}"
echo ""

set -e
rm -rf "$BUILD_DIR" dist node_modules/.cache
bun install
bun run build
set +e

failed=()
for arch in "${ARCHITECTURES[@]}"; do
    for format in "${FORMATS[@]}"; do
        echo "📦 $format ($arch)"
        if bunx electron-builder --config=config/builder.json --linux "$format" "--$arch"; then
            echo -e "${GREEN}✓${NC} $format ($arch)"
        else
            echo -e "${RED}✗${NC} $format ($arch)"
            failed+=("$format/$arch")
        fi
    done
done

echo ""
shopt -s nullglob
packages=("$BUILD_DIR"/*.deb "$BUILD_DIR"/*.rpm "$BUILD_DIR"/*.AppImage)
if [ ${#packages[@]} -gt 0 ]; then
    ls -lh "${packages[@]}"
    (cd "$BUILD_DIR" && sha256sum -- "${packages[@]##*/}" > SHA256SUMS)
    echo "🔐 $BUILD_DIR/SHA256SUMS"
fi

if [ ${#failed[@]} -gt 0 ]; then
    echo -e "${RED}Failed:${NC} ${failed[*]}"
    exit 1
fi
echo "🎉 All formats built."
