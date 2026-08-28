/**
 * Serverless-safe Supabase health check.
 * No top-level @supabase/supabase-js import — loaded dynamically at runtime.
 */

const PRODUCT_COVER_BUCKET = 'product-covers'
const PRODUCT_ASSET_BUCKET = 'product-assets'

export type SupabaseHealthResult = {
  ok: boolean
  database?: boolean
  productsTable?: boolean
  authChallengesTable?: boolean
  coverBucket?: boolean
  assetBucket?: boolean
  assetBucketPrivate?: boolean
  error?: string
  stage?: string
  detail?: string
  missing?: string[]
}

type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => { limit: (n: number) => Promise<{ error: { message: string } | null }> }
  }
  storage: {
    listBuckets: () => Promise<{ data: Array<{ id?: string, name: string, public?: boolean }> | null, error: { message: string } | null }>
  }
}

export async function runSupabaseHealthCheck(): Promise<SupabaseHealthResult> {
  const result: SupabaseHealthResult = {
    ok: false,
    database: false,
    productsTable: false,
    authChallengesTable: false,
    coverBucket: false,
    assetBucket: false,
    assetBucketPrivate: false,
    stage: 'env',
  }

  const { readSupabaseEnv } = await import('./supabaseEnv.js')
  const env = readSupabaseEnv()
  if (!env.ok) {
    return {
      ...result,
      error: env.error,
      missing: env.missing,
      stage: 'env',
    }
  }

  result.stage = 'client'
  let client: SupabaseClientLike
  try {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(env.url, env.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }) as SupabaseClientLike
  }
  catch (error) {
    console.error('[supabase-health] client init', error)
    return {
      ...result,
      error: 'supabase_client_init_failed',
      stage: 'client',
      detail: error instanceof Error ? error.message : 'unknown',
    }
  }

  result.stage = 'products_table'
  const { error: productsError } = await client.from('products').select('id').limit(1)
  result.productsTable = !productsError
  if (productsError) {
    console.error('[supabase-health] products table', productsError)
    return {
      ...result,
      error: 'products_table_unavailable',
      stage: 'products_table',
      detail: productsError.message,
    }
  }

  result.stage = 'auth_challenges_table'
  const { error: challengesError } = await client.from('auth_challenges').select('id').limit(1)
  result.authChallengesTable = !challengesError
  if (challengesError) {
    console.error('[supabase-health] auth_challenges table', challengesError)
    return {
      ...result,
      error: 'auth_challenges_table_unavailable',
      stage: 'auth_challenges_table',
      detail: challengesError.message,
    }
  }

  result.database = true
  result.stage = 'storage'

  const { data: buckets, error: bucketError } = await client.storage.listBuckets()
  if (bucketError) {
    console.error('[supabase-health] storage', bucketError)
    return {
      ...result,
      error: 'storage_unavailable',
      stage: 'storage',
      detail: bucketError.message,
    }
  }

  const cover = buckets?.find(bucket =>
    bucket.id === PRODUCT_COVER_BUCKET || bucket.name === PRODUCT_COVER_BUCKET,
  )
  const asset = buckets?.find(bucket =>
    bucket.id === PRODUCT_ASSET_BUCKET || bucket.name === PRODUCT_ASSET_BUCKET,
  )

  result.coverBucket = Boolean(cover)
  result.assetBucket = Boolean(asset)
  result.assetBucketPrivate = Boolean(asset && asset.public === false)
  result.stage = 'complete'

  result.ok = Boolean(
    result.database
    && result.productsTable
    && result.authChallengesTable
    && result.coverBucket
    && result.assetBucket
    && result.assetBucketPrivate,
  )

  if (!result.ok)
    result.error = 'supabase_setup_incomplete'

  return result
}
