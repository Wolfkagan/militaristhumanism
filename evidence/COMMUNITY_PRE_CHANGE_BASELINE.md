# Community and analytics pre-change baseline

Capture time: `2026-08-16T15:46:44Z` / `2026-08-16T18:46:44+03:00`

## Git baseline

```text
REPOSITORY=Wolfkagan/militaristhumanism
PRODUCTION_BRANCH=main
PRE_CHANGE_COMMIT_SHA=b0be6f4d832da66461725bc4cf246a9c97bc2010
PRE_CHANGE_RELEASE_TAG=v0.1.0
WORKTREE_AT_CAPTURE=CLEAN
DEVELOPMENT_BRANCH=codex/community-analytics-v0.1
```

The development branch was created directly from the verified `v0.1.0` commit. No production file was changed before this baseline was recorded.

## Cloudflare Pages baseline

```text
PROJECT_TYPE=Cloudflare Pages
PROJECT_NAME=militaristhumanism
GIT_PROVIDER_CONNECTED=YES
PRODUCTION_BRANCH=main
BUILD_COMMAND=blank
BUILD_OUTPUT_DIRECTORY=public
ROOT_DIRECTORY=repository root
CURRENT_DEPLOYMENT_ID=1799b2ae-3d5a-4662-b539-a8fac625bb12
CURRENT_DEPLOYMENT_SOURCE=b0be6f4
CURRENT_PRODUCTION_URL=https://militaristhumanism.com/
CURRENT_GENERATED_URL=https://1799b2ae.militaristhumanism.pages.dev/
GENERATED_PAGES_HOSTNAME=https://militaristhumanism.pages.dev/
DOWNLOADED_COMPATIBILITY_DATE=2026-08-15
```

Wrangler `4.123.0` authenticated successfully and independently listed the Git-connected Pages project and the production deployment above. `wrangler pages download config` returned `pages_build_output_dir = "public"` and an empty production environment. The preserved legacy Worker remains out of the canonical route and is not modified by this project.

## Source integrity baseline

```text
CURRENT_FILE_MANIFEST_SHA256=fb66e7bc1a895c4362ab991ee97b98001aaff37f0a650da79e465d93891ab683
CURRENT_MANIFEST_ENTRY_COUNT=25
PUBLIC_HEADERS_SHA256=274e3a280884400c3f7472c116b430809587190d6bb78a148d769278822be067
PUBLIC_REDIRECTS_SHA256=2a4a71124777f7709f06a065d62639cae2c5bd9d4f6b8dacdb205093c52c7012
ROBOTS_SHA256=45a4ab394e9627e52f4a60a5f56b427cafd7c5c3feb7d2c30643e40390510d35
SITEMAP_SHA256=4353b8ceea36d4a8146d3960929a376c671917cdadbe33540a8d2fb0638edc42
STYLES_SHA256=300b882d83fffd90348006a2709228517d10d3a873c49f3efef2e11922195f19
HOME_HTML_SHA256=688fd9f1b48535995a63a460714dcce0343b0febd60b9b7d634047b25167a469
```

The authoritative per-file values remain in `evidence/FILE_MANIFEST_SHA256.txt` at the pre-change commit.

## DNS, TLS, and routing baseline

Cloudflare DNS-over-HTTPS and an independent HTTPS request returned:

```text
AUTHORITATIVE_NS_1=clark.ns.cloudflare.com
AUTHORITATIVE_NS_2=rosalyn.ns.cloudflare.com
DNSSEC_DS_RECORDS=1
APEX_A_RECORDS=2
APEX_HTTPS_STATUS=200
APEX_EFFECTIVE_URL=https://militaristhumanism.com/
TLS_VERIFY_RESULT=0
WWW_PATH_EFFECTIVE_URL=https://militaristhumanism.com/test?baseline=1
```

The `www` request preserved the requested path and query before reaching the expected `404` at the nonexistent canonical path. The local regional route to the generated Pages hostname timed out, matching the already documented regional condition; the last GitHub-hosted production verifier had independently proved its root and path/query redirects.

## Response-policy baseline

The production apex returned the source CSP and the required defensive headers:

```text
CONTENT_SECURITY_POLICY=default-src self; base-uri none; object-src none; frame-ancestors none; form-action self; img-src self data; font-src self; style-src self; script-src none; connect-src self; manifest-src self; upgrade-insecure-requests
X_CONTENT_TYPE_OPTIONS=nosniff
X_FRAME_OPTIONS=DENY
REFERRER_POLICY=strict-origin-when-cross-origin
CROSS_ORIGIN_OPENER_POLICY=same-origin
CROSS_ORIGIN_RESOURCE_POLICY=same-origin
HTTPS=PASS
```

This baseline is the rollback anchor for the community and analytics release. Production migration may not proceed until the development branch, isolated preview database, preview deployment, and preview acceptance gates have passed.
