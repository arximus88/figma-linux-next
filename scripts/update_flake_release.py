#!/usr/bin/env python3
"""Pin flake.nix to a released version and its binary hashes.

Usage: update_flake_release.py VERSION SHA256_X64 SHA256_ARM64 [flake.nix]

The two SHA256 arguments are hex digests as printed by sha256sum; they are
converted to the SRI form Nix expects (sha256-<base64 of the raw digest>).

Version and hashes are rewritten in one pass so flake.nix can never end up
naming one release while carrying another's hashes — that combination fails
every `nix build` with a hash mismatch and is the reason this script exists
instead of a "remember to update the hashes" comment.
"""

import base64
import re
import sys


def to_sri(hex_digest: str) -> str:
    digest = hex_digest.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        sys.exit(f"not a sha256 hex digest: {hex_digest!r}")
    return "sha256-" + base64.b64encode(bytes.fromhex(digest)).decode()


def replace_once(content: str, pattern: str, replacement: str, what: str) -> str:
    new, count = re.subn(pattern, replacement, content, count=1)
    if count != 1:
        sys.exit(f"could not locate {what} in the flake — did its layout change?")
    return new


def main() -> None:
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)

    version = sys.argv[1].lstrip("v")
    x64 = to_sri(sys.argv[2])
    arm64 = to_sri(sys.argv[3])
    path = sys.argv[4] if len(sys.argv) == 5 else "flake.nix"

    content = open(path).read()

    content = replace_once(
        content,
        r'(\n\s*version\s*=\s*)"[^"]*"',
        lambda m: f'{m.group(1)}"{version}"',
        "the version field",
    )
    content = replace_once(
        content,
        r'(x86_64-linux\s*=\s*)"sha256-[^"]*"',
        lambda m: f'{m.group(1)}"{x64}"',
        "the x86_64-linux hash",
    )
    content = replace_once(
        content,
        r'(aarch64-linux\s*=\s*)"sha256-[^"]*"',
        lambda m: f'{m.group(1)}"{arm64}"',
        "the aarch64-linux hash",
    )

    open(path, "w").write(content)
    print(f"{path} pinned to v{version}")


if __name__ == "__main__":
    main()
