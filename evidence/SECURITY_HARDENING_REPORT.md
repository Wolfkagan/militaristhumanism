# Militaristhumanism.com cybersecurity operations report

Date: 2026-08-28
Scope: canonical publication, community Worker, authentication, authorization, D1, Cloudflare edge, CI/CD, recovery, and the production-security candidate
Baseline: `9cede2704f0abea1cf117853c390694992bdf27f`
Candidate branch: `codex/production-security-hardening`
CodeQL closure branch: `codex/codeql-dom-navigation-hardening`
Overall release decision: **PASS — production hardening is deployed and every mandatory live security gate is complete**

## Executive conclusion

The established application and Cloudflare controls remain substantial and the hardening candidate passes all local source, runtime, browser, build, dependency, and recovery gates. The pushed candidate also passes the complete remote branch Source CI and CodeQL workflows. It adds encrypted OAuth token storage, a strict response nonce, IP minimization, session revocation, tamper-evident audit events, recovery automation, CodeQL, Dependabot, and stronger CI supply-chain controls.

A strict completion audit later checked the branch-filtered CodeQL alert inventory rather than relying on workflow success alone. That audit found two open high-severity `js/xss-through-dom` alerts: #1 in `public/admin.js` and #2 in `public/community.js`. PR #22 constrained both form redirect paths to parsed, same-origin destinations; it rejects protocol-relative, backslash, control-character, executable-scheme, and cross-origin targets and reloads on invalid input. After the squash merge, canonical `main` reports **0 open and 2 closed** code-scanning alerts.

The sealed candidate was deployed to production at 100% during the controlled cutover as Worker version `0361b902-4c82-4af3-9c37-273081d419d8`. A short read-only cutover used version `f4a0def6-91b7-4a06-8792-643b2e7e9fb3`; the prior baseline `3ea38407-2e19-4cbf-a23a-681c391272e1` remains the pre-schema rollback reference only. After PR #10 was squash-merged, Cloudflare Git promoted merged-main version `478d44ad` to 100% traffic; the post-merge production verifier passed the same live CSP/JSD/Analytics, cache, CORS, health, content, and canonical redirect gates. Immediately after PR #22 merged on 2026-08-28, Cloudflare Git version `73800535` for source commit `4ed023f` was active at 100% traffic with a displayed 0% error rate. Later evidence-only revisions may receive a different Worker version identifier without changing the sealed application bundle. Production D1 remains at seven migrations, the audit chain remains sealed with enforcement active, and the legacy access token, ID token, and session IP were cleared without deleting the account or session.

A user-authorized real Google OAuth reauthorization completed on 2026-08-28. The application returned to an authenticated administrator session, and an aggregate-only production D1 query proved that the single reacquired access token matches Better Auth's encrypted envelope while the ID-token and session-IP counts remain zero. PR #10 then passed its final six checks, was squash-merged as `e32f7497bcc47b3fbf577ab1aeacc67dddbaddaf`, and passed main Production verification run `33145746098` plus CodeQL run `33145746122`. Evidence PR #21 was later squash-merged as `e25ad59aed17a429e74da0c428e366ca4f170bb0`. The CodeQL closure PR #22 passed all six checks and was squash-merged as `4ed023f5f8c8d643d6e9395e54cc7760573c2db7`; main Production verification run `33147846937`, Source and Worker validation run `33147846753`, and CodeQL run `33147846751` all completed successfully.

No credential, token value, IP value, D1 bookmark, audit key, or private row value was committed to source or evidence. Aggregate queries selected counts only. The controlled hardening cutover mutations were the two documented migrations and the single audit-chain state initialization; the later user-authorized OAuth callback updated the existing account's encrypted provider-token field and created the expected second application session.

## Chain of custody

- Baseline commit: `9cede2704f0abea1cf117853c390694992bdf27f`.
- Baseline tree: `43fd486ab3887d1b208ccd61beb4e3f60578e88f`.
- Baseline manifest: 86 files; manifest SHA-256 `2bf9d7b3d6f1543579f867fe72e8acb8233397e30bb631ba8f7e5c7dfa589462`; check passed.
- Work was performed in an isolated worktree and branch. The original checkout and synchronized project references were not modified.
- Sealed code candidate commit: `395de0d4ad8cb3d7154c0582e49132f543c0800c`; tree `8cfd6278a20b311e73b5b3c4894043cc5762823b`.
- Final PR evidence head: `07ffc4b1183682f3d115e54b595fdcf164cadc20`; six of six GitHub checks successful.
- Squash merge on canonical `main`: `e32f7497bcc47b3fbf577ab1aeacc67dddbaddaf`.
- Post-merge evidence commit on canonical `main`: `e25ad59aed17a429e74da0c428e366ca4f170bb0` from PR #21.
- CodeQL closure head: `52bc8002f3b490fd9516e0ca0cad8c8f6ad7fb71`; four of four Chromium regression tests and all six PR checks successful.
- CodeQL closure squash merge on canonical `main`: `4ed023f5f8c8d643d6e9395e54cc7760573c2db7`.
- Controlled pull requests: <https://github.com/Wolfkagan/militaristhumanism/pull/10>, <https://github.com/Wolfkagan/militaristhumanism/pull/21>, and <https://github.com/Wolfkagan/militaristhumanism/pull/22>.
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
- CI runs static validation, typecheck, 49 Workers-runtime tests, the isolated recovery rehearsal, 4 real-browser tests, preview/production dry-runs, and the SHA-256 manifest check.
- The final browser suite passed three consecutive fresh-server stress packages (27/27 browser cases, including nine complete role workflows). Each server uses a unique short OS-temporary Wrangler `--persist-to` directory whose pointer is boundary-validated before D1 setup, so database and native rate-limit state cannot leak across runs.
- Admin form checks atomically wait for the expected API response and exact navigation target. This closes both overlapping-navigation races exposed by remote CI without weakening production rate limits or adding test-only production bypasses.
- CodeQL uses the current pinned v4 action and `security-extended` JavaScript/TypeScript queries.
- Dependabot version updates monitor npm and GitHub Actions weekly and have produced successful update runs. GitHub currently reports repository-level Dependabot security alerts as disabled, so that separate alerting feature remains an explicit HOLD rather than being presented as verified coverage.
- Source and Git-history secret scans found zero candidate secret leaks.
- Pull-request GitHub evidence for sealed candidate `395de0d` is green: Source CI run `33142360219` and CodeQL run `33142360212` completed successfully. A later branch-wide inventory audit proved that successful workflow execution was not sufficient evidence of a zero-alert state: two pre-existing high-severity DOM-navigation alerts remained open on canonical `main`.
- PR #22 added a client-side same-origin destination guard to both affected scripts, a static-verifier requirement, and Chromium regression coverage for `javascript:`, `data:`, protocol-relative, and backslash escape attempts. PR Source run `33147639570` and CodeQL run `33147639561` succeeded; the Code scanning results gate passed. After merge, main runs `33147846753`, `33147846751`, and `33147846937` succeeded and the branch-filtered CodeQL inventory showed 0 open and 2 closed alerts.
- GitHub-hosted production verification run `33143207638` completed successfully against evidence head `a702e32`; it independently passed the canonical content/security checks and the retired `pages.dev` compatibility redirects that time out from the local region.
- Cloudflare's existing Git integration completed build `b12a529e` for candidate `fa2f140`. Its locked install found zero vulnerabilities and `wrangler versions upload --env production` succeeded, uploading a non-traffic Worker version. No manual production deployment or traffic change was initiated. The long initialization delay coincided with Cloudflare's official Workers Builds degraded-performance incident.

## Verification results

| Gate | Result | Evidence |
|---|---:|---|
| Baseline manifest | PASS | 86 files; sealed commit/tree/manifest hashes |
| Final closure manifest | PASS | 99 files; SHA-256 manifest regenerated after the CodeQL remediation and evidence update |
| TypeScript | PASS | Worker plus E2E configs |
| Workers-runtime tests | PASS | 49/49 across 6 files |
| Real Chrome | PASS | 4/4 final closure run, including unsafe redirect attempts for both client scripts; 27/27 across three earlier fresh-server stress packages; CSP enforcement, accessibility/browser health, full role workflow |
| Static/security verifier | PASS | 58 required files, links, SEO, headers, workflows, secret patterns |
| Preview dry-run | PASS | Wrangler 4.127.0, 22 assets, no deployment |
| Production dry-run | PASS | Wrangler 4.127.0, 22 assets, no deployment |
| Recovery rehearsal | PASS | 7 migrations, authoritative rows, FTS, quick check, matching digest |
| `npm ci` | PASS | 204 packages in locked graph |
| `npm audit --audit-level=moderate` | PASS | 0 vulnerabilities |
| Dependabot version updates | PASS | weekly npm and GitHub Actions configuration is present and update workflows have run |
| Dependabot security alerts | HOLD | GitHub reports the repository feature as disabled; no unresolved-alert coverage is claimed |
| Secret scan | PASS | current source and Git history: 0 findings |
| Live apex/community/health | PASS | HTTP 200 |
| Live anonymous admin | PASS | HTTP 401 |
| Live malicious CORS preflight | PASS | no ACAO |
| Live HTTP/`www` redirects | PASS | 301 to HTTPS apex with path/query preservation |
| Legacy OAuth/IP cleanup | PASS | account/session preserved; access, refresh, ID-token, and session-IP counts are all 0 after migration `0006` |
| Live OAuth encrypted reacquisition | PASS | user-authorized real Google reauthorization; 1/1 access token matches the encrypted envelope, 0 ID tokens, 0 session IPs, and administrator access preserved |
| Live CSP/JSD/Analytics | PASS | unique response nonce, no unsafe directives, JSD nonce alignment, Analytics script/connect allow-list, and clean real-Chrome console |
| Live private cache policy | PASS | health, anonymous admin, API, and malicious preflight responses contain both `private` and `no-store`; directive order is treated as insignificant |
| Production Time Travel availability | PASS | fresh pre-migration bookmark captured without display and stored with CurrentUser DPAPI; no restore performed |
| Legacy `pages.dev` redirect | PASS | local regional route times out, but GitHub-hosted runs `33143207638`, `33145746098`, and CodeQL-closure run `33147846937` independently passed root/path/query compatibility redirects |
| Remote PR CI / CodeQL | PASS | closure head `52bc800` passed all six PR checks, including Source, CodeQL, Code scanning results, and Cloudflare preview; main then reported 0 open and 2 closed CodeQL alerts |
| CodeQL DOM-navigation closure | PASS | two High `js/xss-through-dom` findings closed by parsed same-origin navigation guards plus Chromium/static regression enforcement |
| Cloudflare Git branch build | PASS | build `27bba2df` for corrected candidate `f5cb65c` completed successfully; dependencies audited at 0 vulnerabilities and `wrangler versions upload` created a non-traffic version only |
| GitHub pull request | PASS | PR #10 delivered the production hardening; evidence PR #21 and CodeQL fix PR #22 were squash-merged; PR #22 became main commit `4ed023f` after six successful checks |
| Preview candidate Worker | PASS | version `28ac0645` is deployed at 100%; the application bundle was unchanged by the later migration-parser-only commit `395de0d`; rollback version is `0142f3ca` |
| Dedicated audit secrets | PASS | distinct preview and production values are configured and separately DPAPI-backed; neither value was printed or committed |
| Preview hostname routing | PASS | `community-preview.militaristhumanism.com` was removed only from the production Worker and bound to `militaristhumanism-preview`; production apex was untouched |
| Preview hardening migrations | PASS | old-schema gates passed, then migrations reached 7/7 with five audit triggers; accounts, sessions, tokens, IPs, and audit events are all 0 |
| Preview audit initialization | HOLD | preview has no real admin or OAuth provider configuration; enforcement remains intentionally uninitialized instead of using a synthetic privileged identity |
| Production Worker rollout | PASS | maintenance version `f4a0def6` completed the cutover; writable candidate `0361b902` served the controlled release; immediately after PR #22, merged-main Git version `73800535` for `4ed023f` was active at 100% with a displayed 0% error rate |
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

The user-authorized post-cutover Google OAuth verification then returned:

- active sessions: 2;
- OAuth accounts: 1;
- access tokens present: 1;
- access tokens matching the encrypted envelope: 1;
- refresh tokens present: 0;
- refresh tokens matching the encrypted envelope: 0;
- ID tokens present: 0;
- sessions with a stored IP value: 0;
- administrator profiles: 1.

A final read-only aggregate recheck after PR #22 returned the same privacy counts: one account, two sessions, one access token with one encrypted-envelope match, no refresh token, no ID token, no session IP, and one administrator profile. It also confirmed seven migrations, five audit triggers, enforcement enabled, a sealed chain state, zero legacy audit events, and zero chained events. The query returned only these counts and Boolean state flags.

These results prove migration `0006` removed the legacy material without revoking the account or application session, and the real live provider path reacquired only an encrypted access token. The second application session is the expected result of reauthorization; the account count remained one. No token, identity, cookie, IP, or private row value was selected or recorded in evidence.

## Controlled rollout and rollback

1. Complete: distinct preview and production `AUDIT_INTEGRITY_SECRET` values are configured and separately DPAPI-backed; neither reuses `AUTH_SECRET`.
2. Complete: sealed branch `395de0d` passes Source CI and CodeQL on PR #10.
3. Complete: the preview hostname is isolated, old-schema compatibility plus CSP/JSD/Analytics gates passed, and preview reached 7/7 migrations.
4. Complete with an explicit limitation: preview aggregate/schema gates passed, but no fake admin/OAuth identity was created solely to initialize the empty preview audit chain.
5. Complete: production entered the environment-variable read-only maintenance version and a fresh Time Travel bookmark was DPAPI-protected.
6. Complete: the migration-compatible candidate and production audit secret were deployed before D1 mutation.
7. Complete: migrations `0006`/`0007`, atomic audit sealing, trigger enforcement, aggregate privacy checks, and all canonical live gates passed; the normal writable candidate was restored at 100%.
8. Complete: one user-authorized Google OAuth reauthentication proved the encrypted envelope by counts/pattern only; evidence and manifest were updated, final evidence-only CI passed, PR #10 was squash-merged, and the main production-verification and CodeQL runs passed.
9. Complete: the strict completion audit found two high-severity DOM-navigation CodeQL alerts that workflow status alone had not exposed. PR #22 added same-origin guards and 4/4 Chromium coverage, passed six checks, merged as `4ed023f`, passed all three main workflows, and reduced the main CodeQL inventory to 0 open and 2 closed alerts.

Before the schema changes, the previous Worker can be restored. After `0006`/`0007`, do not roll back to a Worker that lacks token encryption and chained-audit support; keep this candidate or issue a forward hotfix. Use Time Travel only for confirmed data/schema corruption because it overwrites the database in place. The detailed procedure is in `evidence/SECURITY_HARDENING_RECOVERY.md`.

## Residual limitations and release disposition

- No P0 or P1 production release blocker remains. The real Google OAuth path and its at-rest privacy properties are proven in production, and the two high-severity client navigation findings discovered during the final audit are closed.
- PR #10 was merged only after its evidence-only CI passed. PR #22 was merged only after six successful checks; its post-merge main Source, CodeQL, and Production verification runs passed, and the alert inventory independently confirmed zero open findings.
- Dependabot version updates remain active, but repository-level Dependabot security alerts are disabled. This optional supply-chain signal remains a documented HOLD; `npm audit`, CodeQL, secret scanning, locked installs, and scheduled version-update coverage are independently verified.
- A reliable provider-backed MFA/AMR signal is unavailable; administrator step-up remains an explicit HOLD and is not misrepresented as implemented.
- Preview audit initialization remains an explicit HOLD because preview has no real privileged identity or OAuth provider configuration. Production audit enforcement is enabled and independently verified.

Accordingly, the defensible production release result is `FINAL_RESULT=PASS`.
