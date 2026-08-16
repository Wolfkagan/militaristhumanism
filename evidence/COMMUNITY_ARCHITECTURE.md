# Community Architecture

Status: implementation complete on `codex/community-analytics-v0.1`; production remains unchanged.

## Request path

A single Cloudflare Worker deploys the static publication and application as one versioned unit. Cloudflare Static Assets serves files from `public/` without invoking application code when an asset matches; unmatched community, account, API, and administration paths enter the Hono Worker at `src/worker.ts`. The Worker uses D1 for relational state, Better Auth for server-managed OAuth sessions, Cloudflare Turnstile for high-risk public entry points, Workers Rate Limiting for abuse control, and Analytics Engine plus D1 rollups for privacy-preserving product telemetry.

This replaces the conflicting dual Pages/Workers build interpretation while preserving the existing zone and current Pages production deployment until preview acceptance is complete. Preview and production use distinct Worker environments, D1 databases, Analytics Engine datasets, rate-limit namespaces, hosts, and secrets.

## Trust boundaries

- Visitors may read visible public content only.
- Authenticated members may mutate only their own content and private account records.
- Moderators may review reports and perform bounded, reasoned moderation.
- Administrators alone may view owner analytics, change roles/categories, and operate emergency read-only mode.
- Authorization, CSRF, validation, rate limiting, Turnstile, and ownership checks are enforced in the Function; the browser is never trusted as the policy authority.
- Production and internet-accessible preview environments reject deterministic test identity headers.

## Data minimization

No message bodies, tokens, raw IP addresses, or browser fingerprints enter product analytics. Anonymous abuse keys are transient HMAC-derived values. Public IDs are separate from internal numeric database IDs.
