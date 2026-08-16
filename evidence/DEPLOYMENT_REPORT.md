# Deployment Report

## Preserved production

The existing production deployment and `main` branch were not mutated during this security checkpoint. The community release is isolated on `codex/community-analytics-v0.1`.

## Prepared resources

- Preview D1: `militaristhumanism-community-preview`
- Production D1: `militaristhumanism-community-prod`
- Separate preview/production Analytics Engine datasets
- Separate rate-limit namespaces for authentication, writes, search, reactions, and reports
- Five forward-only D1 migrations
- Hono Worker entry point, Cloudflare Static Assets, redirects, and security headers

## Remaining external gates

1. Apply migrations to the preview D1 only.
2. Configure real preview OAuth and Turnstile secrets/widget.
3. Push the remediation commit and inspect the isolated Worker preview.
4. Run authenticated preview acceptance and Cloudflare WAF checks.
5. Only then schedule production migrations/deployment and rollback verification.

No production database migration or deployment was performed here.

## Latest preview migration attempt

The preview-only migration command was attempted on 2026-08-16 and Cloudflare rejected the current CLI credential/account combination with API code `7403` (not authorized for that D1 service). No remote migration was applied. Resolve the Cloudflare authorization for account `a040d62b08cafb3bac68761cdd5d73ef`, then rerun `npm run db:migrate:preview` before accepting the Worker preview.

## Build-pipeline diagnosis

The first branch build exposed two independent legacy-pipeline conflicts rather than application failures:

- GitHub's original validator rejected every `package.json`, so it could only validate the former static repository.
- Cloudflare Pages rejected Workers-only observability configuration, while the separate Workers build rejected the Pages-only configuration because it had no Worker entry point or assets directory.

The remediation makes `src/worker.ts` and `public/` the single deployable unit and upgrades GitHub validation to run the publication checks, TypeScript checks, Workers-runtime suite, preview dry-run, production dry-run, and whole-release SHA-256 manifest verification.
