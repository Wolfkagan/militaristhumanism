# Test Report

Date: 2026-08-16

| Check | Result |
|---|---|
| TypeScript Worker + E2E configurations | PASS |
| Workers-runtime unit/integration/adversarial suite | PASS — 35/35 |
| Cloudflare Worker preview dry-run | PASS — static assets + D1 + Analytics Engine + five rate-limit bindings |
| Cloudflare Worker production dry-run | PASS — production D1/analytics/rate-limit bindings; real Turnstile site key remains a deployment gate |
| npm dependency audit | PASS — 0 vulnerabilities |
| `git diff --check` | PASS |
| Static security-pattern scan | PASS — 0 findings |
| Prohibited-name repository scan | PASS — 0 files |
| Chrome local responsive checks | PASS — 320, 390, 768, 1440 targets; no horizontal overflow |
| Chrome local console warnings/errors | PASS — none |
| Chrome live-site console warnings/errors | PASS — none |

The Cloudflare test runner prints a Windows sandbox static-analysis warning before execution; both Worker environment bundles succeed outside that restricted filesystem boundary with `nodejs_compat` enabled. Production dry-run deliberately does not claim Turnstile readiness until the real public site key and secret are configured.
