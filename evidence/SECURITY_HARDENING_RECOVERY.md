# D1 recovery rehearsal and rollback procedure

Date: 2026-08-28
Scope: `militaristhumanism-community-prod` / production binding `DB`

## Safety decision

Cloudflare D1 Time Travel is always available on the production storage backend, but a restore overwrites the selected database in place and cancels in-flight work. Cloudflare does not currently provide a Time Travel clone/fork operation. Therefore this repository never performs a production restore as a rehearsal.

The permitted production rehearsal is read-only bookmark retrieval:

```powershell
pwsh -NoLogo -NoProfile -File ./scripts/rehearse_d1_recovery.ps1 -RemoteBookmarkCheck
```

The script validates that Cloudflare returns a bookmark but deliberately does not print the bookmark and never invokes `time-travel restore`.

## Proven non-destructive rehearsal

The default script creates two unique local SQLite files under `.tmp/` using Node 24's built-in SQLite/FTS5 implementation, applies the same SQL migrations used by D1, inserts synthetic recovery-only records, copies the closed database to an isolated replacement, and verifies:

- all seven migrations;
- ten canonical categories;
- three synthetic users and one synthetic discussion;
- SQLite `quick_check = ok`;
- the FTS5 row derived from the recovered discussion;
- a byte-identical source/restored file copy and a reproducible SHA-256 over the canonical logical schema/data snapshot.

It does not connect to or mutate preview or production:

```powershell
pwsh -NoLogo -NoProfile -File ./scripts/rehearse_d1_recovery.ps1
```

The Workers test runtime independently applies these migrations to Cloudflare's D1 implementation. The Node path is used for the file-copy recovery rehearsal because Wrangler's Windows local executor currently fails on otherwise valid multi-statement migration files; individual statements and D1 runtime tests succeed.

Latest isolated result (2026-08-28): two independent runs produced `RECOVERY_REHEARSAL=PASS`, seven migrations, byte-identical copies, authoritative rows, FTS5, and `quick_check`. Both canonical logical snapshots produced SHA-256 `f0c386c1dffc2b410f5d68897d00a578bf3bb845e52f3782bf2a3d18d984f159`. Production mutation: not run.

## Production migration and rollback sequence

1. Confirm the candidate Worker, tests, dry-runs, manifest, and secret scan are green. Configure the stable `AUDIT_INTEGRITY_SECRET` in preview and production without logging its value.
2. Deploy the exact candidate Worker before migrations. It encrypts every new OAuth token immediately and remains compatible with the pre-chain audit schema.
3. Put community writes into maintenance/read-only mode and stop admin mutations.
4. Retrieve and securely record the current Time Travel bookmark. Do not place it in CI logs or committed evidence.
5. Run only aggregate privacy checks; never select token or IP values.
6. Apply pending D1 migrations. Migration `0006` clears legacy token/IP material; `0007` permits only the brief controlled legacy-audit transition.
7. Invoke the authenticated audit-integrity check immediately. It race-safely seals all legacy rows and enables database enforcement before new privileged mutations resume.
8. Execute live gates, including aggregate token/IP checks and one OAuth reauthorization. Existing application sessions are preserved, but provider token material is reacquired only through OAuth.
9. After migrations, never roll back to a Worker without OAuth encryption and chained-audit support. Keep this candidate or deploy a forward hotfix when the schema/data are healthy.
10. Use `wrangler d1 time-travel restore` only for confirmed data/schema corruption, with the pre-change bookmark and explicit acknowledgement that it overwrites production. Record the previous bookmark returned by Cloudflare so the restore itself can be undone.

## FTS5 export limitation and safe alternative

Cloudflare documents that D1 export is unsupported for databases containing virtual tables such as FTS5. Dropping the production FTS table just to make a full export work is not an acceptable backup procedure.

Preferred recovery is D1 Time Travel, which restores the database state without a SQL export. For a long-retention logical copy, create a new empty D1 database, apply the schema migrations, export/import authoritative ordinary tables one at a time while excluding `community_search` and its FTS shadow tables, then run `scripts/rebuild_fts.sql`. Threads and posts are authoritative; the FTS table is disposable and reproducible.

Official references:

- <https://developers.cloudflare.com/d1/reference/time-travel/>
- <https://developers.cloudflare.com/d1/best-practices/import-export-data/>
