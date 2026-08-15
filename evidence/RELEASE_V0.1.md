# Release V0.1 — Militarist Humanism

## Release identity

- Version: `V0.1`
- Production domain: `https://militaristhumanism.com/`
- Repository: `Wolfkagan/militaristhumanism`
- Branch target: `main`
- Source commit SHA: `1003741a0f21c8a6efbe5ace8cdbdcd76692dbd0`
- Release tag: not created before production verification
- Preserved Cloudflare Worker: `militaristhumanism`
- Canonical Cloudflare Pages project: `militaristhumanism`
- Generated Pages hostname: `https://militaristhumanism.pages.dev/`

## Gate summary

```text
SOURCE_TREE=PASS
STATIC_SITE_IMPLEMENTATION=PASS
LOCAL_STATIC_VALIDATION=PASS
LOCAL_RENDER=HOLD_PUBLIC_RECHECK
ACCESSIBILITY_BASELINE=PASS_STATIC
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS_SOURCE
SHA256_MANIFEST=PASS
GITHUB_REPOSITORY_ACCESS=PASS
GITHUB_REMOTE_MAIN=PASS
GITHUB_PUSH=PASS
GITHUB_CI=PASS
CLOUDFLARE_ORIGINAL_WORKER_BUILD=PASS
CLOUDFLARE_PAGES_PROJECT=PASS_CREATED
CLOUDFLARE_REPOSITORY_CLONE=PENDING_FIRST_PAGES_BUILD
CLOUDFLARE_BUILD=PENDING_FIRST_PAGES_BUILD
CLOUDFLARE_DEPLOY=NOT_VERIFIED
CUSTOM_APEX_DOMAIN=NOT_VERIFIED
HTTPS=NOT_VERIFIED
WWW_TO_APEX_REDIRECT=NOT_VERIFIED
PAGES_DEV_TO_CUSTOM_REDIRECT=NOT_VERIFIED
DNSSEC_PRESERVATION=PASS_NO_CHANGE
FINAL_RESULT=IN_PROGRESS
```

## Implemented release tree

The intended commit contains only production source, verification tooling, CI, and evidence:

```text
.github/workflows/site-ci.yml
.gitignore
README.md
evidence/DEPLOYMENT_REPORT.md
evidence/FILE_MANIFEST_SHA256.txt
evidence/QA_REPORT.md
evidence/RELEASE_V0.1.md
evidence/SOURCE_BASELINE.md
public/404.html
public/_headers
public/_redirects
public/assets/apple-touch-icon.png
public/assets/brand-mark.svg
public/assets/og-image.png
public/favicon.svg
public/index.html
public/robots.txt
public/site.webmanifest
public/sitemap.xml
public/styles.css
scripts/generate_manifest.py
scripts/verify_deployment.ps1
scripts/verify_site.py
```

The previous generated framework scaffold is retained only in the ignored local `work/` area and is not part of the release.

## Local release evidence

```text
REQUIRED_FILES=23
HTML_IDS=20
BROKEN_LINKS=0
MISSING_ASSETS=0
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS
STATIC_VALIDATION=PASS
LOCAL_HTTP_ASSETS=PASS
JAVASCRIPT_ELEMENTS=0
INLINE_EVENT_HANDLERS=0
INLINE_STYLES=0
OG_IMAGE=1200x630
APPLE_TOUCH_ICON=180x180
```

The exact SHA-256 values are stored in `evidence/FILE_MANIFEST_SHA256.txt` and are regenerated after every evidence change.

## Known limitations

The repository was initially empty. GitHub authentication, the first push to `main`, the exact remote commit, and the GitHub Actions run now pass.

The original Cloudflare application was proven to be a Worker with Workers Builds. It was preserved because the safety policy prohibits deleting a successful deployment. It has no secrets, bindings, routes, or custom domains. A separate canonical Pages project is now connected to the exact GitHub repository with the required build settings; its first Git-triggered deployment is pending the next commit.

External DNS still returns the expected nameservers and a DS record but no apex address record or `www` alias, so the custom production domain is not yet publicly reachable.

The final compact browser render, keyboard sequence, branded 404 response, console log count, live headers, and redirects must be measured against the deployed Pages URL. No PASS is claimed for those external checks yet.

## Rollback approach

After a verified production release, rollback will be non-destructive:

1. identify the previous known-good commit and Cloudflare deployment;
2. create a normal revert commit on `main` rather than rewriting history;
3. allow Git-integrated Pages deployment to publish the revert;
4. use Cloudflare deployment history only as a temporary recovery path if required;
5. re-run the external deployment verifier.

Rollback never requires deleting the DNS zone, changing nameservers, removing DNSSEC, transferring the domain, or force-pushing.
