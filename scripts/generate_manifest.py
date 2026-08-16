#!/usr/bin/env python3
"""Generate or verify the deterministic SHA-256 release file manifest."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evidence" / "FILE_MANIFEST_SHA256.txt"
EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    ".wrangler",
    "__pycache__",
    "coverage",
    "node_modules",
    "outputs",
    "playwright-report",
    "test-results",
    "work",
}
EXCLUDED_SUFFIXES = {".bak", ".pyc", ".tmp"}
EXCLUDED_NAMES = {".dev.vars", ".DS_Store", "Thumbs.db"}
TEXT_FILE_NAMES = {".assetsignore", ".dev.vars.example", ".gitignore", "_headers", "_redirects", "_routes.json"}
TEXT_FILE_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsonc",
    ".lock",
    ".md",
    ".mjs",
    ".ps1",
    ".py",
    ".sql",
    ".svg",
    ".ts",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def included_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path == OUTPUT:
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_PARTS or part.startswith(".wrangler-") for part in relative.parts):
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES or path.name in EXCLUDED_NAMES:
            continue
        files.append(path)
    return sorted(files, key=lambda value: value.relative_to(ROOT).as_posix())


def canonical_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    if path.name not in TEXT_FILE_NAMES and path.suffix.lower() not in TEXT_FILE_SUFFIXES:
        return data
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data
    return text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def render() -> str:
    lines = [
        "# MILITARIST HUMANISM V0.1 — SHA-256 FILE MANIFEST",
        "# UTF-8 text is hashed with canonical LF line endings; binary files are hashed byte-for-byte.",
        "# Format: SHA256  relative/path",
    ]
    for path in included_files():
        digest = hashlib.sha256(canonical_bytes(path)).hexdigest()
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
