import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_ASSET_BUCKET,
  PRODUCT_COVER_BUCKET,
} from './productFoundation.js'

export type SupabaseHealthResult = {
  ok: boolean
  database?: boolean
  productsTable?: boolean
  authChallengesTable?: boolean
  coverBucket?: boolean
  assetBucket?: boolean
  assetBucketPrivate?: boolean
  error?: string
  missing?: string[]
}

async function tableReachable(
  client: SupabaseClient,
  table: 'products' | 'auth_challenges',
): Promise<boolean> {
  const { error } = await client.from(table).select('id').limit(1)
  return !error
}

export async function checkSupabaseHealth(client: SupabaseClient): Promise<SupabaseHealthResult> {
  const result: SupabaseHealthResult = {
    ok: false,
    database: false,
    productsTable: false,
    authChallengesTable: false,
    coverBucket: false,
    assetBucket: false,
    assetBucketPrivate: false,
  }

  try {
    const productsTable = await tableReachable(client, 'products')
    const authChallengesTable = await tableReachable(client, 'auth_challenges')
    result.productsTable = productsTable
    result.authChallengesTable = authChallengesTable
    result.database = productsTable && authChallengesTable

    const { data: buckets, error: bucketError } = await client.storage.listBuckets()
    if (bucketError) {
      result.error = 'storage_unavailable'
      return result
    }

    const cover = buckets?.find(bucket => bucket.id === PRODUCT_COVER_BUCKET || bucket.name === PRODUCT_COVER_BUCKET)
    const asset = buckets?.find(bucket => bucket.id === PRODUCT_ASSET_BUCKET || bucket.name === PRODUCT_ASSET_BUCKET)

    result.coverBucket = Boolean(cover)
    result.assetBucket = Boolean(asset)
    result.assetBucketPrivate = Boolean(asset && asset.public === false)

    result.ok = Boolean(
      result.database
      && result.productsTable
      && result.authChallengesTable
      && result.coverBucket
      && result.assetBucket
      && result.assetBucketPrivate,
    )

    if (!result.ok && !result.error)
      result.error = 'supabase_setup_incomplete'

    return result
  }
  catch (error) {
    console.error('[supabase-health]', error)
    result.error = 'supabase_health_check_failed'
    return result
  }
}
