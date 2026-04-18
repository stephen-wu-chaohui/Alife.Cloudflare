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

## Domain Strategy

Using `cloudflare.ccalc.live` for this PWA makes sense and fits a clean subdomain structure.

Recommended layout:

- `cloudflare.ccalc.live` -> Frontend (Azure Static Web Apps)
- `images.ccalc.live` -> Cloudflare Worker API + public image URLs backed by R2
- `demo.ccalc.live`, `dev.ccalc.live` -> Other environments/sites

This split keeps frontend hosting and storage/API concerns separated while staying easy to reason about.

## Custom Domain Setup

### 1) Frontend domain (`cloudflare.ccalc.live`)

1. In Azure Static Web Apps, add custom domain `cloudflare.ccalc.live`.
2. In Cloudflare DNS, create/update the record Azure asks for (usually a CNAME).
3. Complete domain validation in Azure.
4. Keep HTTPS enabled after validation.

### 2) API/storage domain (`images.ccalc.live`)

1. In Cloudflare Workers, attach custom domain `images.ccalc.live` to this Worker.
2. Ensure no old Worker route is still bound to `images.ccalc.live`.
3. Keep DNS proxied in Cloudflare.

### 3) Frontend build environment

Set the frontend API base URL to `https://images.ccalc.live` for production builds.

Current GitHub Actions workflow already sets:

- `VITE_API_BASE_URL=https://images.ccalc.live`

### 4) Worker runtime variables

Set these in Worker config (`wrangler.toml` and/or Cloudflare dashboard):

- `R2_BUCKET_NAME=ccalc`
- `R2_PUBLIC_BASE_URL=https://images.ccalc.live`
- `BUCKET_LIST_LIMIT=500`

## API Summary

- `GET /api/config` - bucket configuration consumed by UI
- `GET /api/images` - list root images
- `GET /api/images/object/:key` - stream image object (fallback URL mode)
- `POST /api/images` - upload image via `multipart/form-data`, field `file`
- `DELETE /api/images/:key` - delete image by object key