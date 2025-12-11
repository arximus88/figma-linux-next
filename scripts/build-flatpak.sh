#!/bin/bash
set -e

# Figma-Linux Flatpak Build Script

echo "📦 Building Figma-Linux Flatpak package"
echo "========================================"
echo ""

# Check if flatpak-builder is installed
if ! command -v flatpak-builder &> /dev/null; then
    echo "❌ flatpak-builder is not installed"
    echo "Install with:"
    echo "  Fedora: sudo dnf install flatpak-builder"
    echo "  Ubuntu: sudo apt install flatpak-builder"
    echo "  Arch:   sudo pacman -S flatpak-builder"
    exit 1
fi

# Configuration
MANIFEST="com.figma.FigmaLinux.yml"
BUILD_DIR="flatpak-build"
REPO_DIR="flatpak-repo"
BUNDLE="figma-linux.flatpak"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf $BUILD_DIR $REPO_DIR $BUNDLE

# Generate sources for offline build
echo "📦 Generating npm sources for offline build..."
if command -v flatpak-node-generator &> /dev/null; then
    flatpak-node-generator npm package-lock.json -o generated-sources.json
else
    echo "⚠️  flatpak-node-generator not found, using online build"
    echo "Install from: https://github.com/flatpak/flatpak-builder-tools"
fi

# Build the flatpak
echo "🔨 Building Flatpak..."
flatpak-builder --force-clean --repo=$REPO_DIR $BUILD_DIR $MANIFEST

# Create bundle for distribution
echo "📦 Creating bundle..."
flatpak build-bundle $REPO_DIR $BUNDLE com.figma.FigmaLinux

# Test the build
echo "🧪 Testing build..."
flatpak-builder --run $BUILD_DIR $MANIFEST figma-linux --version || true

echo ""
echo "✅ Flatpak built successfully!"
echo "📦 Bundle: $BUNDLE"
echo "📊 Size: $(du -h $BUNDLE | cut -f1)"
echo ""
echo "To install locally:"
echo "  flatpak install $BUNDLE"
echo ""
echo "To run:"
echo "  flatpak run com.figma.FigmaLinux"
echo ""
echo "To submit to Flathub:"
echo "  1. Fork https://github.com/flathub/flathub"
echo "  2. Add your manifest to the repository"
echo "  3. Submit a PR"
