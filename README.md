# QueryDock.run

English and Russian Astro landings, served by the `querydock-run` Cloudflare Worker on `querydock.run`.

This first deployment is an informational preview. SQL execution, online saves, query sharing and GraphQL execution are not available. The playground and API remain separate delivery work; landing deployment does not imply their acceptance.

## Source and checks

Node 22.12+ and pnpm 11.28.8 are required. The lockfile pins dependencies; `pnpm-workspace.yaml` permits build scripts only for esbuild and workerd.

- `pnpm check`: Astro/TypeScript diagnostics.
- `pnpm build`: static HTML and sitemap generation.
- `pnpm test`: dispatcher behavior and generated bilingual HTML assertions (run after build).

No external fonts, tracking scripts, signup form or query submission form are included.

## Route ownership

| Paths | Current behavior | Future integration seam |
| --- | --- | --- |
| `/` | Redirect to `/en/` | Stable |
| `/graphql`, `/graphql/` | Redirect to `/en/graphql/` | Stable |
| `/en/*`, `/ru/*`, site assets | Astro static assets | Stable |
| `/sql`, `/sql/*` | Redirect to useful landing/engine guide, preserving `lang=ru` or `locale=ru` | Optional `QUERYDOCK_APP` service binding |
| `/_querydock/*` | 503 with no caching | Same application service binding |
| `/api/querydock`, `/api/querydock/*` | JSON 503 with no caching | Optional fixed HTTPS `API_ORIGIN` deployment configuration |
| Unknown paths | Static 404 page with 404 status | Stable |

The Worker runs before assets. There is no SPA fallback for landing URLs. The API origin is never selected from a browser-controlled target parameter. Public `/sql/{id}/{revision}/embed` routes and the account-free `/sql/embed` route (whose example lives only in the URL fragment) may be framed; every other path, including `/sql/embed/<anything>`, and landing pages deny framing. No application service or API origin is configured in this first deployment.

## Deployment ownership

`.github/workflows/ci.yml` checks integration branches and pull requests. `.github/workflows/deploy.yml` independently builds, checks and deploys this repository on `main`, or by manual dispatch. It uses the DataTug names `CLOUDFLARE_API_TOKEN` (secret) and `CLOUDFLARE_ACCOUNT_ID` (variable). The account must have the active `querydock.run` zone and permission to publish the custom domain configured in `wrangler.jsonc`.

The separate Angular and Go repositories own their own deploys. Their production bindings and fixed origin must be added only after their deployment receipts and integration checks are available. Hosted verification must inspect the exact deployed Worker version, localized pages, redirects, 503 responses, unknown-route 404 and existing DataTug hostnames. A successful local build is not a production receipt.
