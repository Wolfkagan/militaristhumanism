# Deployment report — Militarist Humanism V0.1

## Intended production configuration

```text
PROVIDER=Cloudflare Pages
INTEGRATION=GitHub
PRODUCTION_BRANCH=main
FRAMEWORK_PRESET=None
BUILD_COMMAND=blank
OUTPUT_DIRECTORY=public
ROOT_DIRECTORY=repository root
CANONICAL_URL=https://militaristhumanism.com/
```

## Current external state

```text
GITHUB_ACCOUNT=Wolfkagan
GITHUB_REPOSITORY=Wolfkagan/militaristhumanism
GITHUB_VISIBILITY=public
GITHUB_PERMISSION=admin
GITHUB_DEFAULT_BRANCH=main
GITHUB_REMOTE_STATE=MAIN_AT_1003741a0f21c8a6efbe5ace8cdbdcd76692dbd0
GITHUB_CLI_AUTH=PASS
GITHUB_PUSH=PASS
GITHUB_CI=PASS
CLOUDFLARE_ORIGINAL_PROJECT_TYPE=WORKER
CLOUDFLARE_ORIGINAL_PROJECT_NAME=militaristhumanism
CLOUDFLARE_ORIGINAL_WORKER_BUILD=PASS
CLOUDFLARE_PAGES_PROJECT_TYPE=PAGES
CLOUDFLARE_PAGES_PROJECT_NAME=militaristhumanism
CLOUDFLARE_REPOSITORY=Wolfkagan/militaristhumanism
CLOUDFLARE_PRODUCTION_BRANCH=main
CLOUDFLARE_BUILD_COMMAND=blank
CLOUDFLARE_OUTPUT_DIRECTORY=public
CLOUDFLARE_ROOT_DIRECTORY=repository root
CLOUDFLARE_CLONE=PENDING_FIRST_PAGES_BUILD
CLOUDFLARE_BUILD=PENDING_FIRST_PAGES_BUILD
CLOUDFLARE_DEPLOY=NOT_VERIFIED
PAGES_DEV_URL=https://militaristhumanism.pages.dev/
CUSTOM_APEX_DOMAIN=NOT_VERIFIED
WWW_REDIRECT=NOT_VERIFIED
PAGES_DEV_REDIRECT=NOT_VERIFIED
```

The first production source commit was pushed to `main` without a force push. GitHub Actions run `31888902206` completed successfully, and the remote `main` ref independently resolved to the same full commit SHA.

Cloudflare Workers Builds also fetched that commit successfully. Its GitHub check completed at `2026-08-15T14:04:23Z`, proving that the earlier repository-clone failure was cleared after `main` gained a real commit.

## Wrong-project-type finding and preservation

Authenticated Cloudflare discovery proved that the original application was a Worker deployed through Workers Builds. The successful Worker state was preserved and not deleted:

```text
ORIGINAL_PRODUCT=Cloudflare Worker with Static Assets
ORIGINAL_WORKER_HOSTNAME=https://militaristhumanism.musstaafayildirim.workers.dev/
WORKER_DEPLOYMENTS=3
CURRENT_WORKER_VERSION=ec67a461-629c-4494-8570-80481ac470db
CURRENT_WORKER_TRAFFIC=100_percent
WORKER_BINDINGS=0
WORKER_SECRETS=0
WORKER_ROUTES=0
WORKER_CUSTOM_DOMAINS=0
```

The current Worker version contains the exact static security-header and redirect rules from `public/`. Because it has no custom domain or service binding, creating the canonical Pages project did not displace production traffic or destroy meaningful configuration.

## Canonical Pages project

A separate Git-integrated Pages project was created through the authenticated Cloudflare API at `2026-08-15T14:15:45Z`:

```text
PROJECT_NAME=militaristhumanism
PROJECT_TYPE=PAGES
SOURCE_TYPE=github
SOURCE_REPOSITORY=Wolfkagan/militaristhumanism
PRODUCTION_BRANCH=main
FRAMEWORK_PRESET=None
BUILD_COMMAND=blank
OUTPUT_DIRECTORY=public
ROOT_DIRECTORY=repository root
PRODUCTION_DEPLOYMENTS_ENABLED=true
PREVIEW_DEPLOYMENT_SETTING=all
PAGES_DEV_URL=https://militaristhumanism.pages.dev/
```

The project had zero deployments immediately after creation. The next normal commit to `main` will exercise the Git webhook, clone, build, and first Pages deployment.

## External DNS and reachability capture

Captured through Cloudflare Resolver (`1.1.1.1`) on 15 August 2026:

```text
AUTHORITATIVE_NS_1=clark.ns.cloudflare.com
AUTHORITATIVE_NS_2=rosalyn.ns.cloudflare.com
DNSSEC_DS_PRESENT=YES
DNSSEC_KEY_TAG=2371
DNSSEC_ALGORITHM=13
DNSSEC_DIGEST_TYPE=2
APEX_A_RECORDS=0
WWW_CNAME_RECORDS=0
```

HTTP and HTTPS requests to both the apex and `www` names failed name-to-address resolution because no apex address record or `www` alias was returned. This proves that production reachability, certificate behavior, response headers, and redirects are not yet testable; it does not indicate a change to nameservers or DNSSEC.

## Next deployment gate

```text
FINAL_RESULT=IN_PROGRESS
EXACT_BLOCKER=NONE
NEXT_OPERATION=Push the evidence update to main and verify the first Git-triggered Pages deployment
```
