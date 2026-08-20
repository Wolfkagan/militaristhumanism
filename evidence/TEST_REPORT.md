# Test Report

Date: 2026-08-20

| Check | Result |
|---|---|
| TypeScript Worker + E2E configurations | PASS |
| Workers-runtime unit/integration/adversarial suite | PASS — 39/39 |
| Real Chrome community/admin E2E | PASS — 2/2 |
| Static release verifier | PASS — 44 required files, 21 HTML IDs, 0 broken links, 0 missing assets |
| Accessibility/SEO/security-header/Worker baselines | PASS |
| Cloudflare Worker preview dry-run | PASS — Static Assets + D1 + Analytics Engine + five rate-limit bindings |
| Cloudflare Worker production dry-run | PASS — production bindings and encrypted runtime secrets |
| Production D1 migration status | PASS — no pending migrations |
| npm dependency audit | PASS — 0 known vulnerabilities |
| `git diff --check` | PASS |
| Static security-pattern scan | PASS — 0 findings |
| Prohibited-name repository scan | PASS — 0 files |
| Chrome responsive checks | PASS — 320, 390, 768, and 1440 targets; no horizontal overflow |
| Chrome console warnings/errors | PASS — none in verified flows |
| Live Google OAuth/Turnstile/admin acceptance | PASS |
| Canonical production verifier | PASS through all canonical checks |
| Legacy generated Pages hostname from local region | TIMEOUT — canonical production unaffected; hosted CI previously passed |
| Lighthouse/Core Web Vitals numeric scores | NOT_MEASURED — required tracing connector unavailable |

The production verifier proved apex delivery, three languages, security headers, SEO assets, branded 404, HTTP-to-HTTPS, and `www` root/path/query redirects. Its overall local invocation becomes non-zero only when the optional retired `pages.dev` compatibility host times out from this region.

The production workflow was accepted without creating synthetic public discussions or abuse reports. The deployed-code-identical E2E environment covers the full member and moderation mutation path; production Chrome acceptance covers real Turnstile, Google OAuth, session establishment, role bootstrap, all administrator routes, and analytics rendering.
