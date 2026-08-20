# Release v0.1 Community — Production Seal

Date: 2026-08-20

Status: released to production.

## Delivered

The release adds public community discovery and search, Google OAuth member accounts, discussions and nested replies, safe Markdown, reactions, bookmarks, follows, profiles, notifications, reports, moderation, owner analytics, category and role controls, audit history, retention, sitemap/robots integration, responsive UI, and layered abuse protection while preserving the English, Turkish, and German publication.

Authentication intentionally offers Google only in the current production configuration. Apple stays hidden until its complete credential set exists. GitHub is not an authentication provider.

## Verification seal

- source commit deployed: `f6b97b93a55d2da3caa73ccfdd03205bbaa97362`
- active production Worker version: `66498b08-9e42-4298-a475-4909bc50991f`
- pull requests `#4`, `#5`, and `#6`: merged; CI green
- Workers-runtime tests: 39/39 PASS
- real Chrome E2E: 2/2 PASS
- static verifier: 44 required files, 21 HTML IDs, 0 broken links, 0 missing assets; accessibility, SEO, security headers, Worker configuration, and overall validation PASS
- production D1: migrations current; exactly one verified administrator profile
- live Google OAuth, Turnstile, administrator routes, and product analytics: PASS
- external DNSSEC, TLS, canonical redirects, three languages, publication resources, and live security headers: PASS
- prohibited-name repository scan: zero files

Cloudflare Web Analytics automatic injection is verified, but its dashboard still showed no aggregated visits at the capture time. Numeric Lighthouse/Core Web Vitals scores remain `NOT_MEASURED` because the tracing connector was unavailable; no synthetic score is reported.

## Recovery

Rollback anchors are the retained Cloudflare Worker versions and the deployed Git commit above. D1 recovery uses the privately captured Time Travel bookmark. A destructive restore was not run against production.
