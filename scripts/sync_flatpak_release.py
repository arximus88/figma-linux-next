#!/usr/bin/env python3
"""Keep the Flatpak manifest in step with the release it claims to build.

Usage:
  sync_flatpak_release.py --check            verify everything lines up, exit 1 on drift
  sync_flatpak_release.py --version X.Y.Z    rewrite the app version everywhere
  sync_flatpak_release.py --commit SHA       pin the git source to a commit

The app version lives in four places: package.json (the source of truth),
flatpak/package.json, the `tag:` of the manifest's git source, and the newest
<release> in the metainfo. A stale `tag:` is the dangerous one — the build still
succeeds, it just packages the *previous* release, so nothing fails loudly and
Flathub ships an old app. --version is called from bump_version.pl so the drift
never happens; --check runs in CI so a drift introduced any other way is caught.

The Electron version (package.json, flatpak/package.json, the unzip path in
build-commands, the vendored zip in generated-sources.json) is checked but never
rewritten: changing it means re-running flatpak-node-generator, which needs
network access and a lockfile refresh.

--check also re-verifies the vendored sources, since that is what makes the
offline build trustworthy: every npm tarball must carry the exact hash recorded
in flatpak/package-lock.json, and no source may point outside npm/Electron.
"""

import base64
import binascii
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
FLATPAK_DIR = ROOT / "flatpak"
MANIFEST = FLATPAK_DIR / "app.borys.FigmaLinuxNext.yml"
METAINFO = FLATPAK_DIR / "app.borys.FigmaLinuxNext.metainfo.xml"
FLATPAK_PKG = FLATPAK_DIR / "package.json"
LOCKFILE = FLATPAK_DIR / "package-lock.json"
GENERATED = FLATPAK_DIR / "generated-sources.json"
ROOT_PKG = ROOT / "package.json"

# Hosts a vendored source is allowed to come from. Anything else means someone
# added a source by hand instead of regenerating with flatpak-node-generator.
ALLOWED_HOSTS = {"registry.npmjs.org", "github.com", "www.electronjs.org"}
ELECTRON_ZIP = re.compile(r"electron-v(\d+\.\d+\.\d+)-linux-x64\.zip")


def read_text(path: Path) -> str:
    if not path.exists():
        sys.exit(f"missing {path.relative_to(ROOT)} — is the Flatpak manifest still in the tree?")
    return path.read_text()


def read_json(path: Path):
    return json.loads(read_text(path))


def replace_once(content: str, pattern: str, replacement, what: str) -> str:
    new, count = re.subn(pattern, replacement, content, count=1)
    if count != 1:
        sys.exit(f"could not locate {what} — did the file layout change?")
    return new


def manifest_tag(manifest: str) -> str | None:
    m = re.search(r"\n\s*tag:\s*(\S+)", manifest)
    return m.group(1) if m else None


def manifest_commit(manifest: str) -> str | None:
    m = re.search(r"\n\s*commit:\s*(\S+)", manifest)
    return m.group(1) if m else None


def manifest_electron(manifest: str) -> str | None:
    m = ELECTRON_ZIP.search(manifest)
    return m.group(1) if m else None


def metainfo_releases(metainfo: str) -> list[str]:
    return re.findall(r'<release\s+version="([^"]+)"', metainfo)


def integrity_to_hex(integrity: str) -> str | None:
    """npm records sha512-<base64>; generated-sources records the same digest as hex."""
    if not integrity.startswith("sha512-"):
        return None
    return binascii.hexlify(base64.b64decode(integrity[len("sha512-") :])).decode()


def check_vendored_sources(problems: list[str]) -> None:
    if not GENERATED.exists() or not LOCKFILE.exists():
        problems.append("flatpak/generated-sources.json or package-lock.json is missing")
        return

    sources = read_json(GENERATED)
    lock = read_json(LOCKFILE)

    expected = {}
    for meta in lock.get("packages", {}).values():
        resolved, integrity = meta.get("resolved"), meta.get("integrity")
        if resolved and integrity:
            expected[resolved] = integrity_to_hex(integrity)

    seen = set()
    for source in sources:
        url = source.get("url")
        if not url:
            continue
        host = urlparse(url).netloc
        if host not in ALLOWED_HOSTS:
            problems.append(f"vendored source points outside npm/Electron: {url}")
            continue
        if not (source.get("sha256") or source.get("sha512")):
            problems.append(f"vendored source has no hash: {url}")
        if host != "registry.npmjs.org":
            continue
        seen.add(url)
        want = expected.get(url)
        if want is None:
            problems.append(f"vendored tarball is not in package-lock.json: {url}")
        elif want != source.get("sha512"):
            problems.append(f"vendored tarball hash does not match the lockfile: {url}")

    for url in expected:
        if "registry.npmjs.org" in url and url not in seen:
            problems.append(f"lockfile entry has no vendored source (offline build will fail): {url}")


def check() -> None:
    root_pkg = read_json(ROOT_PKG)
    flatpak_pkg = read_json(FLATPAK_PKG)
    manifest = read_text(MANIFEST)
    metainfo = read_text(METAINFO)

    version = root_pkg["version"]
    electron = root_pkg["devDependencies"]["electron"]
    problems: list[str] = []

    if flatpak_pkg.get("version") != version:
        problems.append(
            f"flatpak/package.json version is {flatpak_pkg.get('version')}, package.json says {version}"
        )

    tag = manifest_tag(manifest)
    if tag != f"v{version}":
        problems.append(
            f"manifest builds tag {tag}, package.json says v{version} "
            "— the build would silently package the wrong release"
        )

    commit = manifest_commit(manifest)
    if commit is not None and not re.fullmatch(r"[0-9a-f]{40}", commit):
        problems.append(f"manifest commit is not a full 40-char sha: {commit}")

    releases = metainfo_releases(metainfo)
    if not releases:
        problems.append("metainfo has no <release> entries")
    elif releases[0] != version:
        problems.append(f"metainfo newest release is {releases[0]}, package.json says {version}")

    if flatpak_pkg.get("devDependencies", {}).get("electron") != electron:
        problems.append(
            f"flatpak/package.json pins electron "
            f"{flatpak_pkg.get('devDependencies', {}).get('electron')}, package.json pins {electron}"
        )
    manifest_electron_version = manifest_electron(manifest)
    if manifest_electron_version != electron:
        problems.append(
            f"manifest unzips electron-v{manifest_electron_version}, package.json pins {electron}"
        )
    if GENERATED.exists() and f"electron-v{electron}-linux-x64.zip" not in read_text(GENERATED):
        problems.append(
            f"electron {electron} is not vendored in generated-sources.json "
            "— rerun flatpak-node-generator (see the manifest header)"
        )

    if flatpak_pkg.get("dependencies") != root_pkg.get("dependencies"):
        problems.append("flatpak/package.json dependencies differ from package.json")
    if flatpak_pkg.get("overrides") != root_pkg.get("overrides"):
        problems.append("flatpak/package.json overrides differ from package.json")
    root_dev = root_pkg.get("devDependencies", {})
    for name, spec in flatpak_pkg.get("devDependencies", {}).items():
        if name not in root_dev:
            problems.append(f"flatpak/package.json devDependency {name} is not in package.json")
        elif root_dev[name] != spec:
            problems.append(
                f"flatpak/package.json wants {name}@{spec}, package.json wants {name}@{root_dev[name]}"
            )

    check_vendored_sources(problems)

    if problems:
        print("Flatpak release metadata is out of sync:\n", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\nVersion drift: run `python3 scripts/sync_flatpak_release.py --version "
            f"{version}`.\nDependency or vendoring drift: update flatpak/package.json, then "
            "regenerate\npackage-lock.json and generated-sources.json (commands in the manifest "
            "header).",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"flatpak release metadata in sync: v{version}, electron {electron}")


def set_version(version: str) -> None:
    version = version.lstrip("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit(f"not a X.Y.Z version: {version!r}")

    pkg = read_text(FLATPAK_PKG)
    pkg = replace_once(
        pkg,
        r'("version":\s*)"[^"]*"',
        lambda m: f'{m.group(1)}"{version}"',
        "the version field in flatpak/package.json",
    )
    FLATPAK_PKG.write_text(pkg)

    manifest = read_text(MANIFEST)
    manifest = replace_once(
        manifest,
        r"(\n\s*tag:\s*)\S+",
        lambda m: f"{m.group(1)}v{version}",
        "the tag: line in the manifest",
    )
    # The commit pin belongs to the previous tag; release.yml re-adds it for this one.
    manifest = re.sub(r"\n\s*commit:\s*\S+", "", manifest, count=1)
    MANIFEST.write_text(manifest)

    metainfo = read_text(METAINFO)
    today = date.today().isoformat()
    if re.search(rf'<release\s+version="{re.escape(version)}"', metainfo):
        metainfo = replace_once(
            metainfo,
            rf'(<release\s+version="{re.escape(version)}"\s+date=)"[^"]*"',
            lambda m: f'{m.group(1)}"{today}"',
            f"the {version} release entry in the metainfo",
        )
    else:
        indent = m.group(1) if (m := re.search(r"\n(\s*)<release\s", metainfo)) else "    "
        metainfo = replace_once(
            metainfo,
            r"(<releases>)",
            lambda m: f'{m.group(1)}\n{indent}<release version="{version}" date="{today}"/>',
            "the <releases> block in the metainfo",
        )
    METAINFO.write_text(metainfo)

    print(f"flatpak metadata set to v{version}")


def set_commit(sha: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        sys.exit(f"not a full 40-char commit sha: {sha!r}")

    manifest = read_text(MANIFEST)
    if manifest_commit(manifest):
        manifest = replace_once(
            manifest,
            r"(\n\s*commit:\s*)\S+",
            lambda m: f"{m.group(1)}{sha}",
            "the commit: line in the manifest",
        )
    else:
        manifest = replace_once(
            manifest,
            r"(\n(\s*)tag:\s*\S+)",
            lambda m: f"{m.group(1)}\n{m.group(2)}commit: {sha}",
            "the tag: line in the manifest",
        )
    MANIFEST.write_text(manifest)

    print(f"flatpak git source pinned to {sha}")


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        check()
    elif len(sys.argv) == 3 and sys.argv[1] == "--version":
        set_version(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "--commit":
        set_commit(sys.argv[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
