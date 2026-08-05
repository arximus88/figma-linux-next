---
name: figma-linux-next-build
description: |
  Build, packaging, and release skill for the figma-linux-next project.
  Use this skill when working on: creating releases, bumping versions, building packages (deb/rpm/pacman/AppImage/zip), CI/CD workflows (.github/workflows/), AUR packages, or any publishing/distribution task. Also use when asked to "build", "release", "package", "publish", or "ship" figma-linux-next.
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

# Release prep (run on staging, NOT on dev)
perl scripts/bump_version.pl 0.13.4   # bump version + commit + tag on staging
# NOTE: bump_version.pl reads current version from latest git tag (not package.json)
# After running, verify package.json and src/package.json have correct version
# If they don't match, fix manually:
#   sed -i 's/"version": "OLD"/"version": "NEW"/' package.json src/package.json
#   git add package.json src/package.json && git commit --amend --no-edit
#   git tag -d vNEW && git tag -a vNEW -m "Publish vNEW release"

perl scripts/generate_release_notes.pl --latest        # markdown preview
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

App ID: `app.borys.FigmaLinuxNext` — registers `.fig` file association and `figma://` protocol.

---

## Two `package.json` Files — Keep in Sync

| File | Role |
|---|---|
| `package.json` | Dev manifest — all deps + devDeps |
| `src/package.json` | **Production manifest** — runtime deps only, copied to `dist/` |

When bumping a runtime dep version: update **both**. Dev-only deps (vite, eslint, playwright…) go in root only.

---

## Branching Strategy

```
staging  ←── all features, fixes, and daily work
   ↓ PR (CI must pass, 0 approvals required)
  dev     ←── stable, protected — merge only via PR from staging
```

- **`dev`** is branch-protected: no direct pushes, no force pushes, CI required
- **`staging`** is where all work happens, including version bumps
- Tags are created on `staging` **locally**, but pushed to remote **only after** staging merges to dev
- `enforce_admins: false` — owner can bypass in emergencies

---

## Release Flow (step by step)

> **Rule:** tag push triggers the release. The tag must be pushed **after** staging is merged into dev — so release only goes out when dev is already updated.

### 1. Prepare staging
```bash
# Ensure staging is clean and all changes are committed
git status
git push origin staging
```

### 2. Update CHANGELOG.md
Add a `## [X.Y.Z]` section at the top with the new version's changes.
Commit it: `git commit -m "chore(release): update CHANGELOG for vX.Y.Z"`

### 3. Bump version on staging (local tag only)
```bash
perl scripts/bump_version.pl X.Y.Z
# Creates: version bump commit + vX.Y.Z tag LOCALLY on staging
# Verify package.json and src/package.json both show X.Y.Z
```

### 4. Push staging branch only (NOT the tag yet)
```bash
git push origin staging
# Do NOT push the tag here — release must not go out before dev is updated
```

### 5. Create PR: staging → dev
```bash
gh pr create --base dev --head staging \
  --title "chore(release): vX.Y.Z" \
  --body "Merge staging into dev for vX.Y.Z release."
```

### 6. Wait for CI, merge PR
CI runs unit tests on the PR. Once green — merge.

### 7. Push the tag — this triggers the release
```bash
git push origin vX.Y.Z
```
⚠️ **Only now** does `release.yml` trigger. At this point dev is already updated.
- Builds all 9 packages (deb×2, rpm×2, AppImage×2, zip×2, pacman×1)
- Creates GitHub Release with release notes from CHANGELOG.md
- Pushes updated PKGBUILD to AUR

---

## Release Checklist

- [ ] All changes committed and pushed to staging
- [ ] CHANGELOG.md updated with `## [X.Y.Z]` section
- [ ] `perl scripts/bump_version.pl X.Y.Z` — verify both package.json files
- [ ] `git push origin staging && git push origin vX.Y.Z`
- [ ] PR created: staging → dev
- [ ] CI green on PR
- [ ] PR merged
- [ ] GitHub Release visible at `github.com/arximus88/figma-linux-next/releases`
- [ ] AUR updated: `https://aur.archlinux.org/packages/figma-linux-next`

---

## CI/CD Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `release.yml` | Tag `v*.*.*` pushed | Build all 9 packages, GitHub Release, AUR push |
| `ci.yml` | Push/PR to `dev`/`staging` | Type check, lint, unit tests |
| `push_aur_dev_git.yml` | Manual (`workflow_dispatch`) | Updates `figma-linux-next-dev-git` AUR |
| `remove_artefacts.yml` | Manual | Clean up old CI artifacts |

### release.yml jobs

```
build-x64 (ubuntu-latest)
  apt: rpm fakeroot
  bunx electron-builder → deb, rpm, AppImage, zip (x64)

build-arm64 (ubuntu-24.04-arm)
  apt: rpm fakeroot
  bunx electron-builder → deb, rpm, AppImage, zip (arm64)

build-pacman (archlinux container)
  pacman: bun nodejs base-devel fakeroot libxcrypt-compat
  bunx electron-builder → .pacman (x64 only)

release (needs all build-* jobs)
  merge artifacts → SHA256SUMS → softprops/action-gh-release@v2
  release notes extracted from CHANGELOG.md

aur (needs release, archlinux container)
  SSH key from ID_RSA secret → git clone aur.archlinux.org/figma-linux-next
  update PKGBUILD (pkgver + sha256 via scripts/update_pkgbuild_sha256.py)
  makepkg --printsrcinfo → .SRCINFO (runs as non-root 'builder' user)
  git push → AUR

aur-bin (needs release, archlinux container)
  same, against figma-linux-next-bin, hashing the release zip

flake (needs release)
  checkout staging → sha256 of both release zips → SRI
  scripts/update_flake_release.py VERSION SHA_X64 SHA_ARM64 flake.nix
  commit + push → staging
```

**flake.nix is CI-owned.** Version and hashes live in one `release = { … }` block and are
rewritten together — the hashes only exist after the binaries are built, so this cannot be
part of `bump_version.pl`. Editing the version there by hand produces a flake that names one
release while carrying another's hashes, which fails every `nix build`. The commit goes to
`staging` because `dev` is protected, so the flake in `dev` is one release behind.

---

## AUR Repository

Local AUR repo: `/home/arx/aur/figma-linux-next/`
Remote: `ssh://aur@aur.archlinux.org/figma-linux-next.git`

CI updates AUR automatically on tag push. Manual update:
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
| `scripts/bump_version.pl` | Version bump + tag automation (run on staging) |
| `scripts/generate_release_notes.pl` | Changelog from git log (preview only) |
| `scripts/update_pkgbuild_sha256.py` | Updates first sha256sums entry in PKGBUILD |
| `.github/workflows/` | All CI/CD automation |
| `resources/AppRun` | AppImage entry point |
| `resources/icons/` | Multi-size icons (16–512px) |
