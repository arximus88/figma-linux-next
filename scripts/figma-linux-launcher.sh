#!/bin/bash
# figma-linux-next Optimized Launcher
# Smart launcher for CachyOS/Arch with Wayland and GPU optimizations

# Detect Wayland session
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "Detected Wayland session - enabling native Wayland support"
    OZONE_FLAGS="--ozone-platform-hint=auto --enable-features=UseOzonePlatform,WaylandWindowDecorations"
else
    echo "Detected X11 session"
    OZONE_FLAGS=""
fi

# Performance & GPU Optimization Flags
# These flags are critical for CachyOS users to ensure full GPU utilization
PERF_FLAGS="--ignore-gpu-blocklist \
            --enable-gpu-rasterization \
            --enable-zero-copy \
            --enable-features=VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization \
            --enable-accelerated-2d-canvas \
            --enable-webgl \
            --enable-webgl2-compute-context \
            --disable-smooth-scrolling"

# Memory optimization flags
MEMORY_FLAGS="--js-flags='--max-old-space-size=4096' \
              --disk-cache-size=104857600"

# Security flags (maintain sandbox)
SECURITY_FLAGS="--no-sandbox-warnings"

# Debug mode (optional - uncomment for debugging)
# DEBUG_FLAGS="--enable-logging --v=1"

# Determine electron binary location
# Prefer system electron for CachyOS optimizations
if command -v electron &> /dev/null; then
    ELECTRON_BIN="electron"
elif [ -f "/usr/bin/electron" ]; then
    ELECTRON_BIN="/usr/bin/electron"
elif [ -f "/usr/lib/electron/electron" ]; then
    ELECTRON_BIN="/usr/lib/electron/electron"
else
    echo "Error: Electron binary not found!"
    echo "Please install electron: sudo pacman -S electron"
    exit 1
fi

# Determine app path
if [ -f "/usr/lib/figma-linux-next/dist/main/main.js" ]; then
    APP_PATH="/usr/lib/figma-linux-next"
elif [ -f "/opt/figma-linux-next/resources/app/dist/main/main.js" ]; then
    APP_PATH="/opt/figma-linux-next/resources/app"
elif [ -f "./dist/main/main.js" ]; then
    # Development mode
    APP_PATH="."
else
    echo "Error: figma-linux-next app not found!"
    exit 1
fi

# Launch with optimized flags
echo "Launching figma-linux-next with optimizations..."
echo "Electron: $ELECTRON_BIN"
echo "App path: $APP_PATH"

exec "$ELECTRON_BIN" "$APP_PATH" \
    $OZONE_FLAGS \
    $PERF_FLAGS \
    $MEMORY_FLAGS \
    $SECURITY_FLAGS \
    "$@"
