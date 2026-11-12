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
perl scripts/bump_version.pl X.Y.Z    # bump version + commit + tag on staging
# NOTE: bump_version.pl takes the previous version from the latest git tag (not package.json)
# and seds it into package.json and src/package.json, then runs
# `scripts/sync_flatpak_release.py --version X.Y.Z` (Flatpak manifest tag, flatpak/package.json,
# metainfo <release>). It aborts before committing if the Flatpak step fails, and commits only
# those five files. Afterwards check:
#   rg -n '"version"' package.json src/package.json flatpak/package.json
#   python3 scripts/sync_flatpak_release.py --check

perl scripts/generate_release_notes.pl --latest        # markdown preview
perl scripts/generate_release_notes.pl --latest --html # Flathub HTML format
```

---

## Build Pipeline

```
bun run build
  1. bun run cln                          → rm -rf dist/
  2. vite build                           → dist/main/main.js, dist/*.html + dist/assets/, dist/renderer/ (preloads)
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

When bumping a runtime dep version: update **both**. Dev-only deps (vite, biome, playwright…) go in root only.

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

> **A release runs only on the owner's explicit, separate order.** Finishing a batch of work is
> not a reason to bump, push `staging`, open the PR or push a tag. Before any of it: `bun run
> build && bun run test:e2e` and a check in the live app.

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
CI runs type check, lint, unit tests, a production build, the e2e suite and the Flatpak metadata check on the PR. Once green — merge.

### 7. Push the tag — this triggers the release
```bash
git push origin vX.Y.Z
```
⚠️ **Only now** does `release.yml` trigger. At this point dev is already updated.
- Builds 9 packages (deb×2, rpm×2, AppImage×2, zip×2, pacman×1) plus an x64 `.flatpak` bundle (best effort)
- Creates GitHub Release with release notes from CHANGELOG.md
- Pushes updated PKGBUILDs to AUR (`figma-linux-next`, `figma-linux-next-bin`)
- Publishes the signed Flatpak repo to GitHub Pages
- Commits the pinned `flake.nix` and the pinned Flatpak manifest to `dev`, then `staging`

---

## Release Checklist

- [ ] All changes committed and pushed to staging
- [ ] CHANGELOG.md updated with `## [X.Y.Z]` section
- [ ] `perl scripts/bump_version.pl X.Y.Z` — verify both package.json files
- [ ] `git push origin staging` — branch only, tag stays local
- [ ] PR created: staging → dev
- [ ] CI green on PR
- [ ] PR merged
- [ ] `git push origin vX.Y.Z` — only now; this is what triggers `release.yml`
- [ ] GitHub Release visible at `github.com/arximus88/figma-linux-next/releases`
- [ ] AUR updated: `https://aur.archlinux.org/packages/figma-linux-next`
- [ ] `flake.nix` on `dev` pins vX.Y.Z (CI commit `chore(nix): pin flake to vX.Y.Z`)
- [ ] Flatpak manifest on `dev` pins the tag's commit (CI commit `chore(flatpak): pin manifest to vX.Y.Z`)
- [ ] Flatpak repo on GitHub Pages serves vX.Y.Z (`flatpak-repo` job green)

---

## CI/CD Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `release.yml` | Tag `v*.*.*` pushed | Build 9 packages + `.flatpak`, GitHub Release, AUR push, Flatpak repo, flake + Flatpak pins |
| `ci.yml` | Push/PR to `dev`/`staging` | Changelog data, type check, lint, unit tests, build, e2e (xvfb), Flatpak metadata check |
| `remove_artefacts.yml` | Manual | Clean up old CI artifacts |

Only these three exist. `push_aur_dev_git.yml` was deleted in `3c3a762`; the
`figma-linux-next-dev-git` AUR package has no automation.

### release.yml jobs

```
build-x64 (ubuntu-latest)
  apt: rpm fakeroot
  bunx electron-builder → deb, rpm, AppImage, zip (x64)

build-arm64 (ubuntu-24.04-arm)
  apt: rpm fakeroot
  bunx electron-builder → deb, rpm, AppImage, zip (arm64)

build-pacman (archlinux container)
  pacman: bun nodejs npm base-devel fakeroot libxcrypt-compat
  bunx electron-builder → .pacman (x64 only)

build-flatpak (flathub-infra container freedesktop-25.08, x64 only, continue-on-error)
  flatpak-builder on flatpak/app.borys.FigmaLinuxNext.yml → .flatpak bundle
  builds the manifest's `tag:` — sync_flatpak_release.py keeps it current

release (needs all build-* jobs)
  merge artifacts → SHA256SUMS → softprops/action-gh-release@v2
  release notes extracted from CHANGELOG.md

flatpak-repo (needs release; skipped when no bundle was built)
  pull previous repo state from Pages → import bundle → sign (FLATPAK_GPG_KEY) → prune
  write .flatpakrepo / .flatpakref / index.html → actions/deploy-pages

aur (needs release, archlinux container)
  SSH key from ID_RSA secret → git clone aur.archlinux.org/figma-linux-next
  update PKGBUILD (pkgver + sha256 via scripts/update_pkgbuild_sha256.py)
  makepkg --printsrcinfo → .SRCINFO (runs as non-root 'builder' user)
  git push → AUR

aur-bin (needs release, archlinux container)
  same, against figma-linux-next-bin, hashing the release zip

flake (needs release, RELEASE_PAT)
  checkout dev → sha256 of both release zips → SRI
  scripts/update_flake_release.py VERSION SHA_X64 SHA_ARM64 flake.nix
  commit + push → dev, then the same on staging

flatpak-pin (needs release AND flake — both push to dev)
  scripts/sync_flatpak_release.py --commit <tag sha>
  commit + push → dev, then staging
```

**`aur`, `aur-bin`, `flake`, `flatpak-repo` and `flatpak-pin` skip pre-release tags.** All five carry
`if: !contains(ref_name, '-rc') && !contains(..., '-alpha') && !contains(..., '-beta')`.
Tagging `v0.16.0-rc1` publishes a GitHub Release and nothing else — AUR and the Flatpak repo
keep serving the last stable and `flake.nix` keeps its previous pin. That is intended; a pre-release
must not become what `nix build` or `pacman -S` hands a user.

**flake.nix is CI-owned.** Version and hashes live in one `release = { … }` block and are
rewritten together — the hashes only exist after the binaries are built, so this cannot be
part of `bump_version.pl`. Editing the version there by hand produces a flake that names one
release while carrying another's hashes, which fails every `nix build`.

`dev` is written first because Nix resolves the flake from the default branch. That needs
`RELEASE_PAT` (fine-grained, `Contents: write`, expires **2027-08-05**) — `GITHUB_TOKEN`
cannot push to a protected branch. A 403 on that push means the token expired; everything
else in the release is already published by then.

---

## AUR Repository

Remotes: `ssh://aur@aur.archlinux.org/figma-linux-next.git` and `…/figma-linux-next-bin.git`

**CI owns both repos.** The `aur` and `aur-bin` jobs clone from AUR fresh on every tagged
release, rewrite their fields, and push. Nothing local is consulted.

⚠️ **Never push from a long-lived local clone.** It falls behind by one release every time
CI runs, and pushing it rolls AUR back that far — CI will not notice, because its next run
clones whatever is there and edits it in place. A clone under `/home/arx/aur/` was five
releases stale (0.13.1 vs 0.15.0 live) before this was caught. For any manual edit, clone
into a throwaway directory:

```bash
cd $(mktemp -d)
git clone ssh://aur@aur.archlinux.org/figma-linux-next.git && cd figma-linux-next
# edit PKGBUILD
makepkg --printsrcinfo > .SRCINFO    # regenerate per commit; .SRCINFO must match PKGBUILD
git commit -am "…" && git push
```

Read-only checks work over HTTPS (`https://aur.archlinux.org/figma-linux-next.git`) and the
RPC API, which is the fastest way to see what is actually published:

```bash
curl -s 'https://aur.archlinux.org/rpc/v5/info?arg[]=figma-linux-next' | python3 -m json.tool
```

During AUR maintenance the **SSH endpoint alone** goes down — `git push` fails with
"The AUR is down due to maintenance" while the web UI returns 200 and HTTPS git still
serves reads. A working website says nothing about whether you can push.

**What CI rewrites:** `pkgver`, `pkgrel`, `sha256sums`, and `license` (from `package.json`).
Every other field — `conflicts`, `depends`, `provides`, `optdepends`, `package()` — is
whatever the AUR repo already contains, so those only ever change by a manual push.

**PKGBUILD sources:** tarball from GitHub + `figma-linux-next.desktop` + `figma-linux-next-launcher.sh`
**sha256sums:** first entry = tarball sha256, others = SKIP (local files)

---

## Required GitHub Secrets

| Secret | Used for | Notes |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Releases API | Automatic, no setup needed |
| `ID_RSA` (base64) | SSH key for AUR push | CI-dedicated key (`~/.ssh/id_ed25519_aur_ci`), registered on AUR only |
| `USER_NAME` | Git committer name for AUR + flake commits | e.g. `Borys Kharchenko` |
| `EMAIL` | Git committer email for AUR + flake commits | |
| `FLATPAK_GPG_KEY` | Signing the Flatpak repo on GitHub Pages | Armored private key; public half is `flatpak/figma-linux-next-repo.gpg`. Losing it forces every install to re-add the remote. |
| `RELEASE_PAT` | Pushing the pinned `flake.nix` and Flatpak manifest to protected `dev` | Fine-grained, `Contents: write`, this repo only. Created 2026-08-05, **expires 2027-08-05**. Regenerate with `gh secret set RELEASE_PAT`. |

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
├── figma-linux-next_<ver>_linux_x64.flatpak   (CI only, from build-flatpak)
└── SHA256SUMS
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| `config/builder.json` | electron-builder targets, app metadata, file associations |
| `vite.config.mts` | Vite build config (main + renderer bundles) |
| `package.json` / `src/package.json` | Dev / production manifests |
| AUR `PKGBUILD` (both repos) | Package definition; lives only on AUR, clone fresh to edit |
| `scripts/bump_version.pl` | Version bump + tag automation (run on staging) |
| `scripts/generate_release_notes.pl` | Changelog from git log (preview only) |
| `scripts/update_pkgbuild_sha256.py` | Updates first sha256sums entry in PKGBUILD |
| `scripts/sync_flatpak_release.py` | Single writer of the Flatpak release metadata (`--version`, `--commit`, `--check`) |
| `scripts/update_flake_release.py` | Rewrites the `release` block in flake.nix (version + both SRI hashes in one pass) |
| `flake.nix` | Nix package; `release` block is CI-owned — never edit the version by hand |
| `.github/workflows/` | All CI/CD automation |
| `resources/AppRun` | AppImage entry point |
| `resources/icons/` | Multi-size icons (24–512px), `scalable.svg`, tray icons |
