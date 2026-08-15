# Source baseline — Militarist Humanism V0.1

## Capture

- UTC timestamp: `2026-08-15T13:22:31Z`
- Local timestamp: `2026-08-15T16:22:31+03:00`
- Production branch target: `main`
- Local branch at discovery: `main`
- Pre-change commit: `EMPTY_LOCAL_REPOSITORY`
- Local remote URL: not configured at discovery
- Authenticated GitHub connector account: `Wolfkagan`
- Repository full name: `Wolfkagan/militaristhumanism`
- Repository visibility: public
- Default branch configured by GitHub: `main`
- Effective repository permission: admin, including push
- Repository state: empty (`size=0`, no branches, commit listing returns GitHub API `409 Git Repository is empty`)
- Clone URL: `https://github.com/Wolfkagan/militaristhumanism.git`
- GitHub CLI state at capture: installed, but not yet authenticated

## Git evidence

```text
git branch --show-current  -> main
git remote -v              -> no remote configured
git log -1 --oneline       -> branch main has no commits
gh auth status             -> not logged into any GitHub host
GitHub connector profile   -> Wolfkagan
repository lookup          -> Wolfkagan/militaristhumanism, public, default main
branch lookup              -> zero remote branches
commit lookup              -> 409 Git Repository is empty
```

The working directory initially contained an uncommitted framework starter generated during an earlier approach. It had no commit and no remote. The production objective explicitly requires a framework-free static site, so that uncommitted generated scaffold is excluded from the intended release tree.

## Cloudflare evidence

- Dashboard authentication: unavailable in the in-app browser at discovery.
- User-reported project state: deployment failed during repository cloning with `Failed: error occurred while fetching repository`.
- User-reported command visible in the failed project: `npx wrangler deploy`, which requires project-type verification after authentication.
- Project name and type: not independently verified before Cloudflare authentication.

## DNS evidence

An external query to Cloudflare Resolver on 15 August 2026 returned both expected authoritative nameservers:

```text
clark.ns.cloudflare.com
rosalyn.ns.cloudflare.com
```

A DS response was also present. No DS record was changed or removed.

The follow-up resolver capture at `2026-08-15T13:49Z` showed:

```text
APEX_A_RECORDS=0
WWW_CNAME_RECORDS=0
DNSSEC_DS_PRESENT=YES
DNSSEC_KEY_TAG=2371
DNSSEC_ALGORITHM=13
DNSSEC_DIGEST_TYPE=2
```

The absence of an apex address record and `www` alias means the production site was not externally reachable at that capture time. The nameservers and DS record were preserved unchanged.

## Discovery gate

```text
DISCOVERY_GATE=PASS
PRE_CHANGE_COMMIT=EMPTY_LOCAL_REPOSITORY
REPOSITORY=Wolfkagan/militaristhumanism
PRODUCTION_BRANCH=main
GITHUB_REPOSITORY_DISCOVERY=PASS
GITHUB_CLI_AUTH=PASS
CLOUDFLARE_DISCOVERY=PASS
CLOUDFLARE_ORIGINAL_PROJECT_TYPE=WORKER
CLOUDFLARE_PAGES_PROJECTS_AT_DISCOVERY=0
EXACT_BLOCKER=NONE
```

Follow-up authentication confirmed that the original Cloudflare application was a Worker with Workers Builds, not Pages. Its successful third version contained the static assets, no bindings, no secrets, no routes, and no custom domains. The Worker was preserved. A separate Git-connected Pages project was then created non-destructively.
