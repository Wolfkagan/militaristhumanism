# Militaristhumanism.com cybersecurity operations report

Date: 2026-08-28
Scope: canonical publication, community Worker, authentication, authorization, D1, Cloudflare edge, CI/CD, recovery, and the production-security candidate
Baseline: `9cede2704f0abea1cf117853c390694992bdf27f`
Candidate branch: `codex/production-security-hardening`
Overall release decision: **HOLD — production hardening is deployed; live OAuth reauthorization evidence and PR merge remain pending**

## Executive conclusion

The established application and Cloudflare controls remain substantial and the hardening candidate passes all local source, runtime, browser, build, dependency, and recovery gates. The pushed candidate also passes the complete remote branch Source CI and CodeQL workflows. It adds encrypted OAuth token storage, a strict response nonce, IP minimization, session revocation, tamper-evident audit events, recovery automation, CodeQL, Dependabot, and stronger CI supply-chain controls.

The sealed candidate is now deployed to production at 100% as Worker version `0361b902-4c82-4af3-9c37-273081d419d8`. A short read-only cutover used version `f4a0def6-91b7-4a06-8792-643b2e7e9fb3`; the prior baseline `3ea38407-2e19-4cbf-a23a-681c391272e1` remains the pre-schema rollback reference only. Production D1 is at seven migrations, the legacy access token, ID token, and session IP were cleared without deleting the account or session, the audit chain is sealed with enforcement active, and live CSP/JSD/Analytics, cache, CORS, health, content, and canonical redirect gates pass.

The remaining P1 evidence is one real Google OAuth reauthorization followed by an aggregate-only proof that the reacquired access token uses the encrypted envelope while the ID token and session IP remain `NULL`. The available browser is not signed in to the application and no OAuth authorization was initiated without action-time approval. PR #10 therefore remains open and the result remains HOLD rather than overstating completion.

No credential, token value, IP value, D1 bookmark, audit key, or private row value was committed to source or evidence. Aggregate queries selected counts only. The controlled production mutations were the two documented migrations and the single audit-chain state initialization; the account and existing application session were preserved.

## Chain of custody

- Baseline commit: `9cede2704f0abea1cf117853c390694992bdf27f`.
- Baseline tree: `43fd486ab3887d1b208ccd61beb4e3f60578e88f`.
- Baseline manifest: 86 files; manifest SHA-256 `2bf9d7b3d6f1543579f867fe72e8acb8233397e30bb631ba8f7e5c7dfa589462`; check passed.
- Work was performed in an isolated worktree and branch. The original checkout and synchronized project references were not modified.
- Sealed code candidate commit: `395de0d4ad8cb3d7154c0582e49132f543c0800c`; tree `8cfd6278a20b311e73b5b3c4894043cc5762823b`.
- Controlled pull request: <https://github.com/Wolfkagan/militaristhumanism/pull/10>.
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

- The production D1 dashboard confirms Time Travel is active with a seven-day restore window. Current-bookmark retrieval was tested read-only.
- A fresh preview pre-migration bookmark was captured without display and stored as a Windows-current-user DPAPI artifact outside the repository. The bookmark value is absent from terminal evidence, Git, and this report.
- A fresh production pre-migration bookmark was captured at `2026-08-28T04:44:00Z` and stored separately with Windows CurrentUser DPAPI. No restore was performed.
- `npm run test:recovery` applies all seven migrations to synthetic data, copies a closed SQLite/FTS5 database into isolation, verifies the matching SHA-256, authoritative row counts, `quick_check`, and FTS rebuildability.
- After the D1 trigger-parser compatibility correction, two independent runs produced `RECOVERY_REHEARSAL=PASS`, byte-identical copies, and the same canonical logical snapshot SHA-256 `2e1eb0049932830dfcebecb8bee759f11a3212ee3715f80d57ce822be2d416aa`; no Time Travel restore was run.
- Wrangler's remote migration parser rejected the original unparenthesized trigger `CASE` with `incomplete input` and atomically rolled back `0007`. Schema inspection proved that no partial `0007` object remained. Parenthesizing `CASE ... END` and enforcing LF for `migrations/*.sql` resolved the known D1/Workers SDK parser edge cases; preview and production then applied `0007` successfully.
- D1 full export is not treated as a backup when FTS5 virtual tables make it unsupported. Time Travel is primary; a replacement logical database must copy only authoritative ordinary tables and rebuild FTS with `scripts/rebuild_fts.sql`.

### Supply chain and CI

- `npm ci` installs only the lockfile graph; the clean audit found zero known vulnerabilities.
- All GitHub Actions references are pinned to full 40-character commit SHAs.
- Workflow permissions are explicit and read-only except CodeQL's scoped `security-events: write`; checkout credentials are not persisted.
- CI runs static validation, typecheck, 49 Workers-runtime tests, the isolated recovery rehearsal, 3 real-browser tests, preview/production dry-runs, and the SHA-256 manifest check.
- The final browser suite passed three consecutive fresh-server stress packages (27/27 browser cases, including nine complete role workflows). Each server uses a unique short OS-temporary Wrangler `--persist-to` directory whose pointer is boundary-validated before D1 setup, so database and native rate-limit state cannot leak across runs.
- Admin form checks atomically wait for the expected API response and exact navigation target. This closes both overlapping-navigation races exposed by remote CI without weakening production rate limits or adding test-only production bypasses.
- CodeQL uses the current pinned v4 action and `security-extended` JavaScript/TypeScript queries.
- Dependabot monitors npm and GitHub Actions weekly.
- Source and Git-history secret scans found zero candidate secret leaks.
- Pull-request GitHub evidence for sealed candidate `395de0d` is green: Source CI run `33142360219` and CodeQL run `33142360212` completed successfully. GitHub reports six successful checks, no conflicts, and no new CodeQL alert in the changed code.
- Cloudflare's existing Git integration completed build `b12a529e` for candidate `fa2f140`. Its locked install found zero vulnerabilities and `wrangler versions upload --env production` succeeded, uploading a non-traffic Worker version. No manual production deployment or traffic change was initiated. The long initialization delay coincided with Cloudflare's official Workers Builds degraded-performance incident.

## Verification results

| Gate | Result | Evidence |
|---|---:|---|
| Baseline manifest | PASS | 86 files; sealed commit/tree/manifest hashes |
| TypeScript | PASS | Worker plus E2E configs |
| Workers-runtime tests | PASS | 49/49 across 6 files |
| Real Chrome | PASS | 3/3 release run and 27/27 across three consecutive fresh-server stress packages; CSP enforcement, accessibility/browser health, full role workflow |
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
| Legacy OAuth/IP cleanup | PASS | account/session preserved; access, refresh, ID-token, and session-IP counts are all 0 after migration `0006` |
| Live OAuth encrypted reacquisition | **HOLD** | one real Google reauthorization and aggregate encrypted-envelope proof remain; no provider identity was authorized without action-time approval |
| Live CSP/JSD/Analytics | PASS | unique response nonce, no unsafe directives, JSD nonce alignment, Analytics script/connect allow-list, and clean real-Chrome console |
| Live private cache policy | PASS | health, anonymous admin, API, and malicious preflight responses contain both `private` and `no-store`; directive order is treated as insignificant |
| Production Time Travel availability | PASS | fresh pre-migration bookmark captured without display and stored with CurrentUser DPAPI; no restore performed |
| Legacy `pages.dev` redirect from this host | HOLD | canonical checks pass; compatibility host timed out locally |
| Remote PR CI / CodeQL | PASS | sealed code head `395de0d`: Source CI run `33142360219` and CodeQL run `33142360212`; six GitHub checks successful and no new CodeQL alert |
| Cloudflare Git branch build | PASS | build `27bba2df` for corrected candidate `f5cb65c` completed successfully; dependencies audited at 0 vulnerabilities and `wrangler versions upload` created a non-traffic version only |
| GitHub pull request | PASS | PR #10 is open, mergeable, and green; merge remains deliberately gated only on the live OAuth evidence |
| Preview candidate Worker | PASS | version `28ac0645` is deployed at 100%; the application bundle was unchanged by the later migration-parser-only commit `395de0d`; rollback version is `0142f3ca` |
| Dedicated audit secrets | PASS | distinct preview and production values are configured and separately DPAPI-backed; neither value was printed or committed |
| Preview hostname routing | PASS | `community-preview.militaristhumanism.com` was removed only from the production Worker and bound to `militaristhumanism-preview`; production apex was untouched |
| Preview hardening migrations | PASS | old-schema gates passed, then migrations reached 7/7 with five audit triggers; accounts, sessions, tokens, IPs, and audit events are all 0 |
| Preview audit initialization | HOLD | preview has no real admin or OAuth provider configuration; enforcement remains intentionally uninitialized instead of using a synthetic privileged identity |
| Production Worker rollout | PASS | maintenance version `f4a0def6` completed the cutover; writable version `0361b902` from sealed candidate `395de0d` is deployed at 100% |
| Production D1 hardening | PASS | 7/7 migrations; account and session preserved; legacy token/IP fields cleared; five audit triggers installed |
| Production audit integrity | PASS | enforcement enabled, stored head matches the independently recomputed HMAC, and an unchained synthetic insert was rejected with `AUDIT_CHAIN_REQUIRED` without persisting a row |
| Admin step-up/MFA | HOLD | provider session exposes no reliable MFA/AMR assertion; no false step-up claim was added |

## Aggregate-only live privacy findings

The pre-migration production queries returned counts only:

- active sessions: 1;
- sessions with a stored IP value: 1;
- OAuth accounts: 1;
- access tokens present and not in the encrypted envelope: 1;
- refresh tokens present: 0;
- ID tokens present: 1.

Post-migration aggregate-only verification returned:

- active sessions: 1;
- OAuth accounts: 1;
- access tokens present: 0;
- refresh tokens present: 0;
- ID tokens present: 0;
- sessions with a stored IP value: 0.

These results prove migration `0006` removed the legacy material without revoking the account or application session. A fresh OAuth login is still required to prove, on the live provider path, that a reacquired access token is stored in the encrypted envelope and that the ID token remains absent. No underlying value was selected.

## Controlled rollout and rollback

1. Complete: distinct preview and production `AUDIT_INTEGRITY_SECRET` values are configured and separately DPAPI-backed; neither reuses `AUTH_SECRET`.
2. Complete: sealed branch `395de0d` passes Source CI and CodeQL on PR #10.
3. Complete: the preview hostname is isolated, old-schema compatibility plus CSP/JSD/Analytics gates passed, and preview reached 7/7 migrations.
4. Complete with an explicit limitation: preview aggregate/schema gates passed, but no fake admin/OAuth identity was created solely to initialize the empty preview audit chain.
5. Complete: production entered the environment-variable read-only maintenance version and a fresh Time Travel bookmark was DPAPI-protected.
6. Complete: the migration-compatible candidate and production audit secret were deployed before D1 mutation.
7. Complete: migrations `0006`/`0007`, atomic audit sealing, trigger enforcement, aggregate privacy checks, and all canonical live gates passed; the normal writable candidate was restored at 100%.
8. Pending: perform one user-authorized Google OAuth reauthentication, prove the encrypted envelope by counts/pattern only, update evidence/manifest, require final CI, then merge PR #10.

Before the schema changes, the previous Worker can be restored. After `0006`/`0007`, do not roll back to a Worker that lacks token encryption and chained-audit support; keep this candidate or issue a forward hotfix. Use Time Travel only for confirmed data/schema corruption because it overwrites the database in place. The detailed procedure is in `evidence/SECURITY_HARDENING_RECOVERY.md`.

## Release blockers

- The available browser is at the production `Continue with Google` button but is not authenticated to the application. OAuth authorization was not initiated without action-time approval.
- Until that login completes, the post-migration database correctly contains no provider tokens; the real encrypted-envelope reacquisition gate cannot honestly be marked PASS.
- PR #10 remains unmerged until that final P1 evidence and the resulting evidence-only CI run pass.
- A reliable provider-backed MFA/AMR signal is unavailable; administrator step-up remains an explicit HOLD.
- The legacy generated-host redirect cannot be confirmed from the current network path.

Accordingly, the only defensible result at this stage is `FINAL_RESULT=HOLD`.
