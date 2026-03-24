---
name: figma-linux-next-build
description: |
  Build, packaging, and release skill for the figma-linux-next project.
  Use this skill when working on: creating releases, bumping versions, building packages (deb/rpm/pacman/AppImage/zip/flatpak/snap), CI/CD workflows (.github/workflows/), AUR packages, Launchpad PPA, or any publishing/distribution task. Also use when asked to "build", "release", "package", "publish", or "ship" figma-linux-next.
---

# figma-linux-next Build & Release Reference

## Quick Commands

```bash
bun run build          # Vite build → dist/ (required before packaging)
bun run pack           # Full release build: clean → build → electron-builder all targets
bun run pack:pacman    # Pacman-only package
bun run builder        # electron-builder only (skips Vite build)
bun run local:install  # Install to /opt/figma-linux-next for manual testing
bun run cln            # Clean dist/

# Release prep
perl scripts/bump_version.pl 0.13.1   # bump version + tag + commit
# NOTE: bump_version.pl reads current version from latest git tag (not package.json)
# After running, manually verify package.json and src/package.json have correct version
# If they don't match (tag was alpha), fix manually:
#   sed -i 's/"version": "OLD"/"version": "NEW"/' package.json src/package.json
#   git add package.json src/package.json && git commit --amend --no-edit
#   git tag -d vNEW && git tag -a vNEW -m "Publish vNEW release"

perl scripts/generate_release_notes.pl --latest        # markdown
perl scripts/generate_release_notes.pl --latest --html # Flathub HTML format
```

---

## Build Pipeline

```
bun run build
  1. bun run cln                          → rm -rf dist/
  2. vite build                           → dist/main/main.js + dist/renderer/
  3. cp src/package.json dist/package.json
  4. bun install --production (in dist/)  → dist/node_modules/

bun run pack
  1. All of the above
  2. chmod +x resources/AppRun
  3. electron-builder --linux             → build/installers/
```

Build outputs go to **`build/installers/`**, not `dist/`.

---

## Package Targets

Configured in **`config/builder.json`**:

| Format | Arch | Notes |
|---|---|---|
| DEB | x64, arm64 | `libgtk-3-0`, `libnss3`, `libdrm2`, `libgbm1` deps |
| RPM | x64, arm64 | `gtk3`, `nss`, `libXtst` deps |
| Pacman | x64 only | No arm64 variant for Arch repos |
| AppImage | x64, arm64 | Uses `resources/AppRun` launcher |
| ZIP | x64, arm64 | Portable archive, uploaded to GitHub Releases |

App ID: `com.figma.FigmaLinuxNext` — registers `.fig` file association and `figma://` protocol.

---

## Two `package.json` Files — Keep in Sync

| File | Role |
|---|---|
| `package.json` | Dev manifest — all deps + devDeps |
| `src/package.json` | **Production manifest** — runtime deps only, copied to `dist/` |

When bumping a runtime dep version: update **both**. Dev-only deps (vite, eslint, playwright…) go in root only.

---

## Release Checklist

1. `bun test src/` — all tests pass
2. `bun run package` — all 8 build targets succeed locally
3. `perl scripts/bump_version.pl X.Y.Z` — creates commit + tag
4. Verify `package.json` and `src/package.json` have correct version (fix + amend if needed)
5. Validate workflow before pushing: `/home/arx/go/bin/actionlint .github/workflows/release.yml`
6. `git push origin dev && git push origin vX.Y.Z`

---

## CI/CD Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `release.yml` | Tag `v*.*.*` | Build all packages, GitHub Release, AUR push |
| `ci.yml` | Push to `dev`/`staging` | Runs `bun test src/` |
| `push_aur_dev_git.yml` | **Manual only** (`workflow_dispatch`) | Updates `figma-linux-next-dev-git` AUR |
| `manualrun_aur.yml` | Manual | Push all AUR packages |
| `manualrun_flathub.yml` | Manual | Publish to Flathub |
| `manualrun_launchpad.yml` | Manual | Upload to Launchpad (with revision input) |
| `remove_artefacts.yml` | Manual | Clean up old CI artifacts |

### release.yml jobs

```
build (ubuntu-latest)
  apt: rpm fakeroot
  bunx electron-builder → deb, rpm, AppImage, zip (x64 + arm64)

build-pacman (archlinux container)
  pacman: bun nodejs base-devel fakeroot libxcrypt-compat
  bunx electron-builder → .pacman (x64 only)

release
  merge artifacts → SHA256SUMS → softprops/action-gh-release@v2

aur (archlinux container)
  SSH key from ID_RSA secret → git clone aur.archlinux.org/figma-linux-next
  update PKGBUILD (pkgver + sha256 via scripts/update_pkgbuild_sha256.py)
  makepkg --printsrcinfo → .SRCINFO (runs as non-root 'builder' user)
  git push → AUR
```

---

## AUR Repository

Local AUR repo: `/home/arx/aur/figma-linux-next/`
Remote: `ssh://aur@aur.archlinux.org/figma-linux-next.git`

CI updates AUR automatically on release. Manual update:
```bash
cd /home/arx/aur/figma-linux-next
# edit PKGBUILD (pkgver, sha256sums)
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "Update to vX.Y.Z"
git push
```

**PKGBUILD sources:** tarball from GitHub + `figma-linux-next.desktop` + `figma-linux-next-launcher.sh`
**sha256sums:** first entry = tarball sha256, others = SKIP (local files)

---

## Required GitHub Secrets

| Secret | Used for | Notes |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Releases API | Automatic, no setup needed |
| `ID_RSA` (base64) | SSH key for AUR push | CI-dedicated key (`~/.ssh/id_ed25519_aur_ci`), registered on AUR only |
| `USER_NAME` | Git committer name for AUR commits | e.g. `Borys Kharchenko` |
| `EMAIL` | Git committer email for AUR commits | |

**SSH key setup:** CI uses a dedicated key separate from personal key.
- Personal key: `~/.ssh/id_ed25519` (GitHub + AUR personal access)
- CI key: `~/.ssh/id_ed25519_aur_ci` (AUR only, base64 stored in `ID_RSA` secret)

**Encoding for GitHub Secret:** `base64 -w0 ~/.ssh/id_ed25519_aur_ci` — copy output WITHOUT trailing `%` (zsh prompt artifact).

---

## Workflow Validation

Always validate before pushing workflow changes:
```bash
/home/arx/go/bin/actionlint .github/workflows/release.yml
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

Common pitfalls:
- Multi-line Python in `run: |` — use external script (`scripts/update_pkgbuild_sha256.py`) instead
- `$1` in perl regex inside double-quoted shell string — shell eats it, use Python instead
- `bunx electron-builder` not `electron-builder` (not in PATH in CI)
- archlinux container needs `libxcrypt-compat` for fpm/ruby
- `makepkg --printsrcinfo` requires non-root user — use `useradd -m builder && su builder -c`
- SSH `known_hosts` in archlinux container: use `/root/.ssh/` explicitly, set `GIT_SSH_COMMAND`

---

## Artifacts Layout

```
build/installers/
├── figma-linux-next_<ver>_linux_amd64.deb
├── figma-linux-next_<ver>_linux_arm64.deb
├── figma-linux-next_<ver>_linux_x86_64.rpm
├── figma-linux-next_<ver>_linux_aarch64.rpm
├── figma-linux-next_<ver>_linux_x64.pacman
├── figma-linux-next_<ver>_linux_x86_64.AppImage
├── figma-linux-next_<ver>_linux_arm64.AppImage
├── figma-linux-next_<ver>_linux_x64.zip
├── figma-linux-next_<ver>_linux_arm64.zip
└── SHA256SUMS
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| `config/builder.json` | electron-builder targets, app metadata, file associations |
| `vite.config.ts` | Vite build config (main + renderer bundles) |
| `package.json` / `src/package.json` | Dev / production manifests |
| `/home/arx/aur/figma-linux-next/PKGBUILD` | AUR package definition (separate repo) |
| `scripts/bump_version.pl` | Version bump + tag automation |
| `scripts/generate_release_notes.pl` | Changelog from git log |
| `scripts/update_pkgbuild_sha256.py` | Updates first sha256sums entry in PKGBUILD |
| `scripts/debian/` | Debian control files for PPA |
| `.github/workflows/` | All CI/CD automation |
| `resources/AppRun` | AppImage entry point |
| `resources/icons/` | Multi-size icons (16–512px) |
