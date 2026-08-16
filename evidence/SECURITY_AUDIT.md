# Security Audit

Date: 2026-08-16

## Implemented controls

- Exact-origin, session-bound HMAC CSRF with expiry and `Sec-Fetch-Site` checks.
- Better Auth OAuth sessions; password authentication disabled.
- Test identities limited strictly to the local `test` environment.
- Turnstile fail-closed in preview/production, including exact action and hostname binding.
- Operation-specific rate limits with `429` and `Retry-After`.
- 64 KiB streamed request cap, strict media types, JSON-object enforcement, and bounded Zod schemas.
- Parameterized D1 statements, FTS term normalization, stable public identifiers, ownership checks, and protected roles.
- Safe Markdown subset: raw HTML disabled, images disabled, unsafe URLs rejected by the renderer, and user links marked `nofollow ugc noreferrer noopener`.
- Create- and edit-time link budgets, duplicate submission guards, locked-thread enforcement, and emergency read-only mode.
- CSP, anti-framing, MIME sniffing protection, restrictive permissions policy, COOP/CORP, HSTS, private no-store caching, and no permissive CORS.
- Append-only audit events, moderation reasons, snapshots, and retention controls.

## Adversarial verification

The Workers-runtime suite attacks role elevation, IDOR, CSRF, stored XSS, SQL/FTS injection, forged identifiers, cross-thread parent IDs, body overflow, invalid media, duplicate/link spam, read-only bypass, Turnstile bypass, invalid sessions, CORS, framing, and unsupported preflight behavior. Result: 35/35 tests passed.

Dependency audit: 0 known vulnerabilities. Static scan: no TODO/FIXME/HACK, `console.log`, wildcard CSP source, `unsafe-inline`, or `unsafe-eval` findings. Prohibited-name scan: zero files.

## Deployment gate

Application security is ready for an isolated Worker preview. Cloudflare dashboard WAF/managed rules, real Turnstile widget, OAuth credentials, and production deployment remain external gates and are not marked complete without runtime evidence.
