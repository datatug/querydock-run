# QueryDock.run

English and Russian Astro landings, served by the `querydock-run` Cloudflare Worker on `querydock.run`.

This repository owns the static guides and same-origin dispatcher. The Angular app and storage API are separate services; a landing deployment alone does not establish their deployment or acceptance.

## Source and checks

Use the Node and pnpm versions pinned in `package.json` (Node `^24.22.1 || >=26.12.1`, pnpm `12.15.0`). The lockfile pins dependencies; `pnpm-workspace.yaml` permits build scripts only for esbuild and workerd.

- `pnpm check`: Astro/TypeScript diagnostics.
- `pnpm build`: static HTML and sitemap generation.
- `pnpm test`: dispatcher behavior and generated bilingual HTML assertions (run after build).

Static pages use no external fonts or analytics. The optional ImproveIt feedback widget is separate from query execution and account-backed publishing.

## Route ownership

| Paths | Behavior |
| --- | --- |
| `/` | Canonical English home through the `QUERYDOCK_APP` service binding; without the binding, serves the internal English Astro asset at `/en/` with canonical `/`. |
| `/en`, `/en/` | Same-origin 308 redirects to `/`, retaining query bytes and browser fragment inheritance. |
| `/ru/`, localized examples and engine `/run/` routes | Existing app service binding; without it, prebuilt localized homes remain available and missing tool assets return their static status. |
| `/en/*`, `/ru/*` non-tool routes and site assets | Astro guides, legal pages and GraphQL coming-soon pages. English non-root pages retain `/en/`. |
| `/graphql`, `/graphql/` | Existing 302 redirect to `/en/graphql/`. |
| `/sql`, `/sql/*` | App service binding; without it, redirects to a useful home/engine guide using `lang=ru` or `locale=ru` where requested. |
| `/_querydock/*` | App service binding; 503 without caching when unbound. |
| `/api/querydock`, `/api/querydock/*` | Proxy only to the deployment-fixed HTTPS `API_ORIGIN`; JSON 503 without caching when unconfigured. |
| Unknown paths | Static 404 page with 404 status. |

The Worker runs before assets. There is no SPA fallback for unknown landing URLs. The API origin is never selected from a browser-controlled target parameter. Public `/sql/{id}/{revision}/embed` routes and the account-free `/sql/embed` route (whose example lives only in the URL fragment) may be framed; every other path, including `/sql/embed/<anything>`, and landing pages deny framing. The existing service binding and API origin stay configured in `wrangler.jsonc`.

The sitemap includes the English home only as `/`, alongside the Russian home `/ru/`. `/en/` remains an internal generated asset and public redirect alias; it is excluded from the sitemap. Static canonical, reciprocal language, x-default and Open Graph home URLs use `/`. Robots permit crawling the redirects so search engines can discover the canonical URL.

The canonical-root cutover requires the app Worker to serve `/` and retain an internal 200 `/en/` alias. This landing switch must follow actual validation of that app's automatic deployment, preventing an old app's root 404 or a redirect loop. This is a release dependency, not a claim that the coordinated cutover has already executed.

## Deployment ownership

`.github/workflows/ci.yml` checks integration branches and pull requests. `.github/workflows/deploy.yml` independently builds, checks and deploys this repository on `main`, or by manual dispatch. It uses the DataTug names `CLOUDFLARE_API_TOKEN` (secret) and `CLOUDFLARE_ACCOUNT_ID` (variable). The account must have the active `querydock.run` zone and permission to publish the custom domain configured in `wrangler.jsonc`.

The separate Angular and Go repositories own their own deploys. Changes to their production bindings and fixed origin require their deployment receipts and integration checks. Hosted verification must inspect the exact deployed Worker version, localized pages, redirects, 503 responses, unknown-route 404 and existing DataTug hostnames. A successful local build is not a production receipt.
