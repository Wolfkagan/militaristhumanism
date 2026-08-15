# Militarist Humanism

Production source for [militaristhumanism.com](https://militaristhumanism.com/).

Militarist Humanism is presented here as an ethical philosophy of disciplined capability placed under human dignity, law, accountability, and service. This repository contains the V0.1 English-language public statement and its release-verification tooling.

## Architecture

The site is deliberately framework-free:

- semantic HTML5;
- one external CSS file;
- no JavaScript;
- no remote fonts, analytics, trackers, or runtime dependencies;
- static assets served from `public/`;
- Cloudflare Pages Git integration from `main`.

Required Cloudflare Pages settings:

```text
Framework preset       = None
Production branch      = main
Build command          = blank
Build output directory = public
Root directory         = repository root
Environment variables  = none
```

## Local verification

Run the static validator and verify the committed hash manifest:

```powershell
python scripts/verify_site.py
python scripts/generate_manifest.py --check
```

Serve the deployable directory with any static HTTP server. One standard-library option is:

```powershell
python -m http.server 4173 --directory public
```

Open the address printed by the local server for inspection. The production source itself contains no loopback or remote runtime references.

## Release evidence

The `evidence/` directory records the source baseline, local QA, deployment results, release state, and SHA-256 file manifest. A production release is not sealed until GitHub CI, Cloudflare Pages deployment, the custom domain, HTTPS, redirects, and external header checks all pass.

Regenerate the deterministic file manifest after an intentional source change:

```powershell
python scripts/generate_manifest.py
```

## Security

Cloudflare Pages response rules live in `public/_headers`. The baseline CSP permits only same-origin static resources and disables scripts. HSTS is intentionally not committed during the initial rollout; it may be staged at the Cloudflare edge only after the apex domain, `www` redirect, generated Pages hostname redirect, certificate, and mixed-content checks all pass.

Do not commit credentials, tokens, private keys, or local environment files.

## Content status

This is a philosophical publication, not a political party, militia, paramilitary organization, legal entity, or call to violence. No membership, institutional endorsement, or official contact channel is claimed in V0.1.

No open-source license has been assigned. All questions of reuse beyond ordinary reading, quotation, and applicable law remain with the owner until an explicit licensing decision is published.
