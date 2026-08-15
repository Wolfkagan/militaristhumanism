# QA report — Militarist Humanism V0.1

## Scope

This report records local static validation, rendered layout checks, accessibility-oriented review, asset checks, and runtime observations for the framework-free `public/` output.

## Current gate state

```text
STATIC_VALIDATION=PASS
LOCAL_HTTP=PASS
RESPONSIVE_LAYOUT_INITIAL_PASS=PASS
FINAL_RENDER_RECHECK=HOLD_PUBLIC_URL
LOCAL_RENDER=HOLD_RECHECK
ACCESSIBILITY_BASELINE=PASS_STATIC
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS_SOURCE
BROKEN_LINKS=0
MISSING_ASSETS=0
CONSOLE_ERRORS=NOT_MEASURED
LIGHTHOUSE_ACCESSIBILITY=NOT_MEASURED
LIGHTHOUSE_BEST_PRACTICES=NOT_MEASURED
LIGHTHOUSE_SEO=NOT_MEASURED
LIGHTHOUSE_PERFORMANCE_MOBILE=NOT_MEASURED
```

The report is updated only from captured test output. Unmeasured scores are never inferred.

## Static validation

Captured at `2026-08-15T13:49:00Z`:

```text
REQUIRED_FILES=23
HTML_IDS=20
BROKEN_LINKS=0
MISSING_ASSETS=0
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS
STATIC_VALIDATION=PASS
```

The validator also confirmed that the release has no JavaScript, inline event handlers, inline styles, framework runtime, remote runtime dependency, insecure asset URL, duplicate ID, missing required section, draft marker, or obvious secret pattern.

## Local HTTP and assets

The `public/` directory was served with the Python standard-library static server on port `4173`. Captured responses:

| Path | Status | Result |
| --- | ---: | --- |
| `/` | 200 | PASS |
| `/robots.txt` | 200 | PASS |
| `/sitemap.xml` | 200 | PASS |
| `/favicon.svg` | 200 | PASS |
| `/site.webmanifest` | 200 | PASS |
| `/assets/brand-mark.svg` | 200 | PASS |
| `/assets/og-image.png` | 200 | PASS |
| `/assets/apple-touch-icon.png` | 200 | PASS |
| `/404.html` | 200 | PASS as a directly requested source asset |
| `/nonexistent-path` | 404 | PASS for status; Cloudflare Pages must be used to verify the branded body |

Asset dimensions were read from the generated PNG files:

```text
og-image.png=1200x630, RGB
apple-touch-icon.png=180x180, RGB
```

## Responsive render review

An initial browser render pass covered all required viewports:

```text
320x568
375x667
390x844
768x1024
1024x768
1440x900
1920x1080
```

That pass found no horizontal overflow, no clipped H1, all nine content sections present, zero script elements, and navigation targets between 44 and 46 CSS pixels high. It did identify undersized auxiliary labels on narrow screens. Those labels and mobile navigation text were raised to at least `0.7rem`, and the stylesheet URL was versioned to prevent a stale local cache.

A second seven-viewport pass executed after the type-size correction, but its verbose result exceeded the tool-output capture limit. A compact third capture was blocked by the browser URL security policy for the loopback URL. The final compact render and console evidence will therefore be collected against the public Pages URL; until then `LOCAL_RENDER` remains a HOLD rather than a fabricated PASS.

## Accessibility-oriented review

Source-level checks passed for:

- document language and unique title;
- semantic `header`, `nav`, `main`, `section`, `article`, and `footer` structure;
- logical heading hierarchy;
- skip link as the first focusable control;
- visible `:focus-visible` styling;
- native links and native `details`/`summary` disclosure controls only;
- decorative SVG alternative-text handling;
- reduced-motion media query;
- no autoplay, flashing content, scripted focus management, or keyboard-trap mechanism;
- no dependency on hover or JavaScript.

The final interactive focus sequence and console log count remain scheduled for the public Pages URL because the loopback browser recheck was blocked.

## CSS-disabled and JavaScript-disabled behavior

The page content is present as ordered semantic HTML rather than injected or hidden application state. There are zero script elements, zero inline event handlers, and five native FAQ disclosure elements. The source therefore remains readable without CSS and remains functional without JavaScript. This is a structural verification; the final public browser check remains part of deployment QA.

## Performance tooling

Lighthouse scores were not measured because the environment did not provide a retained Lighthouse result and no production dependency was added solely for one-time testing. All four scores remain `NOT_MEASURED`.
