# Security Audit

Date: 2026-08-20

Status: production hardening verified. This is defense in depth, not a claim that any internet service is invulnerable.

## Application controls

- exact-origin, session-bound HMAC CSRF with expiry and `Sec-Fetch-Site` checks
- Better Auth Google OAuth sessions; password authentication disabled; GitHub provider absent
- test identities limited strictly to the local `test` environment
- Turnstile fail-closed in preview/production, including server-side secret, action, and hostname validation
- operation-specific Cloudflare rate limits with `429` and `Retry-After`
- 64 KiB streamed request cap, strict media types, JSON-object enforcement, and bounded Zod schemas
- parameterized D1 statements, FTS term normalization, stable public identifiers, ownership checks, and protected roles
- safe Markdown with raw HTML and images disabled, unsafe URLs rejected, and user links marked `nofollow ugc noreferrer noopener`
- create/edit link budgets, duplicate-submission guards, locked-thread enforcement, and emergency read-only mode
- append-only audit events, moderation reasons, snapshots, and retention controls

## Browser and transport controls

- CSP with exact OAuth and Turnstile origins, no wildcard source, no `unsafe-eval`, `object-src 'none'`, and `frame-ancestors 'none'`
- anti-framing, MIME-sniffing protection, restrictive Permissions Policy, COOP/CORP, HSTS, and private `no-store` caching where required
- no permissive CORS; unsupported preflight requests are rejected
- DNSSEC externally visible and TLS certificate valid for the canonical host
- administrator pages are server-authorized and marked `noindex, nofollow`

## Cloudflare edge controls

Dashboard verification shows:

- Cloudflare managed ruleset: checked, locked, `Always active`
- Bot Fight Mode: enabled
- JavaScript detections: on
- Browser Integrity Check: enabled
- proxied platform DDoS protection in front of the Worker

The dashboard has no additional custom or broad rate-limiting rule. This is deliberate: the Worker uses five operation-specific native rate-limit bindings, preserving independent limits for authentication, writes, search, reactions, and reports without risking a blanket OAuth callback throttle.

## Secret and identity handling

- the production Turnstile secret was rotated, transferred directly into Cloudflare, and verified as encrypted; its value was not printed or committed
- OAuth secrets remain encrypted Cloudflare bindings
- administrator bootstrap identity is a private control-plane environment value, absent from source and evidence
- exactly one production profile currently has the `admin` role
- Apple remains hidden until fully configured

## Adversarial verification

The Workers-runtime suite attacks role elevation, IDOR, CSRF, stored XSS, SQL/FTS injection, forged identifiers, cross-thread parent IDs, body overflow, invalid media, duplicate/link spam, read-only bypass, Turnstile bypass, invalid sessions, CORS, framing, OAuth-state loss, and unsupported preflight behavior. Result: 39/39 tests passed.

Dependency audit: zero known vulnerabilities at the release check. Static scan: zero TODO/FIXME/HACK, `console.log`, wildcard CSP source, `unsafe-inline`, or `unsafe-eval` findings. Prohibited-name repository scan: zero files.
