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
GITHUB_REMOTE_STATE=EMPTY_REPOSITORY
GITHUB_CLI_AUTH=IN_PROGRESS
CLOUDFLARE_PROJECT_TYPE=NOT_YET_OBSERVED
CLOUDFLARE_PROJECT_NAME=NOT_YET_OBSERVED
CLOUDFLARE_CLONE=NOT_VERIFIED
CLOUDFLARE_BUILD=NOT_VERIFIED
CLOUDFLARE_DEPLOY=NOT_VERIFIED
PAGES_DEV_URL=NOT_YET_OBSERVED
CUSTOM_APEX_DOMAIN=NOT_VERIFIED
WWW_REDIRECT=NOT_VERIFIED
PAGES_DEV_REDIRECT=NOT_VERIFIED
```

GitHub connector discovery independently confirmed the target repository and its empty state. GitHub CLI device authorization was initiated so the validated local tree can be committed and pushed without guessing credentials or using a force push.

The Cloudflare dashboard still requires an authenticated session before the project type, repository selection, build configuration, project hostname, and custom-domain state can be inspected or changed. No DNS zone, nameserver, DS record, certificate, project, or repository has been deleted or altered.

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

## Exact external blocker

```text
FINAL_RESULT=HOLD_EXTERNAL_AUTHORIZATION
EXACT_BLOCKER=Cloudflare dashboard authentication and GitHub CLI device approval are pending
NEXT_OPERATION=Complete the opened GitHub device approval, then inspect and repair the authenticated Cloudflare Pages Git integration
```
