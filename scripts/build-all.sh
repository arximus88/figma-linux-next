#!/bin/bash
set -e

# Figma-Linux Build Script v0.12.0
# Builds all package formats for supported architectures

echo "🚀 Figma-Linux Multi-Format Build Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUILD_DIR="build/installers"
VERSION=$(node -p "require('./package.json').version")

echo "Version: $VERSION"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf build/installers dist node_modules/.cache
echo -e "${GREEN}✓${NC} Clean complete"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Build application
echo "🔨 Building application..."
npm run build
echo -e "${GREEN}✓${NC} Build complete"
echo ""

# Function to build package
build_package() {
    local format=$1
    local arch=$2

    echo "📦 Building $format for $arch..."

    if npm run package -- --linux $format --$arch 2>&1 | grep -q "error"; then
        echo -e "${RED}✗${NC} Failed to build $format for $arch"
        return 1
    else
        echo -e "${GREEN}✓${NC} Built $format for $arch"
        return 0
    fi
}

# Build matrix
FORMATS=("deb" "rpm" "AppImage")
ARCHITECTURES=("x64")

# Check if ARM64 cross-compilation tools are available
if command -v aarch64-linux-gnu-gcc &> /dev/null; then
    ARCHITECTURES+=("arm64")
    echo -e "${GREEN}ℹ${NC} ARM64 cross-compilation tools detected"
fi

echo ""
echo "📦 Building packages..."
echo "Formats: ${FORMATS[@]}"
echo "Architectures: ${ARCHITECTURES[@]}"
echo ""

# Build all combinations
for arch in "${ARCHITECTURES[@]}"; do
    for format in "${FORMATS[@]}"; do
        build_package "$format" "$arch"
    done
done

echo ""
echo "✅ Build complete! Generated packages:"
echo ""
ls -lh $BUILD_DIR/ | grep -E '\.(deb|rpm|AppImage)$' || echo "No packages found"

echo ""
echo "📋 Package locations:"
echo "  DEB:      $BUILD_DIR/*.deb"
echo "  RPM:      $BUILD_DIR/*.rpm"
echo "  AppImage: $BUILD_DIR/*.AppImage"
echo "  PKGBUILD: ./PKGBUILD (build with: makepkg -si)"
echo ""

# Generate checksums
echo "🔐 Generating checksums..."
cd $BUILD_DIR
sha256sum *.{deb,rpm,AppImage} 2>/dev/null > SHA256SUMS || true
cd - > /dev/null
echo -e "${GREEN}✓${NC} Checksums generated: $BUILD_DIR/SHA256SUMS"
echo ""

echo "🎉 All done!"
