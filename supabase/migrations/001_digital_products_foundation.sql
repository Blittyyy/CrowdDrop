-- CrowdDrop Digital Products V1 — Supabase foundation
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL → New query).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_wallet text NOT NULL,
  chain_id bigint,
  contract_address text,
  drop_id bigint,
  title text NOT NULL,
  description text NOT NULL,
  cover_path text NOT NULL,
  asset_path text NOT NULL,
  asset_mime text NOT NULL,
  asset_size_bytes bigint NOT NULL,
  asset_sha256 text NOT NULL,
  file_type_label text,
  status text NOT NULL,
  create_tx_hash text,
  locked_contribution text,
  locked_goal integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT products_status_check CHECK (status IN ('draft', 'locked')),
  CONSTRAINT products_seller_wallet_lowercase CHECK (seller_wallet = lower(seller_wallet)),
  CONSTRAINT products_contract_address_lowercase CHECK (
    contract_address IS NULL OR contract_address = lower(contract_address)
  ),
  CONSTRAINT products_asset_size_positive CHECK (asset_size_bytes > 0),
  CONSTRAINT products_locked_requires_drop CHECK (
    status <> 'locked'
    OR (
      chain_id IS NOT NULL
      AND contract_address IS NOT NULL
      AND drop_id IS NOT NULL
      AND finalized_at IS NOT NULL
    )
  )
);

-- At most one locked product per on-chain Drop.
CREATE UNIQUE INDEX IF NOT EXISTS products_locked_drop_unique
  ON products (chain_id, contract_address, drop_id)
  WHERE status = 'locked' AND drop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_seller_wallet_idx ON products (seller_wallet);
CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL UNIQUE,
  wallet text NOT NULL,
  action text NOT NULL,
  drop_id bigint,
  chain_id bigint NOT NULL,
  contract_address text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_challenges_wallet_lowercase CHECK (wallet = lower(wallet)),
  CONSTRAINT auth_challenges_contract_address_lowercase CHECK (
    contract_address = lower(contract_address)
  ),
  CONSTRAINT auth_challenges_action_check CHECK (
    action IN ('auth_test', 'seller_upload', 'product_download')
  )
);

CREATE INDEX IF NOT EXISTS auth_challenges_nonce_idx ON auth_challenges (nonce);
CREATE INDEX IF NOT EXISTS auth_challenges_wallet_idx ON auth_challenges (wallet);
CREATE INDEX IF NOT EXISTS auth_challenges_expires_at_idx ON auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS download_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  drop_id bigint NOT NULL,
  wallet text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT download_grants_wallet_lowercase CHECK (wallet = lower(wallet))
);

CREATE INDEX IF NOT EXISTS download_grants_product_id_idx ON download_grants (product_id);
CREATE INDEX IF NOT EXISTS download_grants_wallet_idx ON download_grants (wallet);

-- ---------------------------------------------------------------------------
-- Row Level Security — deny-by-default for browser clients
-- Service role (server API) bypasses RLS.
-- ---------------------------------------------------------------------------

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_grants ENABLE ROW LEVEL SECURITY;

-- Intentionally no SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated roles.
-- All product metadata reads/writes go through Vercel API using SUPABASE_SERVICE_ROLE_KEY.

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('product-covers', 'product-covers', true, 2097152),
  ('product-assets', 'product-assets', false, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- ---------------------------------------------------------------------------
-- Storage policies — product-covers public read; product-assets private
-- ---------------------------------------------------------------------------

-- Remove prior policies if re-running setup.
DROP POLICY IF EXISTS "product_covers_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_assets_deny_public_read" ON storage.objects;

-- Covers: anyone may read (public bucket metadata + objects).
CREATE POLICY "product_covers_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'product-covers');

-- Assets: no public read/write/update/delete policies.
-- Anonymous and authenticated clients cannot access product-assets objects.
-- Server uses service role for uploads and signed download URLs.
