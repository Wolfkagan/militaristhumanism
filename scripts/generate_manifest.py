#!/usr/bin/env python3
"""Generate or verify the deterministic SHA-256 release file manifest."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evidence" / "FILE_MANIFEST_SHA256.txt"
INCLUDE_DIRS = (ROOT / "public", ROOT / "scripts", ROOT / ".github", ROOT / "evidence")
INCLUDE_FILES = (ROOT / ".gitignore", ROOT / "README.md")


def included_files() -> list[Path]:
    files: set[Path] = set()
    for directory in INCLUDE_DIRS:
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if not path.is_file() or path == OUTPUT:
                continue
            relative = path.relative_to(ROOT)
            if any(part in {"__pycache__", ".pytest_cache"} for part in relative.parts):
                continue
            if path.suffix.lower() in {".pyc", ".tmp", ".bak"} or path.name in {".DS_Store", "Thumbs.db"}:
                continue
            files.add(path)
    for path in INCLUDE_FILES:
        if path.is_file():
            files.add(path)
    return sorted(files, key=lambda value: value.relative_to(ROOT).as_posix())


def render() -> str:
    lines = [
        "# MILITARIST HUMANISM V0.1 — SHA-256 FILE MANIFEST",
        "# Format: SHA256  relative/path",
    ]
    for path in included_files():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"{digest}  {path.relative_to(ROOT).as_posix()}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify without rewriting the manifest")
    args = parser.parse_args()
    expected = render()
    if args.check:
        if not OUTPUT.is_file():
            print("SHA256_MANIFEST=FAIL")
            print("ERROR: evidence/FILE_MANIFEST_SHA256.txt is missing")
            return 1
        actual = OUTPUT.read_text(encoding="utf-8")
        if actual != expected:
            print("SHA256_MANIFEST=FAIL")
            print("ERROR: file manifest is stale; run python scripts/generate_manifest.py")
            return 1
        print(f"MANIFESTED_FILES={len(included_files())}")
        print("SHA256_MANIFEST=PASS")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
    print(f"MANIFESTED_FILES={len(included_files())}")
    print("SHA256_MANIFEST=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
