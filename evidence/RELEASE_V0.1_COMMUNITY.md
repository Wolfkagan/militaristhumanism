# Release v0.1 Community — Checkpoint

Branch: `codex/community-analytics-v0.1`

Implemented: public community discovery/search, OAuth-ready member accounts, discussions and nested replies, safe Markdown, reactions/bookmarks/follows, profiles and notifications, reports and moderation, owner analytics, category/role controls, audit history, retention, sitemap/robots integration, Cloudflare bindings, migrations, responsive UI, security headers, and adversarial tests.

Verified locally: 35/35 Workers-runtime tests, successful TypeScript checks, successful Pages Function bundle, zero dependency vulnerabilities, zero static security-pattern findings, and real Chrome responsive/console checks.

Production remains on the prior static release. The preview migration is currently stopped by Cloudflare API authorization code `7403`; continue from that exact gate, then complete real OAuth/Turnstile/WAF configuration as documented in `DEPLOYMENT_REPORT.md`.
