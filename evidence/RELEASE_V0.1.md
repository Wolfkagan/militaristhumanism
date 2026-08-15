# Release V0.1 — Militarist Humanism

## Release identity

- Version: `V0.1`
- Release tag target: `v0.1.0`
- Production domain: `https://militaristhumanism.com/`
- Repository: `Wolfkagan/militaristhumanism`
- Branch: `main`
- Canonical-content commit: `2d7b6d0f546742d64fe3642f7251165fea5c956a`
- Verified source commit: `5a1465b85c872581af780985a1cd5272c412fc5f`
- Cloudflare Pages project: `militaristhumanism`
- Generated Pages hostname: `https://militaristhumanism.pages.dev/`
- Verification timestamp: `2026-08-15T16:16:23Z`

The annotated tag is created only after the evidence-seal commit itself passes GitHub CI, Cloudflare Pages deployment, and the strengthened live production workflow. The tag therefore resolves the final evidence commit without requiring a self-referential commit hash inside this file.

## Final gate matrix

```text
GITHUB_REPOSITORY_ACCESS=PASS
SOURCE_TREE=PASS
STATIC_SITE_IMPLEMENTATION=PASS
LOCAL_STATIC_VALIDATION=PASS
LOCAL_RENDER=PASS
RESPONSIVE_LAYOUT=21/21_PASS
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS
SHA256_MANIFEST=PASS
GITHUB_CI=PASS
CLOUDFLARE_REPOSITORY_CLONE=PASS
CLOUDFLARE_BUILD=PASS
CLOUDFLARE_DEPLOY=PASS
PAGES_DEV_URL=PASS
CUSTOM_APEX_DOMAIN=PASS
HTTPS=PASS
WWW_TO_APEX_REDIRECT=PASS
PAGES_DEV_TO_CUSTOM_REDIRECT=PASS
DNSSEC_PRESERVATION=PASS
POST_DEPLOYMENT_TESTS=PASS
RELEASE_EVIDENCE=PASS
FINAL_RESULT=PASS
```

## Released content

The V0.1 site now publishes one coherent canonical doctrine in English, Turkish, and German:

- human dignity as the highest end;
- disciplined strength, strategic reason, legitimate authority, and self-restraint as instruments;
- all 19 philosophical parts grouped into nine readable sections;
- ten fundamental laws;
- explicit conditions and limits on force;
- personal, psychological, leadership, state, and institutional duties;
- a general application charter and four judgment principles;
- eight canonical maxims with their limits;
- ten corruption modes and a ten-question decision test;
- canonical definition, counter-definition, final judgment, and seal.

The site contains zero occurrences under `public/` of the proper name the user prohibited. It contains no claim of membership, institute, endorsement, legal entity, contact channel, or official movement.

## Changed release files

```text
.github/workflows/production-verify.yml
README.md
evidence/DEPLOYMENT_REPORT.md
evidence/FILE_MANIFEST_SHA256.txt
evidence/QA_REPORT.md
evidence/RELEASE_V0.1.md
evidence/SOURCE_BASELINE.md
public/404.html
public/assets/og-image.png
public/de/index.html
public/index.html
public/site.webmanifest
public/styles.css
public/tr/index.html
scripts/verify_deployment.ps1
scripts/verify_site.py
```

The exact final source and asset hashes are stored in `evidence/FILE_MANIFEST_SHA256.txt`. The manifest excludes only itself and repository metadata to avoid a recursive hash.

## Local QA evidence

```text
REQUIRED_FILES=26
HTML_IDS=21
BROKEN_LINKS=0
MISSING_ASSETS=0
ACCESSIBILITY_BASELINE=PASS
SEO_BASELINE=PASS
SECURITY_HEADERS=PASS
STATIC_VALIDATION=PASS
RESPONSIVE_CHECKS=21/21_PASS
CONSOLE_ERRORS=0
SOURCE_SCRIPTS=0
INLINE_EVENT_HANDLERS=0
INLINE_STYLES=0
PUBLIC_FORBIDDEN_NAME_MATCHES=0
OG_IMAGE=1200x630
APPLE_TOUCH_ICON=180x180
```

Chrome covered English, Turkish, and German at `320×568`, `375×667`, `390×844`, `768×1024`, `1024×768`, `1440×900`, and `1920×1080`. There was no body overflow, clipped H1, wrong active language, missing section, escaped table, or browser console entry.

## GitHub and Cloudflare evidence

```text
REMOTE_MAIN_SHA=5a1465b85c872581af780985a1cd5272c412fc5f
STATIC_VALIDATION_RUN=31894945199
STATIC_VALIDATION_RUN_RESULT=success
PRODUCTION_VERIFICATION_RUN=31894945105
PRODUCTION_VERIFICATION_RUN_RESULT=success
CLOUDFLARE_PAGES_CHECK=success
CLOUDFLARE_PAGES_RESULT=Deployed successfully
HOSTED_PRODUCTION_VERIFIER=FINAL_RESULT_PASS
```

The hosted verifier proved the apex `200`, three-language content, required live headers, robots, sitemap, favicon, manifest, branded 404 status, HTTP-to-HTTPS redirect, `www` root/path/query redirect, and `pages.dev` root/path/query redirect.

## DNS, certificate, and privacy

The authoritative nameservers remain `clark.ns.cloudflare.com` and `rosalyn.ns.cloudflare.com`. A DNSSEC DS record remains visible with key tag `2371`, algorithm `13`, and digest type `2`. No DNSSEC or nameserver change was made.

Universal SSL and the custom apex domain are active. Successful HTTPS requests from two independent networks prove certificate validity and canonical reachability. No mixed-content reference exists in source.

The site uses no analytics, tracking pixel, remote font, cookie, third-party runtime, or site-authored JavaScript. Cloudflare's edge security may inject its own JavaScript Detection resource; this is not an analytics integration.

## Known limitations

- Lighthouse numeric scores were `NOT_MEASURED`; no score is fabricated and no production dependency was installed solely to obtain one.
- The local regional route to the generated `pages.dev` hostname timed out; the GitHub-hosted production verifier independently reached it and proved both required `301` redirects.
- HSTS is not committed in `_headers`. HTTPS and all canonical redirects are verified, but preload and broad subdomain policy require a separate owner decision.
- The preserved legacy Worker still builds from the repository but has no canonical route or domain. It was intentionally not deleted.

## Non-destructive rollback

1. Identify the previous known-good Git commit and its successful Cloudflare Pages deployment.
2. Create a normal `git revert` commit on `main`; never rewrite published history or force-push.
3. Let the Git-integrated Pages project publish the revert.
4. If urgent, use Cloudflare Pages deployment history as a temporary recovery path while the revert deploys.
5. Re-run the hosted production verifier and retain the resulting evidence.

Rollback does not require deleting the DNS zone, changing nameservers, removing DNSSEC, disabling Universal SSL, transferring the domain, or deleting the preserved Worker.
