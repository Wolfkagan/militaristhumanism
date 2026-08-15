# Deployment report — Militarist Humanism V0.1

## Verified production configuration

Capture time: `2026-08-15T16:16:23Z` / `2026-08-15T19:16:23+03:00`

```text
PROVIDER=Cloudflare Pages
INTEGRATION=GitHub
PROJECT_TYPE=PAGES
PROJECT_NAME=militaristhumanism
REPOSITORY=Wolfkagan/militaristhumanism
PRODUCTION_BRANCH=main
FRAMEWORK_PRESET=None
BUILD_COMMAND=blank
OUTPUT_DIRECTORY=public
ROOT_DIRECTORY=repository root
CANONICAL_URL=https://militaristhumanism.com/
PAGES_DEV_URL=https://militaristhumanism.pages.dev/
VERIFIED_SOURCE_COMMIT=5a1465b85c872581af780985a1cd5272c412fc5f
```

The mistakenly created Worker remains preserved. It has no custom domain, route, binding, or secret and does not serve the canonical domain. No repository, zone, Pages project, Worker, DNSSEC record, nameserver, or certificate was deleted or replaced.

## GitHub and Cloudflare deployment evidence

The remote `main` ref independently resolved to the same full source commit. Four commit checks completed successfully:

| Check | Result | Completed UTC |
| --- | --- | --- |
| Static site validation | PASS | 2026-08-15 16:14:15 |
| Cloudflare Pages | PASS — deployed successfully | 2026-08-15 16:14:16 |
| Live Cloudflare deployment verification | PASS | 2026-08-15 16:14:17 |
| Preserved Worker build | PASS | 2026-08-15 16:14:26 |

GitHub Actions evidence:

```text
STATIC_VALIDATION_RUN=31894945199
STATIC_VALIDATION_CONCLUSION=success
PRODUCTION_VERIFICATION_RUN=31894945105
PRODUCTION_VERIFICATION_CONCLUSION=success
CLOUDFLARE_REPOSITORY_CLONE=PASS
CLOUDFLARE_BUILD=PASS
CLOUDFLARE_DEPLOY=PASS
```

The Cloudflare Pages check named the exact seven-character source commit and reported a successful production deployment. The production workflow independently checked out the full source commit from `main`, proving repository access and clone success before it tested the public endpoints.

## Hosted external verifier result

The first hosted attempt returned `FINAL_RESULT=PASS`. Its evidence summary was:

```text
APEX_STATUS=200
HEADER_CONTENT-SECURITY-POLICY=PASS
HEADER_X-CONTENT-TYPE-OPTIONS=PASS
HEADER_X-FRAME-OPTIONS=PASS
HEADER_REFERRER-POLICY=PASS
HEADER_PERMISSIONS-POLICY=PASS
HEADER_CROSS-ORIGIN-OPENER-POLICY=PASS
HEADER_CROSS-ORIGIN-RESOURCE-POLICY=PASS
HEADER_CACHE-CONTROL=PASS
CANONICAL_HTML=PASS
TITLE_HTML=PASS
CANONICAL_DOCTRINE_HTML=PASS
OG_URL_HTML=PASS
ROBOTS_STATUS=200
SITEMAP_STATUS=200
FAVICON_STATUS=200
MANIFEST_STATUS=200
TURKISH_STATUS=200
GERMAN_STATUS=200
NOT_FOUND_STATUS=404
TURKISH_TITLE_HTML=PASS
TURKISH_DOCTRINE_HTML=PASS
TURKISH_CANONICAL_HTML=PASS
GERMAN_TITLE_HTML=PASS
GERMAN_DOCTRINE_HTML=PASS
GERMAN_CANONICAL_HTML=PASS
HTTP_APEX_STATUS=301
HTTP_APEX_LOCATION=https://militaristhumanism.com/
WWW_STATUS=301
WWW_LOCATION=https://militaristhumanism.com/
WWW_PATH_STATUS=301
WWW_PATH_QUERY_LOCATION=https://militaristhumanism.com/test?source=verify
PAGES_DEV_STATUS=301
PAGES_DEV_LOCATION=https://militaristhumanism.com/
PAGES_DEV_PATH_STATUS=301
PAGES_DEV_PATH_QUERY_LOCATION=https://militaristhumanism.com/test?source=verify
FINAL_RESULT=PASS
```

The seal commit extends this verifier with production meta-description, OpenGraph image, insecure-reference, draft-domain, and branded-404 body assertions. Those assertions are verified again by the final post-evidence workflow before the release tag is created.

## DNS and TLS evidence

Cloudflare Resolver `1.1.1.1` returned:

```text
AUTHORITATIVE_NS_1=clark.ns.cloudflare.com
AUTHORITATIVE_NS_2=rosalyn.ns.cloudflare.com
DNSSEC_DS_PRESENT=YES
DNSSEC_KEY_TAG=2371
DNSSEC_ALGORITHM=13
DNSSEC_DIGEST_TYPE=2
APEX_IPV4_RECORDS=2
```

DNSSEC was observed, not modified. HTTPS requests from both the local Windows verifier and the hosted runner completed with a valid certificate chain. The Cloudflare custom domain had previously been observed as Active with SSL enabled; the public `200` response and successful HTTPS content checks independently prove current reachability.

## Canonical routing

```text
HTTPS_APEX=200
HTTP_APEX_TO_HTTPS=301
WWW_ROOT_TO_APEX=301
WWW_PATH_PRESERVATION=PASS
WWW_QUERY_PRESERVATION=PASS
PAGES_DEV_ROOT_TO_APEX=301
PAGES_DEV_PATH_PRESERVATION=PASS
PAGES_DEV_QUERY_PRESERVATION=PASS
REDIRECT_LOOP=0
```

The canonical host is `https://militaristhumanism.com/`. Both alternate hosts preserve path suffixes and query strings.

## Security and privacy

The live response includes the required CSP, nosniff, frame denial, referrer policy, permissions policy, cross-origin opener/resource policies, and cache policy. Source HTML contains no scripts, inline events, inline styles, analytics, trackers, third-party fonts, cookies, or remote runtime dependencies.

Cloudflare Bot Fight Mode may inject a Cloudflare-owned JavaScript Detection resource at the edge. It is a security control, not source analytics, and no site-authored CSP exception or tracker was added.

## Regional verifier observation

The Windows PowerShell 5.1 run from the local network passed the apex, assets, localized pages, canonical content, branded 404, security headers, HTTP redirect, and full `www` path/query matrix. The local route to the generated `pages.dev` hostname timed out. The GitHub-hosted runner reached that hostname and proved both `301` redirects, so the regional timeout is recorded without weakening the external PASS.
