# QA report — Militarist Humanism V0.1

## Scope and capture

This report covers the framework-free English, Turkish, and German publication after the canonical-content replacement. The final local capture was completed on `2026-08-15` before the release push.

```text
STATIC_VALIDATION=PASS
LOCAL_HTTP=PASS
LOCAL_RENDER=PASS
RESPONSIVE_CHECKS=21/21_PASS
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS_SOURCE
BROKEN_LINKS=0
MISSING_ASSETS=0
CONSOLE_ERRORS=0
PUBLIC_FORBIDDEN_NAME_MATCHES=0
LIGHTHOUSE_ACCESSIBILITY=NOT_MEASURED
LIGHTHOUSE_BEST_PRACTICES=NOT_MEASURED
LIGHTHOUSE_SEO=NOT_MEASURED
LIGHTHOUSE_PERFORMANCE_MOBILE=NOT_MEASURED
```

Unmeasured scores are not inferred or reported as passes.

## Static validation

The Python standard-library validator returned:

```text
REQUIRED_FILES=26
HTML_IDS=21
BROKEN_LINKS=0
MISSING_ASSETS=0
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS
STATIC_VALIDATION=PASS
```

The validator checks the three localized pages, reciprocal `hreflang` links, canonical URLs, titles, descriptions, all nine major content sections, local references, unique IDs, image alternatives, script and inline-handler absence, security headers, sitemap, manifest, icon dimensions, draft-token patterns, and obvious secret patterns.

## Canonical content checks

- English, Turkish, and German contain the complete 19-part philosophical structure, grouped into nine readable page sections.
- All three editions contain the ten laws, two policy tables, four judgment principles, corruption modes, ten-question decision test, canonical definition, counter-definition, and final seal.
- The Turkish source is the canonical editorial basis; English and German are faithful editions rather than unrelated summaries.
- The user-prohibited proper name has zero case-insensitive matches under `public/`.
- The publication contains no invented contact address, membership, institution, endorsement, form, tracker, or analytics code.

## Responsive Chrome review

Chrome measurements covered every language at every required viewport:

| Viewport | English | Turkish | German |
| --- | --- | --- | --- |
| 320 × 568 | PASS | PASS | PASS |
| 375 × 667 | PASS | PASS | PASS |
| 390 × 844 | PASS | PASS | PASS |
| 768 × 1024 | PASS | PASS | PASS |
| 1024 × 768 | PASS | PASS | PASS |
| 1440 × 900 | PASS | PASS | PASS |
| 1920 × 1080 | PASS | PASS | PASS |

Each of the 21 checks asserted:

- no document-level horizontal overflow;
- H1 entirely inside the viewport with nonzero size;
- nine major sections present;
- zero source script elements;
- correct document language and active language selector;
- two responsive table containers wholly inside the viewport;
- zero rendered occurrences of the prohibited proper name.

The 375-pixel Turkish mobile hero and 1440-pixel English desktop hero were also inspected visually. Navigation wraps cleanly, the title remains unclipped, the primary statement remains readable, and language controls retain visible boundaries and touch-sized targets.

## Browser and interaction baseline

The Chrome developer log returned an empty array after local navigation:

```text
CONSOLE_ERRORS=0
CONSOLE_WARNINGS=0
```

Keyboard use is built entirely on native anchors and document order. The skip link is the first focusable control, all navigation and language controls are native links, `:focus-visible` uses a three-pixel high-contrast outline, internal table regions are keyboard-focusable for horizontal scrolling, and there is no scripted focus management or keyboard-trap mechanism.

## Assets and offline rendering

The local server returned the homepage and language routes with their same-origin CSS, SVG mark, manifest, and icons. Static reference resolution found no missing asset.

```text
og-image.png=1200x630
apple-touch-icon.png=180x180
REMOTE_STYLES=0
REMOTE_FONTS=0
SOURCE_SCRIPTS=0
INLINE_EVENT_HANDLERS=0
INLINE_STYLES=0
```

The revised OpenGraph card was visually inspected after final resizing. Its text is legible and matches the canonical publication.

## CSS-disabled, reduced-motion, and JavaScript-disabled behavior

All content is ordered semantic HTML rather than injected application state, so it remains readable without CSS. The site contains no JavaScript and all navigation remains native. The stylesheet contains `@media (prefers-reduced-motion: reduce)` and the layout has no autoplay, flashing content, animation dependency, or hover-only action.

## Deferred production checks

The custom Cloudflare 404 response, live headers, live content markers, mixed-content state, canonical redirects, and public console log are verified again after the release commit reaches Cloudflare Pages. They are not inferred from this local report.
