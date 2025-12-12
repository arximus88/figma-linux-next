#!/bin/bash
set -e

# Figma-Linux Snap Build Script

echo "📦 Building Figma-Linux Snap package"
echo "====================================="
echo ""

# Check if snapcraft is installed
if ! command -v snapcraft &> /dev/null; then
    echo "❌ snapcraft is not installed"
    echo "Install with: sudo snap install snapcraft --classic"
    exit 1
fi

# Clean previous builds
echo "🧹 Cleaning previous snap builds..."
snapcraft clean

# Build snap for current architecture
echo "🔨 Building snap package..."
snapcraft

# Get the generated snap file
SNAP_FILE=$(ls *.snap 2>/dev/null | head -n 1)

if [ -f "$SNAP_FILE" ]; then
    echo ""
    echo "✅ Snap package built successfully!"
    echo "📦 Package: $SNAP_FILE"
    echo "📊 Size: $(du -h $SNAP_FILE | cut -f1)"
    echo ""
    echo "To install locally:"
    echo "  sudo snap install $SNAP_FILE --dangerous"
    echo ""
    echo "To publish to Snap Store:"
    echo "  snapcraft login"
    echo "  snapcraft upload $SNAP_FILE --release stable"
else
    echo "❌ Failed to build snap package"
    exit 1
fi
