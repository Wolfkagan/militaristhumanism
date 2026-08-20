# Community Architecture

Status: production release active on `https://militaristhumanism.com`.

Date: 2026-08-20

## Request path

A single Cloudflare Worker deploys the English, Turkish, and German publication together with the community application as one versioned unit. Cloudflare Static Assets serves matching files from `public/`; unmatched community, account, API, and administration requests enter the Hono Worker at `src/worker.ts`.

The Worker uses:

- D1 for accounts, discussions, replies, reactions, bookmarks, follows, reports, moderation, notifications, audit history, and bounded analytics rollups.
- Better Auth for server-managed Google OAuth sessions. Password authentication is disabled. Apple is shown only when its complete configuration exists; GitHub is not an authentication provider.
- Turnstile for OAuth initiation and selected high-risk writes, with server-side hostname, action, and token verification.
- five Cloudflare Workers Rate Limiting bindings for authentication, writes, search, reactions, and reports.
- Analytics Engine for write-only product event points and D1 for administrator-readable aggregate reports.

Preview and production use separate Worker environments, D1 databases, Analytics Engine datasets, rate-limit namespaces, hosts, and secrets.

## Trust boundaries

- Visitors may read visible public content only.
- Authenticated members may mutate only their own content and private account records.
- Moderators may review reports and perform bounded, reasoned moderation.
- Administrators alone may view owner analytics, change roles/categories, and operate emergency read-only mode.
- Authorization, CSRF, validation, rate limiting, Turnstile, and ownership checks are enforced in the Worker; the browser is never the policy authority.
- Production and internet-accessible preview environments reject deterministic test identity headers.
- `/admin/*` pages enforce server-side roles and return `noindex, nofollow` metadata.

## Data minimization

Product analytics excludes message bodies, tokens, cookie values, raw IP addresses, email addresses, and browser fingerprints. Anonymous abuse keys are transient HMAC-derived values. Public identifiers are separate from internal numeric database identifiers.

## Deployment identity

- Production source commit: `f6b97b93a55d2da3caa73ccfdd03205bbaa97362`
- Active production Worker version: `66498b08-9e42-4298-a475-4909bc50991f`
- Accepted isolated preview version: `31cfa9a1-0669-4e58-bee5-e15e193e20a5`
