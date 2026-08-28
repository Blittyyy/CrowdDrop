# CrowdDrop Supabase Setup (Digital Products V1)

## 1. Create / open a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sign in and click **New project** (or open an existing project).
3. Choose an organization, project name, database password, and region.
4. Wait for the project to finish provisioning.

## 2. Run the SQL migration

1. In Supabase Dashboard, open **SQL** → **New query**.
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

1. Supabase Dashboard → **Project Settings** → **API**
2. Copy **Project URL**
3. Example: `https://abcdefghijklmnop.supabase.co`

## 5. Get `SUPABASE_SERVICE_ROLE_KEY` (SERVER ONLY)

1. Same **Project Settings** → **API** page
2. Under **Project API keys**, copy **`service_role` `secret`**
3. **Never** put this key in:
   - Vite env (`VITE_*`)
   - frontend source
   - git commits
   - browser-accessible config

Use it **only** in Vercel server/API environment variables.

The **`anon` `public`** key is for future client-side use if needed. This foundation does **not** use it in the app yet.

## 6. Add environment variables to Vercel

1. Open [Vercel Dashboard](https://vercel.com) → your CrowdDrop project
2. **Settings** → **Environment Variables**
3. Add:

| Name | Value | Environments |
|------|-------|--------------|
| `SUPABASE_URL` | Project URL from step 4 | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret from step 5 | Production, Preview, Development |

Do **not** prefix with `VITE_`.

## 7. Redeploy

1. Trigger a redeploy (push to `main` or **Deployments** → **Redeploy**).
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
