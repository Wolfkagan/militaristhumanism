#!/usr/bin/env python3
"""Fail-fast static validation for the Militarist Humanism production site."""

from __future__ import annotations

import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CANONICAL = "https://militaristhumanism.com/"

REQUIRED_FILES = (
    "public/index.html",
    "public/tr/index.html",
    "public/de/index.html",
    "public/404.html",
    "public/styles.css",
    "public/favicon.svg",
    "public/site.webmanifest",
    "public/robots.txt",
    "public/sitemap.xml",
    "public/_headers",
    "public/_redirects",
    "public/assets/brand-mark.svg",
    "public/assets/og-image.png",
    "public/assets/apple-touch-icon.png",
    "scripts/verify_site.py",
    "scripts/generate_manifest.py",
    "scripts/verify_deployment.ps1",
    "evidence/SOURCE_BASELINE.md",
    "evidence/QA_REPORT.md",
    "evidence/DEPLOYMENT_REPORT.md",
    "evidence/RELEASE_V0.1.md",
    "evidence/FILE_MANIFEST_SHA256.txt",
    ".github/workflows/site-ci.yml",
    ".github/workflows/production-verify.yml",
    ".gitignore",
    "README.md",
)

REQUIRED_SECTIONS = (
    "definition",
    "principles",
    "restraint",
    "responsibility",
    "dignity",
    "manifesto",
    "boundaries",
    "questions",
    "status",
)

PLACEHOLDER_PATTERNS = (
    r"\blorem ipsum\b",
    r"\bplaceholder\b",
    r"\bcoming soon\b",
    r"\bTODO\b",
    r"\bFIXME\b",
    r"example\.com",
    r"localhost",
    r"127\.0\.0\.1",
)

SECRET_PATTERNS = (
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"\bgh[opsu]_[A-Za-z0-9]{30,}\b",
    r"\bsk-[A-Za-z0-9]{20,}\b",
    r"\bCLOUDFLARE_API_TOKEN\s*=",
    r"\bAPI[_-]?KEY\s*=",
)


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str, str]] = []
        self.images: list[dict[str, str | None]] = []
        self.title_parts: list[str] = []
        self.meta: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.inline_events: list[tuple[str, str]] = []
        self.inline_styles: list[str] = []
        self.script_count = 0
        self.html_lang: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "html":
            self.html_lang = data.get("lang")
        if "id" in data and data["id"]:
            self.ids.append(str(data["id"]))
        for name, value in attrs:
            if name.lower().startswith("on"):
                self.inline_events.append((tag, name))
            if name.lower() == "style":
                self.inline_styles.append(tag)
            if name in {"href", "src", "poster"} and value:
                self.refs.append((tag, name, value))
        if tag == "img":
            self.images.append(data)
        elif tag == "meta":
            self.meta.append({key: value or "" for key, value in attrs})
        elif tag == "link":
            self.links.append({key: value or "" for key, value in attrs})
        elif tag == "title":
            self._in_title = True
        elif tag == "script":
            self.script_count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)

    @property
    def title(self) -> str:
        return "".join(self.title_parts).strip()


def add(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def meta_value(parser: DocumentParser, *, name: str | None = None, prop: str | None = None) -> str | None:
    for item in parser.meta:
        if name is not None and item.get("name", "").lower() == name.lower():
            return item.get("content")
        if prop is not None and item.get("property", "").lower() == prop.lower():
            return item.get("content")
    return None


def resolve_local_reference(reference: str) -> Path | None:
    parsed = urlparse(reference)
    if parsed.scheme or parsed.netloc or reference.startswith("mailto:") or reference.startswith("tel:"):
        return None
    path = unquote(parsed.path)
    if not path or path == "/":
        return PUBLIC / "index.html"
    if path.startswith("/"):
        candidate = PUBLIC / path.lstrip("/")
    else:
        candidate = PUBLIC / path
    if candidate.is_dir():
        candidate = candidate / "index.html"
    return candidate


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        signature = handle.read(24)
    if len(signature) < 24 or signature[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("invalid PNG signature")
    return struct.unpack(">II", signature[16:24])


def text_files() -> list[Path]:
    candidates: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if relative.parts[0] in {".git", "work", "outputs", "node_modules", ".next", ".vinext", ".wrangler"}:
            continue
        if path.suffix.lower() in {".html", ".css", ".svg", ".txt", ".xml", ".json", ".md", ".py", ".ps1", ".yml", ".yaml"} or path.name in {"_headers", "_redirects", ".gitignore"}:
            candidates.append(path)
    return candidates


def main() -> int:
    errors: list[str] = []

    for relative in REQUIRED_FILES:
        path = ROOT / relative
        add(errors, path.is_file(), f"Missing required file: {relative}")
        if path.is_file():
            add(errors, path.stat().st_size > 0, f"Required file is empty: {relative}")

    framework_markers = ("package.json", "next.config.ts", "vite.config.ts", "app", "worker")
    for marker in framework_markers:
        add(errors, not (ROOT / marker).exists(), f"Framework marker must not ship in the static repository: {marker}")

    if errors:
        print("STATIC_VALIDATION=FAIL")
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    index_path = PUBLIC / "index.html"
    index_text = index_path.read_text(encoding="utf-8")
    parser = DocumentParser()
    parser.feed(index_text)

    add(errors, parser.html_lang == "en", "Homepage language must be English")
    add(errors, bool(parser.title), "Missing or empty document title")
    add(errors, parser.title == "Militarist Humanism — Discipline, Strength, Humanity", "Unexpected homepage title")
    description = meta_value(parser, name="description")
    add(errors, bool(description and 70 <= len(description) <= 180), "Missing or unsuitable meta description")
    viewport = meta_value(parser, name="viewport")
    add(errors, viewport == "width=device-width, initial-scale=1", "Missing or incorrect viewport metadata")

    canonical_links = [item.get("href") for item in parser.links if item.get("rel", "").lower() == "canonical"]
    add(errors, canonical_links == [CANONICAL], "Canonical URL is missing or incorrect")
    expected_alternates = {
        "en": "https://militaristhumanism.com/",
        "tr": "https://militaristhumanism.com/tr/",
        "de": "https://militaristhumanism.com/de/",
        "x-default": "https://militaristhumanism.com/",
    }
    homepage_alternates = {
        item.get("hreflang"): item.get("href")
        for item in parser.links
        if item.get("rel", "").lower() == "alternate" and item.get("hreflang")
    }
    add(errors, homepage_alternates == expected_alternates, "Homepage hreflang alternates are missing or incorrect")
    add(errors, meta_value(parser, prop="og:url") == CANONICAL, "OpenGraph URL is missing or incorrect")
    add(errors, meta_value(parser, prop="og:type") == "website", "OpenGraph type must be website")
    add(errors, meta_value(parser, prop="og:image") == f"{CANONICAL}assets/og-image.png", "OpenGraph image is missing or incorrect")
    add(errors, meta_value(parser, name="twitter:card") == "summary_large_image", "Twitter card metadata is missing")
    add(errors, meta_value(parser, name="theme-color") == "#121312", "Theme color is missing or incorrect")
    add(errors, any(item.get("rel") == "manifest" and item.get("href") == "/site.webmanifest" for item in parser.links), "Web manifest link is missing")
    add(errors, any(item.get("rel") == "icon" and item.get("href") == "/favicon.svg" for item in parser.links), "Favicon link is missing")

    duplicate_ids = sorted({identifier for identifier in parser.ids if parser.ids.count(identifier) > 1})
    add(errors, not duplicate_ids, f"Duplicate HTML IDs: {', '.join(duplicate_ids)}")
    for section_id in REQUIRED_SECTIONS:
        add(errors, section_id in parser.ids, f"Missing required section ID: {section_id}")
        match = re.search(rf'<section\b[^>]*\bid=["\']{re.escape(section_id)}["\'][^>]*>(.*?)</section>', index_text, flags=re.IGNORECASE | re.DOTALL)
        visible_text = re.sub(r"<[^>]+>", " ", match.group(1)) if match else ""
        add(errors, len(re.sub(r"\s+", " ", visible_text).strip()) >= 80, f"Required section is empty or too short: {section_id}")

    add(errors, not parser.inline_events, f"Inline event handlers found: {parser.inline_events}")
    add(errors, not parser.inline_styles, f"Inline style attributes found on: {parser.inline_styles}")
    add(errors, parser.script_count == 0, "JavaScript is not permitted in V0.1")

    for image in parser.images:
        add(errors, "alt" in image, f"Image is missing alt text: {image.get('src', '(unknown)')}")
        if image.get("alt") == "":
            add(errors, image.get("aria-hidden") == "true", f"Decorative image must be hidden from assistive technology: {image.get('src')}")

    known_ids = set(parser.ids)
    for tag, attribute, reference in parser.refs:
        if reference.startswith("http://"):
            errors.append(f"Insecure HTTP reference in {tag}[{attribute}]: {reference}")
        if reference.startswith("#"):
            add(errors, reference[1:] in known_ids, f"Broken fragment reference: {reference}")
            continue
        parsed = urlparse(reference)
        if parsed.path in {"", "/"} and parsed.fragment:
            add(errors, parsed.fragment in known_ids, f"Broken fragment reference: {reference}")
        local = resolve_local_reference(reference)
        if local is not None:
            add(errors, local.is_file(), f"Broken local reference: {reference} -> {local.relative_to(ROOT)}")

    for section_id in REQUIRED_SECTIONS:
        add(errors, f'href="#{section_id}"' in index_text or section_id in {"responsibility", "dignity", "status"}, f"Primary navigation or content does not link to section: {section_id}")

    localized_pages = {
        "tr": {
            "path": PUBLIC / "tr" / "index.html",
            "canonical": "https://militaristhumanism.com/tr/",
            "title": "Militarist Hümanizm — Disiplin, Güç, İnsanlık",
            "locale": "tr_TR",
        },
        "de": {
            "path": PUBLIC / "de" / "index.html",
            "canonical": "https://militaristhumanism.com/de/",
            "title": "Militaristischer Humanismus — Disziplin, Stärke, Menschlichkeit",
            "locale": "de_DE",
        },
    }
    for language, config in localized_pages.items():
        page_text = config["path"].read_text(encoding="utf-8")
        page_parser = DocumentParser()
        page_parser.feed(page_text)
        page_name = config["path"].relative_to(ROOT).as_posix()
        add(errors, page_parser.html_lang == language, f"Incorrect document language in {page_name}")
        add(errors, page_parser.title == config["title"], f"Unexpected title in {page_name}")
        page_description = meta_value(page_parser, name="description")
        add(errors, bool(page_description and 70 <= len(page_description) <= 180), f"Missing or unsuitable meta description in {page_name}")
        page_canonicals = [item.get("href") for item in page_parser.links if item.get("rel", "").lower() == "canonical"]
        add(errors, page_canonicals == [config["canonical"]], f"Incorrect canonical URL in {page_name}")
        page_alternates = {
            item.get("hreflang"): item.get("href")
            for item in page_parser.links
            if item.get("rel", "").lower() == "alternate" and item.get("hreflang")
        }
        add(errors, page_alternates == expected_alternates, f"Incorrect hreflang alternates in {page_name}")
        add(errors, meta_value(page_parser, prop="og:url") == config["canonical"], f"Incorrect OpenGraph URL in {page_name}")
        add(errors, meta_value(page_parser, prop="og:locale") == config["locale"], f"Incorrect OpenGraph locale in {page_name}")
        add(errors, meta_value(page_parser, prop="og:image") == f"{CANONICAL}assets/og-image.png", f"Incorrect OpenGraph image in {page_name}")
        add(errors, page_parser.script_count == 0, f"JavaScript is not permitted in {page_name}")
        add(errors, not page_parser.inline_events, f"Inline event handlers found in {page_name}")
        add(errors, not page_parser.inline_styles, f"Inline styles found in {page_name}")
        duplicate_page_ids = sorted({identifier for identifier in page_parser.ids if page_parser.ids.count(identifier) > 1})
        add(errors, not duplicate_page_ids, f"Duplicate HTML IDs in {page_name}: {', '.join(duplicate_page_ids)}")
        for section_id in REQUIRED_SECTIONS:
            add(errors, section_id in page_parser.ids, f"Missing section {section_id} in {page_name}")
            match = re.search(rf'<section\b[^>]*\bid=["\']{re.escape(section_id)}["\'][^>]*>(.*?)</section>', page_text, flags=re.IGNORECASE | re.DOTALL)
            visible_text = re.sub(r"<[^>]+>", " ", match.group(1)) if match else ""
            add(errors, len(re.sub(r"\s+", " ", visible_text).strip()) >= 80, f"Section {section_id} is empty or too short in {page_name}")
        known_page_ids = set(page_parser.ids)
        for tag, attribute, reference in page_parser.refs:
            if reference.startswith("http://"):
                errors.append(f"Insecure HTTP reference in {page_name} {tag}[{attribute}]: {reference}")
            if reference.startswith("#"):
                add(errors, reference[1:] in known_page_ids, f"Broken fragment in {page_name}: {reference}")
                continue
            local = resolve_local_reference(reference)
            if local is not None:
                add(errors, local.is_file(), f"Broken local reference in {page_name}: {reference}")

    manifest_path = PUBLIC / "site.webmanifest"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key in ("name", "short_name", "start_url", "display", "background_color", "theme_color", "icons"):
            add(errors, bool(manifest.get(key)), f"Manifest is missing: {key}")
    except (json.JSONDecodeError, OSError) as exc:
        errors.append(f"Invalid site.webmanifest: {exc}")

    for svg in (PUBLIC / "favicon.svg", PUBLIC / "assets" / "brand-mark.svg"):
        try:
            ET.parse(svg)
        except (ET.ParseError, OSError) as exc:
            errors.append(f"Invalid SVG {svg.relative_to(ROOT)}: {exc}")

    try:
        add(errors, png_dimensions(PUBLIC / "assets" / "og-image.png") == (1200, 630), "OpenGraph image must be exactly 1200x630")
        add(errors, png_dimensions(PUBLIC / "assets" / "apple-touch-icon.png") == (180, 180), "Apple touch icon must be exactly 180x180")
    except (OSError, ValueError) as exc:
        errors.append(f"Invalid PNG asset: {exc}")

    robots = (PUBLIC / "robots.txt").read_text(encoding="utf-8")
    add(errors, f"Sitemap: {CANONICAL}sitemap.xml" in robots, "robots.txt does not declare the production sitemap")
    try:
        sitemap_root = ET.parse(PUBLIC / "sitemap.xml").getroot()
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = [node.text for node in sitemap_root.findall("sm:url/sm:loc", namespace)]
        lastmods = [node.text for node in sitemap_root.findall("sm:url/sm:lastmod", namespace)]
        expected_locations = [CANONICAL, f"{CANONICAL}tr/", f"{CANONICAL}de/"]
        add(errors, locations == expected_locations, "sitemap.xml must contain the English, Turkish, and German canonical pages")
        add(errors, all(value and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) for value in lastmods), "sitemap.xml lastmod must use ISO YYYY-MM-DD")
        alternate_namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "xhtml": "http://www.w3.org/1999/xhtml"}
        for url_node in sitemap_root.findall("sm:url", alternate_namespace):
            sitemap_alternates = {
                node.attrib.get("hreflang"): node.attrib.get("href")
                for node in url_node.findall("xhtml:link", alternate_namespace)
            }
            add(errors, sitemap_alternates == expected_alternates, "sitemap.xml hreflang alternates are incomplete")
    except (ET.ParseError, OSError) as exc:
        errors.append(f"Invalid sitemap.xml: {exc}")

    headers = (PUBLIC / "_headers").read_text(encoding="utf-8")
    required_headers = (
        "X-Content-Type-Options: nosniff",
        "X-Frame-Options: DENY",
        "Referrer-Policy: strict-origin-when-cross-origin",
        "Permissions-Policy:",
        "Cross-Origin-Opener-Policy: same-origin",
        "Cross-Origin-Resource-Policy: same-origin",
        "Content-Security-Policy:",
        "script-src 'none'",
    )
    for header in required_headers:
        add(errors, header in headers, f"Missing security header rule: {header}")
    add(errors, "unsafe-inline" not in headers and "unsafe-eval" not in headers, "CSP contains an unsafe script/style exception")
    add(errors, "Strict-Transport-Security" not in headers, "HSTS must not be staged in _headers before external verification")

    stylesheet = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    add(errors, "prefers-reduced-motion: reduce" in stylesheet, "Reduced-motion support is missing")
    add(errors, "http://" not in stylesheet and "https://" not in stylesheet, "Stylesheet contains a remote dependency")

    for path in text_files():
        relative = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        if relative != "scripts/verify_site.py":
            for pattern in PLACEHOLDER_PATTERNS:
                if re.search(pattern, text, flags=re.IGNORECASE):
                    errors.append(f"Forbidden placeholder/reference pattern {pattern!r} in {relative}")
        for pattern in SECRET_PATTERNS:
            if re.search(pattern, text):
                errors.append(f"Potential secret pattern {pattern!r} in {relative}")

    print(f"REQUIRED_FILES={len(REQUIRED_FILES)}")
    print(f"HTML_IDS={len(parser.ids)}")
    print(f"BROKEN_LINKS={sum(1 for item in errors if 'Broken' in item)}")
    print(f"MISSING_ASSETS={sum(1 for item in errors if 'Missing' in item or 'missing' in item)}")
    if errors:
        print("STATIC_VALIDATION=FAIL")
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("ACCESSIBILITY_BASELINE=PASS")
    print("SEO_BASELINE=PASS")
    print("SECURITY_HEADERS=PASS")
    print("STATIC_VALIDATION=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
