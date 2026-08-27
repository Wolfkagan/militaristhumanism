# Militaristhumanism.com cybersecurity operations report

Date: 2026-08-28
Scope: canonical publication, community Worker, authentication, authorization, D1, Cloudflare edge, CI/CD, recovery, and the production-security candidate
Baseline: `9cede2704f0abea1cf117853c390694992bdf27f`
Candidate branch: `codex/production-security-hardening`
Overall release decision: **HOLD — no production mutation, merge, or deployment performed**

## Executive conclusion

The established application and Cloudflare controls remain substantial and the hardening candidate passes all local source, runtime, browser, build, dependency, and recovery gates. The pushed candidate also passes the complete remote branch Source CI and CodeQL workflows. It adds encrypted OAuth token storage, a strict response nonce, IP minimization, session revocation, tamper-evident audit events, recovery automation, CodeQL, Dependabot, and stronger CI supply-chain controls.

Production is intentionally not declared secure at the candidate level yet. Read-only live checks proved that the currently deployed baseline still has one plaintext/non-envelope OAuth access token and one retained ID token, and its CSP does not yet contain the new nonce or Analytics `connect-src`. The managed JavaScript Detections bootstrap is currently delivered without a nonce. The candidate therefore must not be described as deployed until the controlled rollout below is completed.

No credential, token value, IP value, D1 bookmark, account email, or private identifier was printed or committed. Production data was not changed.

## Chain of custody

- Baseline commit: `9cede2704f0abea1cf117853c390694992bdf27f`.
- Baseline tree: `43fd486ab3887d1b208ccd61beb4e3f60578e88f`.
- Baseline manifest: 86 files; manifest SHA-256 `2bf9d7b3d6f1543579f867fe72e8acb8233397e30bb631ba8f7e5c7dfa589462`; check passed.
- Work was performed in an isolated worktree and branch. The original checkout and synchronized project references were not modified.
- The final candidate manifest is regenerated only after all evidence and source changes are complete and is excluded from hashing itself.

## Existing controls verified or preserved

### Cloudflare edge and transport

- Canonical traffic is proxied through Cloudflare, retaining platform DDoS protection.
- Cloudflare managed ruleset is locked and shown as always active.
- Bot Fight Mode, JavaScript Detections, and Browser Integrity Check are enabled.
- DNSSEC is externally visible; the canonical TLS certificate is valid.
- HTTPS is canonical. HTTP apex and `www` preserve the path/query while redirecting to HTTPS apex.
- HSTS, clickjacking protection, MIME sniffing protection, referrer policy, permissions policy, cross-origin opener/resource policies, and cross-domain policy restrictions are present.
- There is no blanket custom edge rate rule that could throttle OAuth callbacks. Five operation-specific native Worker rate-limit bindings protect authentication, writes, search, reactions, and reports.

### Identity, sessions, CSRF, and roles

- Google OAuth is enabled through Better Auth. Password authentication is disabled and GitHub is not exposed as a provider. Apple appears only when its complete configuration exists.
- Sessions are server-managed in D1 and use `HttpOnly`, `Secure`, `SameSite=Lax` cookies in preview/production.
- CSRF protection binds an expiring HMAC token to the session, enforces exact origin, and rejects cross-site `Sec-Fetch-Site` mutations.
- Turnstile fails closed in preview/production and validates secret, action, and hostname server-side.
- Roles and ownership are checked server-side. Members cannot access moderation; moderators cannot act on moderators/admins; admin accounts and admin demotion remain protected.
- The initial admin is selected through a private Cloudflare allow-list, not a hardcoded repository identity.

### Application and data boundaries

- Request bodies are streamed with a 64 KiB ceiling before parsing.
- Zod schemas bound types, lengths, enums, identifiers, link budgets, and mutation reasons.
- D1 operations use prepared/bound statements. Search input is normalized and bound before FTS5 use.
- Public IDs are immutable and opaque. Ownership and cross-thread parent relationships are checked.
- Duplicate submissions, relationship uniqueness, reply pagination, locks, restrictions, and read-only mode are enforced at the database/application boundary.
- Markdown disables raw HTML and images, rejects unsafe URLs, and adds safe link relations. Stored-XSS and framing controls remain covered by adversarial tests.
- No permissive CORS policy exists. Unsupported/malicious preflight receives no `Access-Control-Allow-Origin`.
- Public errors omit stack traces and internal database/account identifiers. Health output remains only `{"status":"ok"}`.

### Privacy, analytics, retention, and moderation

- Product analytics is enumerated and aggregate-only: no message bodies, cookies, authorization headers, raw IPs, secrets, or fingerprints.
- Cloudflare Web Analytics remains the authoritative aggregate traffic layer; no duplicate application beacon is added.
- Anonymous abuse keys are short-lived HMAC derivatives of transient network input rather than raw stored addresses.
- Notifications and operational rollups have bounded retention; moderation evidence is retained for accountability.
- Destructive moderation requires a reason, records an action/audit event, and preserves access-controlled snapshots when content is hidden.

## Hardening work completed in the candidate

### P1 — OAuth material at rest

- Enabled Better Auth `account.encryptOAuthTokens` and account refresh on sign-in.
- Added hooks that refuse to persist ID tokens. Better Auth encrypts access/refresh tokens; the application has no post-login provider API dependency requiring an ID token.
- Migration `0006_oauth_token_ip_privacy.sql` clears all legacy access, refresh, and ID token material and their expiries without deleting users, accounts, or application sessions.
- Existing sessions remain usable. Provider token material is reacquired only through a later OAuth login and then stored encrypted.
- A real Better Auth callback regression test uses unique canary token values, verifies the stored access/refresh values differ and match the encrypted envelope, verifies ID token `NULL`, and never logs the canaries.

### P1 — CSP, JavaScript Detections, and Web Analytics

- Every Worker HTML response receives an 18-byte cryptographically random base64url nonce.
- `script-src` contains the response nonce and retains no `unsafe-inline` or `unsafe-eval`.
- HTMLRewriter places the same nonce on application script elements.
- Canonical English/Turkish/German/404 HTML is routed Worker-first through the `ASSETS` binding for nonce injection, while remaining independent of D1 so publication availability is preserved.
- `connect-src` permits only self plus `https://cloudflareinsights.com`; the exact Cloudflare Insights beacon path remains the only Analytics script source.
- Real Chrome proves nonce uniqueness across responses, blocks a nonce-less inline probe, permits a matching-nonce probe, and completes the product workflow without browser errors.
- The production verifier now requires an observed JavaScript Detections inline bootstrap with the matching response nonce and the Web Analytics beacon before release acceptance.

### P2 — IP privacy and cache isolation

- Better Auth IP tracking is disabled. Session create/update hooks force `ipAddress` to `NULL` as a defense in depth.
- Migration `0006` clears legacy session IP fields without revoking sessions.
- The public privacy text accurately states that Better Auth IP tracking is disabled and that the application retains only an HMAC-derived abuse key.
- Authenticated, private-path, API, sign-in, edit, admin, or CSRF-bearing responses are `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow` where applicable.
- Responses vary on `Cookie` and `Accept-Encoding`; no ACAO header is allowed to survive middleware processing.

### Sessions and administrator controls

- Members can revoke all own sessions, including the current browser; both secure and local Better Auth session-cookie names are expired.
- Admins can revoke a non-admin user's sessions only with a bounded reason and CSRF/rate-limit protection.
- Moderator use, admin targets, and admin-endpoint self-targeting are rejected. Self-revocation remains available through the account control.
- Session deletion and its audit event run in the same D1 batch.

### Tamper-evident audit trail

- A dedicated stable `AUDIT_INTEGRITY_SECRET`, separate from `AUTH_SECRET`, keys HMAC-SHA-256. Auth-secret rotation therefore does not invalidate the audit chain.
- Existing rows are canonicalized and sealed. Each new event includes the previous hash and advances the single chain head.
- Privileged mutations and the audit insert share one D1 batch; chain-head conflicts retry with a fresh head.
- Migration initialization uses a row-count compare-and-set so a concurrent legacy insert cannot escape the seal.
- The migration allows a narrow Worker-first compatibility window, then the first integrity initialization enables enforcement. After cutover, database triggers reject audit updates, deletes, and unchained inserts.
- Admin-only `GET /api/admin/security/audit-integrity` returns validity, counts, and only a short head fingerprint.
- Tests cover transition sealing, concurrent writers, immutable rows, unchained rejection, head tampering, key separation, and missing-secret fail-closed behavior.

### D1 recovery

- The production D1 dashboard confirms Time Travel is active with a seven-day restore window. Current-bookmark retrieval was tested read-only; no bookmark value was recorded.
- `npm run test:recovery` applies all seven migrations to synthetic data, copies a closed SQLite/FTS5 database into isolation, verifies the matching SHA-256, authoritative row counts, `quick_check`, and FTS rebuildability.
- Two independent runs produced `RECOVERY_REHEARSAL=PASS`, byte-identical copies, and the same canonical logical snapshot SHA-256 `5dba01b19e11a5fb959b5d95e553390632871e9beed066abaa09e8ba827d5d82`; production mutation was not run.
- D1 full export is not treated as a backup when FTS5 virtual tables make it unsupported. Time Travel is primary; a replacement logical database must copy only authoritative ordinary tables and rebuild FTS with `scripts/rebuild_fts.sql`.

### Supply chain and CI

- `npm ci` installs only the lockfile graph; the clean audit found zero known vulnerabilities.
- All GitHub Actions references are pinned to full 40-character commit SHAs.
- Workflow permissions are explicit and read-only except CodeQL's scoped `security-events: write`; checkout credentials are not persisted.
- CI runs static validation, typecheck, 49 Workers-runtime tests, the isolated recovery rehearsal, 3 real-browser tests, preview/production dry-runs, and the SHA-256 manifest check.
- The complete browser workflow also passed three consecutive repeat-isolated runs (9/9 total), including per-run rate-limit identities and notification assertions bound to the discussion created by that run.
- CodeQL uses the current pinned v4 action and `security-extended` JavaScript/TypeScript queries.
- Dependabot monitors npm and GitHub Actions weekly.
- Source and Git-history secret scans found zero candidate secret leaks.
- Push-triggered GitHub evidence for candidate `80b34cd` is green: Source CI run `33122663003` passed every step and CodeQL run `33122663064` passed the JavaScript/TypeScript analysis.
- Cloudflare's existing Git integration completed build `b12a529e` for candidate `fa2f140`. Its locked install found zero vulnerabilities and `wrangler versions upload --env production` succeeded, uploading a non-traffic Worker version. No manual production deployment or traffic change was initiated. The long initialization delay coincided with Cloudflare's official Workers Builds degraded-performance incident.

## Verification results

| Gate | Result | Evidence |
|---|---:|---|
| Baseline manifest | PASS | 86 files; sealed commit/tree/manifest hashes |
| TypeScript | PASS | Worker plus E2E configs |
| Workers-runtime tests | PASS | 49/49 across 6 files |
| Real Chrome | PASS | 3/3 release run and 9/9 three-repeat stress run; CSP enforcement, accessibility/browser health, full role workflow |
| Static/security verifier | PASS | 58 required files, links, SEO, headers, workflows, secret patterns |
| Preview dry-run | PASS | Wrangler 4.127.0, 22 assets, no deployment |
| Production dry-run | PASS | Wrangler 4.127.0, 22 assets, no deployment |
| Recovery rehearsal | PASS | 7 migrations, authoritative rows, FTS, quick check, matching digest |
| `npm ci` | PASS | 204 packages in locked graph |
| `npm audit --audit-level=moderate` | PASS | 0 vulnerabilities |
| Secret scan | PASS | current source and Git history: 0 findings |
| Live apex/community/health | PASS | HTTP 200 |
| Live anonymous admin | PASS | HTTP 401 |
| Live malicious CORS preflight | PASS | no ACAO |
| Live HTTP/`www` redirects | PASS | 301 to HTTPS apex with path/query preservation |
| Live OAuth token-at-rest | **FAIL** | aggregate-only check: 1 access token not in encrypted envelope; 1 ID token retained |
| Live CSP/JSD/Analytics | **FAIL** | JSD and Analytics observed, but no response nonce, no Analytics `connect-src`, inline JSD lacks nonce |
| Live private cache policy | **FAIL** | deployed baseline lacks candidate's private/no-store behavior on anonymous admin response |
| Production Time Travel availability | PASS | dashboard window and read-only bookmark retrieval verified |
| Legacy `pages.dev` redirect from this host | HOLD | canonical checks pass; compatibility host timed out locally |
| Remote branch CI / CodeQL | PASS | evidence-bearing candidate `fa2f140`: Source CI run `33123070374` and CodeQL run `33123070245` completed successfully |
| Cloudflare Git branch build | PASS | build `b12a529e` for `fa2f140` completed successfully; version upload only, no production traffic deployment |
| GitHub pull request | HOLD | two write attempts returned `403 Resource not accessible by integration`; branch is pushed but no PR exists |
| Dedicated audit secret | **FAIL** | read-only Cloudflare checks confirm `AUDIT_INTEGRITY_SECRET` is absent from both preview and production |
| Preview hardening migrations | HOLD | preview D1 has 5 applied migrations; `0006`/`0007` and audit-chain initialization are not applied |
| Admin step-up/MFA | HOLD | provider session exposes no reliable MFA/AMR assertion; no false step-up claim was added |

## Aggregate-only live privacy findings

The production queries returned counts only:

- active sessions: 1;
- sessions with a stored IP value: 0;
- OAuth accounts: 1;
- access tokens present and not in the encrypted envelope: 1;
- refresh tokens present: 0;
- ID tokens present: 1.

These results justify both the IP-minimization choice and the OAuth P1 release block. No underlying value was selected.

## Controlled rollout and rollback

1. Configure a new random `AUDIT_INTEGRITY_SECRET` of at least 32 characters in preview and production; never print it and do not reuse `AUTH_SECRET`.
2. Push the sealed branch and require source CI plus CodeQL to pass on a controlled pull request.
3. Deploy the candidate to isolated preview before migrations; exercise sign-in, session revocation, roles, CSP/JSD/Analytics, and old-schema audit compatibility.
4. Apply preview migrations, call the admin audit-integrity endpoint immediately, verify `valid=true`, and perform aggregate-only token/IP checks plus OAuth reauthorization.
5. Retrieve and secure a production Time Travel bookmark. Put community/admin writes under controlled maintenance.
6. Deploy this exact migration-compatible candidate before production migrations so no new plaintext OAuth material can be created.
7. Apply migrations `0006` and `0007`, invoke audit cutover immediately, then re-run all live gates.
8. Merge only after the exact deployed commit, manifests, CI, CodeQL, live OAuth envelope, live nonce/JSD/Analytics, cache isolation, and redirects are green.

Before the schema changes, the previous Worker can be restored. After `0006`/`0007`, do not roll back to a Worker that lacks token encryption and chained-audit support; keep this candidate or issue a forward hotfix. Use Time Travel only for confirmed data/schema corruption because it overwrites the database in place. The detailed procedure is in `evidence/SECURITY_HARDENING_RECOVERY.md`.

## Release blockers

- Candidate is not deployed, so the two live P1 failures remain real.
- The dedicated audit secret is confirmed absent from both Cloudflare environments. The candidate intentionally fails closed without it.
- Source CI and CodeQL are green on the pushed candidate, but pull-request creation remains unavailable to the current read-only GitHub integration. The branch is therefore not merged.
- A reliable provider-backed MFA/AMR signal is unavailable; administrator step-up remains an explicit HOLD.
- The legacy generated-host redirect cannot be confirmed from the current network path.

Accordingly, the only defensible result at this stage is `FINAL_RESULT=HOLD`.
