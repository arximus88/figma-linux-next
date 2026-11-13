#!/usr/bin/env bash
# First-login test for an Electron bump (see "Electron version is exact" in CLAUDE.md).
#
# Starts the app on a clean profile, points figma:// at that instance for the
# duration, and after you quit says whether the session cookie landed.
#
#   scripts/oauth-login-test.sh            # the packaged build (build/installers/linux-unpacked)
#   scripts/oauth-login-test.sh --dist     # node_modules Electron + dist/main/main.js
#   scripts/oauth-login-test.sh --keep     # leave the profile on disk afterwards
#
# Log in, wait for the file browser, quit with Ctrl+Q. Everything it changed is
# put back on exit; the profile (it holds your session cookie) is deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=packaged
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --dist) MODE=dist ;;
    --keep) KEEP=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = packaged ]; then
  BIN="$ROOT/build/installers/linux-unpacked/figma-linux-next"
  [ -x "$BIN" ] || {
    echo "No packaged build. Run: bun run build && bunx electron-builder --config=config/builder.json -l --x64 --dir" >&2
    exit 1
  }
  CMD=("$BIN")
else
  [ -f "$ROOT/dist/main/main.js" ] || { echo "No build. Run: bun run build" >&2; exit 1; }
  CMD=("$ROOT/node_modules/electron/dist/electron" "$ROOT/dist/main/main.js")
fi

PROFILE="$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/fln-login-test.XXXXXX")"
APPS="$HOME/.local/share/applications"
ENTRY="$APPS/figma-linux-next.desktop"
BACKUP="$ENTRY.before-login-test"
SYSTEM_ENTRY=/usr/share/applications/figma-linux-next.desktop

# The default browser mapping lives here; without it gio opens the login in an arbitrary browser.
[ -f "$HOME/.config/mimeapps.list" ] && cp "$HOME/.config/mimeapps.list" "$PROFILE/"

# Shadow the installed entry so the browser's figma:// redirect reaches this instance.
# A second entry does not work: Firefox keeps its own handler list and offers the installed one.
mkdir -p "$APPS"
[ -e "$ENTRY" ] && mv "$ENTRY" "$BACKUP"
EXEC="env -u ELECTRON_RUN_AS_NODE XDG_CONFIG_HOME=$PROFILE ${CMD[*]}"
if [ -f "$SYSTEM_ENTRY" ]; then
  sed -E "s|^Exec=figma-linux-next(.*)$|Exec=$EXEC\1|" "$SYSTEM_ENTRY" > "$ENTRY"
else
  cat > "$ENTRY" <<EOF
[Desktop Entry]
Name=Figma Linux Next
Exec=$EXEC %U
Type=Application
MimeType=x-scheme-handler/figma;
EOF
fi
update-desktop-database "$APPS" 2>/dev/null || true

APP_PID=
cleanup() {
  trap - EXIT INT TERM
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null && wait "$APP_PID" 2>/dev/null || true
  rm -f "$ENTRY"
  [ -e "$BACKUP" ] && mv "$BACKUP" "$ENTRY"
  update-desktop-database "$APPS" 2>/dev/null || true

  local cookies="$PROFILE/figma-linux-next/Cookies" found=0
  if [ -f "$cookies" ]; then
    found="$(sqlite3 "file:$cookies?immutable=1" \
      "select count(*) from cookies where name='__Host-figma.authn'" 2>/dev/null || echo 0)"
  fi
  echo
  if [ "$found" -gt 0 ]; then
    echo "PASS: __Host-figma.authn is in the profile, first login works."
  else
    echo "FAIL: no __Host-figma.authn cookie. Either the login was not finished or /app_auth/redeem was rejected."
    echo "      Log: $PROFILE/figma-linux-next/logs/figma-linux-next.log (run again with --keep to read it)"
  fi
  if [ "$KEEP" = 1 ]; then
    echo "Profile kept: $PROFILE (holds a session cookie, delete it when done)"
  else
    rm -rf "$PROFILE"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "Binary:  ${CMD[*]}"
echo "Profile: $PROFILE"
echo "figma:// links open in this instance until it quits."
echo "Log in, wait for the file browser, then quit with Ctrl+Q."
env -u ELECTRON_RUN_AS_NODE XDG_CONFIG_HOME="$PROFILE" "${CMD[@]}" >/dev/null 2>&1 &
APP_PID=$!
wait "$APP_PID" || true
APP_PID=
