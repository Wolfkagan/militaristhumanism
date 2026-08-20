# Deployment Report

Date: 2026-08-20

Status: production deployment complete.

## Release result

The static trilingual publication and the new community, authentication, moderation, and owner-analytics application now run from one Cloudflare Worker plus Static Assets deployment on `https://militaristhumanism.com`.

- Production source commit: `f6b97b93a55d2da3caa73ccfdd03205bbaa97362`
- Active production Worker version: `66498b08-9e42-4298-a475-4909bc50991f`
- Accepted isolated preview version: `31cfa9a1-0669-4e58-bee5-e15e193e20a5`
- Pull requests merged with green CI: `#4`, `#5`, and `#6`

Production version history retained by Cloudflare also provides immediate rollback targets. The two post-release corrections were narrowly scoped: exact OAuth redirect origins were added to CSP `form-action`, then Better Auth's state cookie was preserved across the custom `303` redirect.

## Production resources

- D1: `militaristhumanism-community-prod`
- five forward-only D1 migrations; remote migration check reports no pending migrations
- production Analytics Engine dataset
- five independent Workers Rate Limiting bindings
- Static Assets plus Hono Worker entry point
- real Turnstile site configuration and encrypted `TURNSTILE_SECRET`
- Google OAuth credentials held only in Cloudflare encrypted bindings
- administrator bootstrap allow-list held in a private Cloudflare environment binding and absent from source/evidence

Apple remains conditional and hidden because it is not fully configured. GitHub is used only for source delivery and PR review; it is not offered or accepted as a sign-in provider. Inactive legacy encrypted OAuth bindings are not referenced by the application runtime.

## Database and recovery evidence

- production migrations: `No migrations to apply!`
- role count after the verified OAuth bootstrap: exactly one `admin` profile
- a fresh D1 Time Travel bookmark was captured privately; its value is intentionally withheld
- direct SQL export was attempted without mutation, but Cloudflare D1 rejected full export because the database contains FTS5 virtual tables
- recovery therefore uses D1 Time Travel plus the retained Worker version history; destructive restore was not exercised against live production

## Control-plane security

The Cloudflare zone currently shows the Cloudflare managed ruleset as `Always active`, Bot Fight Mode enabled, JavaScript detections enabled, and Browser Integrity Check enabled. Cloudflare's platform DDoS defense fronts the proxied domain. No extra broad dashboard rate rule was added because the Worker already applies operation-specific limits before protected work, avoiding a duplicate rule that could incorrectly throttle OAuth callbacks.

## Delivery history

1. `0efd0277-8dcc-438a-bce5-fd1260123f08` — initial community production deployment.
2. `43e9e113-d829-45e8-82b1-604a1fbbad9e` — exact OAuth destinations allowed by CSP.
3. `66498b08-9e42-4298-a475-4909bc50991f` — OAuth state cookie preserved on redirect; current production.

The earlier preview authorization error `7403` is resolved and is no longer a release gate.
