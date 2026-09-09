# CrowdDrop Supabase Setup (Digital Products V1)

## 1. Create / open a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sign in and click **New project** (or open an existing project).
3. Choose an organization, project name, database password, and region.
4. Wait for the project to finish provisioning.

## 2. Run the SQL migration

1. In Supabase Dashboard, open **SQL** â†’ **New query**.
2. Copy the full contents of [`migrations/001_digital_products_foundation.sql`](./migrations/001_digital_products_foundation.sql).
3. Paste into the SQL editor and click **Run**.
4. Confirm success (no errors).

This creates:

- `products`
- `auth_challenges`
- `download_grants`
- RLS enabled (deny-by-default for browser clients)
- Storage buckets `product-covers` (public read) and `product-assets` (private)

## 3. Verify storage buckets (if needed)

After running SQL, open **Storage** in the dashboard.

You should see:

| Bucket | Public | Purpose |
|--------|--------|---------|
| `product-covers` | Yes | Cover images (public read OK) |
| `product-assets` | No | Private digital files |

If a bucket is missing, create it manually with the same name and public setting, then re-run the storage policy section from the migration SQL.

## 4. Get `SUPABASE_URL`

1. Supabase Dashboard â†’ **Project Settings** â†’ **API**
2. Copy **Project URL**
3. Example: `https://abcdefghijklmnop.supabase.co`

## 5. Get `SUPABASE_SERVICE_ROLE_KEY` (SERVER ONLY)

1. Same **Project Settings** â†’ **API** page
2. Under **Project API keys**, copy **`service_role` `secret`**
3. **Never** put this key in:
   - Vite env (`VITE_*`)
   - frontend source
   - git commits
   - browser-accessible config

Use it **only** in Vercel server/API environment variables.

The **`anon` `public`** key is for future client-side use if needed. This foundation does **not** use it in the app yet.

## 6. Add environment variables to Vercel

1. Open [Vercel Dashboard](https://vercel.com) â†’ your CrowdDrop project
2. **Settings** â†’ **Environment Variables**
3. Add:

| Name | Value | Environments |
|------|-------|--------------|
| `SUPABASE_URL` | Project URL from step 4 | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret from step 5 | Production, Preview, Development |
| `CROWDDROP_AUTH_SECRET` | Random 32+ byte secret (server-only) | Production, Preview, Development |
| `CROWDDROP_CLEANUP_SECRET` | Random 32+ byte secret (cleanup/cron) | Production, Preview, Development |

Generate secrets with:

```bash
openssl rand -base64 32
```

Optional: set `CRON_SECRET` if using Vercel Cron Authorization.

Do **not** prefix with `VITE_`.

## 7. Redeploy

1. Trigger a redeploy (push to `main` or **Deployments** â†’ **Redeploy**).
2. Wait for the deployment to finish.

## 8. Check `/dev` health endpoint

1. Open `https://www.usecrowddrop.xyz/dev` (or your preview URL + `/dev`).
2. Scroll to **Digital Products Backend**.
3. Click **Check Supabase Setup**.

Expected when configured correctly:

```json
{
  "ok": true,
  "database": true,
  "productsTable": true,
  "authChallengesTable": true,
  "coverBucket": true,
  "assetBucket": true,
  "assetBucketPrivate": true
}
```

Or call directly:

```bash
curl https://www.usecrowddrop.xyz/api/dev/supabase-health
```

## 9. Run migration 002 (direct upload intents + quotas)

After foundation is live, run:

[`migrations/002_product_upload_intents.sql`](./migrations/002_product_upload_intents.sql)

in the Supabase SQL editor.

This creates `product_upload_intents` (RLS deny-by-default) with:

- `ip_hash` (HMAC of client IP; never raw IP)
- `cleaned_at` for abandoned-upload cleanup
- DB size CHECKs: cover â‰¤ 2 MB, asset â‰¤ 25 MB
- bucket `product-assets` `file_size_limit` set to **25 MB**
- bucket `product-covers` `file_size_limit` remains **2 MB**

Used by:

- `POST /api/products/upload-intent`
- `POST /api/products/complete-upload`
- `GET|POST /api/products/cleanup-expired-uploads` (secret-protected)

Daily cron (Hobby-compatible): `0 3 * * *` -> `/api/products/cleanup-expired-uploads`.
Opportunistic cleanup also runs for the authenticated seller on each `upload-intent` (that seller's expired incomplete intents only).

### Upload quotas (V1)

| Limit | Value |
|-------|-------|
| Cover | 2 MB |
| Asset | 25 MB |
| Active incomplete intents / wallet | 3 |
| Intent creations / wallet / hour | 5 |
| Intent creations / IP hash / hour | 10 |
| Intent TTL | 60 minutes |

Note: Supabase signed upload tokens are typically valid ~2 hours. Server completion still refuses expired intents (1 hour). Prefer finishing uploads within the intent TTL.

### Abandoned upload cleanup

`cleanupExpiredUploadIntents()` deletes orphan cover/asset objects for expired incomplete intents, then sets `cleaned_at`. Idempotent; never touches completed product rows.

Manual invoke:

```bash
curl -X POST https://www.usecrowddrop.xyz/api/products/cleanup-expired-uploads \
  -H "Authorization: Bearer $CROWDDROP_CLEANUP_SECRET"
```

### SHA-256 tradeoff (V1)

Browser computes SHA-256 of the asset before upload and sends it with the intent. Stored on the intent and copied to `products.asset_sha256`.

This is **integrity/reference metadata**, not a security proof against a malicious seller. The server does **not** re-download up to 25 MB through Vercel to recompute the hash.

### File validation reality (direct upload)

Server no longer receives full file bytes. V1 enforces extension + declared MIME allowlists, size limits, server-owned paths, object existence + size (+ MIME metadata when present).

### Legacy multipart endpoint

`POST /api/products/draft` returns **410** in production. Prefer the direct-upload intent flow. Emergency local only: `ALLOW_LEGACY_PRODUCT_DRAFT=1`.

