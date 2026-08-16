# Test Report

Date: 2026-08-16

| Check | Result |
|---|---|
| TypeScript Worker + E2E configurations | PASS |
| Workers-runtime unit/integration/adversarial suite | PASS — 35/35 |
| Cloudflare Pages Functions bundle | PASS |
| npm dependency audit | PASS — 0 vulnerabilities |
| `git diff --check` | PASS |
| Static security-pattern scan | PASS — 0 findings |
| Prohibited-name repository scan | PASS — 0 files |
| Chrome local responsive checks | PASS — 320, 390, 768, 1440 targets; no horizontal overflow |
| Chrome local console warnings/errors | PASS — none |
| Chrome live-site console warnings/errors | PASS — none |

The Cloudflare test runner prints a Windows sandbox static-analysis warning before execution; the same Pages Function bundle succeeds outside that restricted filesystem boundary with `nodejs_compat` enabled.
