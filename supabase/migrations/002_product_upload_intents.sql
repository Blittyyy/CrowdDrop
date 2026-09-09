-- CrowdDrop Digital Products V1 — direct upload intents + quota fields
-- Run after 001_digital_products_foundation.sql
-- (Not yet applied in production at time of authoring.)

CREATE TABLE IF NOT EXISTS product_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_wallet text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  cover_path text NOT NULL,
  cover_expected_mime text NOT NULL,
  cover_expected_size bigint NOT NULL,
  asset_path text NOT NULL,
  asset_expected_mime text NOT NULL,
  asset_expected_size bigint NOT NULL,
  asset_original_name text,
  asset_expected_sha256 text NOT NULL,
  file_type_label text NOT NULL,
  -- HMAC-SHA256 hex of client IP (server-only salt). Never store raw IP.
  ip_hash text,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  cleaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_upload_intents_seller_wallet_lowercase CHECK (
    seller_wallet = lower(seller_wallet)
  ),
  CONSTRAINT product_upload_intents_cover_size_positive CHECK (cover_expected_size > 0),
  CONSTRAINT product_upload_intents_asset_size_positive CHECK (asset_expected_size > 0),
  CONSTRAINT product_upload_intents_cover_size_max CHECK (cover_expected_size <= 2097152),
  CONSTRAINT product_upload_intents_asset_size_max CHECK (asset_expected_size <= 26214400),
  CONSTRAINT product_upload_intents_sha256_hex CHECK (
    asset_expected_sha256 ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS product_upload_intents_seller_wallet_idx
  ON product_upload_intents (seller_wallet);

CREATE INDEX IF NOT EXISTS product_upload_intents_seller_created_idx
  ON product_upload_intents (seller_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS product_upload_intents_ip_created_idx
  ON product_upload_intents (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_upload_intents_expires_at_idx
  ON product_upload_intents (expires_at);

CREATE INDEX IF NOT EXISTS product_upload_intents_completed_at_idx
  ON product_upload_intents (completed_at);

CREATE INDEX IF NOT EXISTS product_upload_intents_cleanup_idx
  ON product_upload_intents (expires_at)
  WHERE completed_at IS NULL AND cleaned_at IS NULL;

ALTER TABLE product_upload_intents ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for anon/authenticated.
-- Service role (Vercel API) bypasses RLS.

-- Lower product-assets bucket limit from 50 MB → 25 MB (V1 cost control).
-- Covers remain 2 MB.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'product-assets';

UPDATE storage.buckets
SET file_size_limit = 2097152
WHERE id = 'product-covers';
