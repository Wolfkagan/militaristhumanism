# Production Verification

Date: 2026-08-20

Status: PASS, with explicitly recorded measurement limitations below.

## Public delivery

The canonical production verifier passed all checks against `https://militaristhumanism.com` before the optional legacy generated-host check:

- apex `200`; HTTP-to-HTTPS `301`; `www` root/path/query canonical redirects `301`
- branded missing route `404`
- English, Turkish, and German pages `200` with their expected canonical content and canonical URLs
- robots, sitemap, favicon, and web manifest `200`
- canonical, description, Open Graph, secure-reference, and required security-header assertions PASS
- no insecure `http://`, loopback, or draft-domain references in the published home page

The local regional request to the retired `militaristhumanism.pages.dev` compatibility hostname timed out. GitHub-hosted production verification had previously reached that host successfully. This timeout does not affect the canonical domain and is not represented as a canonical-site failure.

## DNS and TLS

- authoritative nameservers: `rosalyn.ns.cloudflare.com` and `clark.ns.cloudflare.com`
- external resolver returned one DS record; DNSSEC algorithm `13`
- live certificate subject: `CN=militaristhumanism.com`
- issuer: Google Trust Services `WE1`
- observed validity: 2026-08-15 through 2026-11-13 UTC
- HTTPS connection and redirect chain verified successfully

## Authentication and administration

Real Chrome production acceptance completed the following flow:

1. Turnstile rendered and produced a server-accepted challenge token.
2. **Continue with Google** reached Google's account chooser with the exact configured callback URI.
3. The configured private administrator account completed OAuth and returned to `/community`.
4. The signed-in UI exposed Notifications and Admin; no GitHub option was present and Apple remained hidden.
5. `/admin` redirected to `/admin/overview`.
6. Overview, analytics, community, moderation, users, reports, and audit pages loaded successfully and each exposed `noindex, nofollow` metadata.
7. Anonymous `/admin` access returned an error response without owner data.

No account address, OAuth token, session cookie, Turnstile secret, or D1 bookmark is stored in this evidence.

## Community, moderation, and analytics

- the Workers-runtime suite and real local Chrome E2E cover discussion creation, reply, edit, reaction, bookmark, follow, report, moderation, notifications, and administrator analytics
- production verification deliberately did not create synthetic public discussions or reports, avoiding false public engagement and audit pollution
- live administrator analytics rendered four time ranges, a real production `community_home_view` event, and nine SVG charts
- Cloudflare Web Analytics automatic setup is enabled, and exactly one Cloudflare beacon is injected on both `/` and `/community`
- at verification time the Cloudflare Web Analytics site list still displayed `0` page views and `0` visits for the last 24 hours; no traffic total is fabricated

## Responsive and performance scope

Real Chrome responsive/overflow and accessibility checks passed at 320, 390, 768, and 1440 pixel targets in the release E2E path. Browser console checks returned no errors in the verified flows.

Numeric Lighthouse/Core Web Vitals scores are `NOT_MEASURED` because the required Chrome DevTools tracing connector was unavailable in this workspace. No score is inferred or invented.
