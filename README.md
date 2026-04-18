# Cloudflare R2 Image Manager (Vite + React)

This project is a Vite React UI plus a Cloudflare Worker API for listing, uploading, and deleting images in the **root directory** of an R2 bucket.

## Features

- Image list view from R2 bucket root (`/api/images`)
- Delete selected image (`DELETE /api/images/:key`)
- Upload image from local file system picker (`POST /api/images`)
- 3 information lines under action buttons:
  - File path in FS
  - Public/access URL for the image
  - Basic image information
- Bucket configuration endpoint (`/api/config`) used by UI

## Prerequisites

- Node.js 20+
- Cloudflare account with an R2 bucket
- Wrangler authentication (`wrangler login`)

## Cloudflare Bucket Configuration

Edit [wrangler.toml](./wrangler.toml):

- `[[r2_buckets]].bucket_name`
- `[[r2_buckets]].preview_bucket_name`
- `[vars].R2_BUCKET_NAME`
- `[vars].R2_PUBLIC_BASE_URL` (optional public domain)
- `[vars].BUCKET_LIST_LIMIT`

Optional local override:

1. Copy `.dev.vars.example` to `.dev.vars`
2. Set values for local development

## Run Locally

Install dependencies:

```bash
npm install
```

Run UI + Worker in parallel:

```bash
npm run dev:full
```

- React UI: `http://localhost:5173`
- Worker API: `http://127.0.0.1:8787`

The Vite dev server proxies `/api/*` to the Worker.

## Deploy Worker API

```bash
npm run deploy:api
```

## Deploy UI to Azure Static Web Apps

The React UI can be deployed as a [PWA](https://web.dev/progressive-web-apps/) to [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/).

### GitHub Actions (automated)

1. Create an Azure Static Web App resource in the Azure portal.
2. Copy the deployment token from **Manage deployment token** in the Azure portal.
3. Add it as a repository secret named `AZURE_STATIC_WEB_APPS_API_TOKEN` in **Settings → Secrets and variables → Actions**.
4. Push to `main` — the workflow in `.github/workflows/azure-static-web-apps.yml` will build and deploy automatically.

> **Note:** The `/api/*` routes must still be served by the Cloudflare Worker. Configure the Azure SWA to proxy `/api/*` to the deployed Worker URL, or update the app's API base URL for the Azure environment.

## API Summary

- `GET /api/config` - bucket configuration consumed by UI
- `GET /api/images` - list root images
- `GET /api/images/object/:key` - stream image object (fallback URL mode)
- `POST /api/images` - upload image via `multipart/form-data`, field `file`
- `DELETE /api/images/:key` - delete image by object key