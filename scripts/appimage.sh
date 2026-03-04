#!/bin/bash

APP_DIR="./build/installers/linux-unpacked";

ARCH=`uname -m | tr -d '\n'`;
VER=`cat ./build/installers/version`;

echo "ARCH: $ARCH, VER: $VER";

if [ $ARCH == "aarch64" ]; then
  APP_DIR="./build/installers/linux-arm64-unpacked";
fi

echo "APP_DIR: $APP_DIR";

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: It need run after electron-builder";
  exit 1;
fi

echo "$DESKTOP_FILE" > "$APP_DIR/figma-linux-next.desktop";
chmod a+x "./resources/AppRun"
cat "./resources/figma-linux-next-appimage.desktop" > "$APP_DIR/figma-linux-next.desktop";
cp -rf "./resources/AppRun" "$APP_DIR/AppRun";
cp -rf "./resources/icons/256x256.png" "$APP_DIR/figma-linux-next.png";
cp -rf "./resources/icons" "$APP_DIR/";
chmod a+x "$APP_DIR/AppRun"
chmod a+x "$APP_DIR/figma-linux-next"
chmod a+x "$APP_DIR/chrome-sandbox"
chmod a+x "$APP_DIR/*.sh"

cd "$APP_DIR";

appimagetool ./ ../figma-linux-next-${VER}_${ARCH}.AppImage --appimage-extract-and-run
