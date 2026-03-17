---
name: figma-linux-next-build
description: |
  Build, packaging, and release skill for the figma-linux-next project.
  Use this skill when working on: creating releases, bumping versions, building packages (deb/rpm/pacman/AppImage/zip/flatpak/snap), CI/CD workflows (.github/workflows/), Docker build images, AUR packages, Launchpad PPA, or any publishing/distribution task. Also use when asked to "build", "release", "package", "publish", or "ship" figma-linux-next.
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
perl scripts/bump_version.pl 0.14.0   # bump version + tag + commit
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

## Distribution Channels

### GitHub Releases
Triggered automatically on tag push `v*.*.*`. Uploads all `build/installers/` artifacts + SHA256SUMS.

### AUR (Arch User Repository)
Three packages:
- `figma-linux-next` — binary release
- `figma-linux-next-bin` — pre-built binary
- `figma-linux-next-dev-git` — **auto-updated on every `dev` branch push**

PKGBUILD: `PKGBUILD` in project root. Uses system Electron (strips bundled electron). Conflicts with `figma-linux`, `figma-linux-bin`, `figma-linux-git`.

Manual trigger: `.github/workflows/manualrun_aur.yml`

### Flatpak / Flathub
Manifest: `com.figma.FigmaLinux.yml`
- Runtime: `org.freedesktop.Platform` 23.08
- Base: `org.electronjs.Electron2.BaseApp` 23.08
- Permissions: X11, Wayland, DRI (GPU), network, home, notifications

Manual trigger: `.github/workflows/manualrun_flathub.yml`

### Launchpad PPA (Ubuntu/Debian)
Built inside Docker (`4tqrgqe5yrgfd/figma-linux-docker-image-ppa:latest`). Signs with GPG, uploads via `dput`.

Requires secrets: `GPG_PUB_KEY`, `GPG_SECRET_KEY`, `GPG_PASSPHRASE_KEY`

Manual trigger: `.github/workflows/manualrun_launchpad.yml` (inputs: `revision` number)

### Snap
Config: `snapcraft.yaml` — base `core22`, strict confinement, amd64 + arm64.

---

## CI/CD Workflows Overview

| Workflow | Trigger | What it does |
|---|---|---|
| `release.yml` | Tag `v*.*.*` | Full release: build amd64 + arm64 (Docker), GitHub Release, AUR ×3, Flathub, Launchpad |
| `push_aur_dev_git.yml` | Push to `dev` | Updates `figma-linux-next-dev-git` AUR |
| `manualrun_aur.yml` | Manual | Push all AUR packages |
| `manualrun_flathub.yml` | Manual | Publish to Flathub |
| `manualrun_launchpad.yml` | Manual | Upload to Launchpad (with revision input) |
| `update_assets.yml` | Manual | Rebuild + re-release on dev |
| `update_amd64_assets.yml` | Manual | Rebuild amd64 only |
| `remove_artefacts.yml` | Manual | Clean up old CI artifacts |

---

## Docker Build Images

Located in `docker/`. Used by CI and locally via `scripts/build_artefacts.sh`:

| Dockerfile | Image | Purpose |
|---|---|---|
| `Build_artefacts_local` | `figma-linux-docker-image:latest` | x86_64 build from local source |
| `Build_artefacts_arm64v8` | `figma-linux-docker-image-arm:latest` | ARM64 build (uses QEMU in CI) |
| `Build_artefacts_repo` | `figma-linux-docker-image:latest` | x86_64 build cloned from GitHub |
| `Build_ppa` | `figma-linux-docker-image-ppa:latest` | Launchpad source package + dput |

Run locally:
```bash
scripts/build_artefacts.sh local    # build from local source in Docker
scripts/build_artefacts.sh repo     # clone from GitHub and build
```

---

## Version Bump Checklist

`perl scripts/bump_version.pl <version>` handles everything automatically:

1. Updates `package.json`, `src/package.json`, `snapcraft.yaml`, `com.figma.FigmaLinux.yml`
2. Generates `release_notes` file
3. Updates `scripts/debian/changelog`
4. Creates commit `Release v<version>` + annotated tag `v<version>`

Then push tag to trigger full release:
```bash
git push origin dev
git push origin v0.14.0
```

---

## Required GitHub Secrets

| Secret | Used for |
|---|---|
| `GITHUB_TOKEN` | GitHub Releases API |
| `ID_RSA` (base64) | SSH key for AUR push |
| `USER_NAME`, `EMAIL` | Git committer identity |
| `ACTION_TOKEN` | Flathub action |
| `GPG_PUB_KEY`, `GPG_SECRET_KEY`, `GPG_PASSPHRASE_KEY` (base64) | PPA signing |
| `DOCKER_USERNAME`, `DOCKER_PASSWORD` | DockerHub |

---

## Artifacts Layout

```
build/installers/
├── figma-linux-next_<ver>_linux_amd64.zip
├── figma-linux-next_<ver>_linux_arm64.zip
├── figma-linux-next_<ver>_linux_amd64.deb
├── figma-linux-next_<ver>_linux_arm64.deb
├── figma-linux-next-<ver>.x86_64.rpm
├── figma-linux-next-<ver>.aarch64.rpm
├── figma-linux-next_<ver>_linux_x64.pacman
├── figma-linux-next-<ver>-x86_64.AppImage
├── figma-linux-next-<ver>-aarch64.AppImage
├── SHA256SUMS
└── version
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| `config/builder.json` | electron-builder targets, app metadata, file associations |
| `vite.config.ts` | Vite build config (main + renderer bundles) |
| `package.json` / `src/package.json` | Dev / production manifests |
| `PKGBUILD` | Arch Linux package definition |
| `com.figma.FigmaLinux.yml` | Flatpak manifest |
| `snapcraft.yaml` | Snap package config |
| `scripts/bump_version.pl` | Version bump + tag automation |
| `scripts/generate_release_notes.pl` | Changelog from git log |
| `scripts/debian/` | Debian control files for PPA |
| `docker/` | Build container Dockerfiles |
| `.github/workflows/` | All CI/CD automation |
| `resources/AppRun` | AppImage entry point |
| `resources/icons/` | Multi-size icons (16–512px) |
