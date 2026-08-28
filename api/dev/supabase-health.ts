import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiRequest = IncomingMessage & { method?: string }

const PRODUCT_COVER_BUCKET = 'product-covers'
const PRODUCT_ASSET_BUCKET = 'product-assets'

type HealthResult = {
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

function readEnv(): { ok: true, url: string, key: string } | { ok: false, error: 'supabase_not_configured', missing: string[] } {
  const missing: string[] = []
  const url = process.env.SUPABASE_URL?.trim() ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!url)
    missing.push('SUPABASE_URL')
  if (!key)
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length)
    return { ok: false, error: 'supabase_not_configured', missing }
  return { ok: true, url, key }
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  const result: HealthResult = {
    ok: false,
    database: false,
    productsTable: false,
    authChallengesTable: false,
    coverBucket: false,
    assetBucket: false,
    assetBucketPrivate: false,
    stage: 'env',
  }

  try {
    const env = readEnv()
    if (!env.ok) {
      res.statusCode = 503
      res.end(JSON.stringify({ ...result, ...env }))
      return
    }

    result.stage = 'client'
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.url, env.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    result.stage = 'products_table'
    const { error: productsError } = await client.from('products').select('id').limit(1)
    result.productsTable = !productsError
    if (productsError) {
      res.statusCode = 503
      res.end(JSON.stringify({
        ...result,
        error: 'products_table_unavailable',
        detail: productsError.message,
      }))
      return
    }

    result.stage = 'auth_challenges_table'
    const { error: challengesError } = await client.from('auth_challenges').select('id').limit(1)
    result.authChallengesTable = !challengesError
    if (challengesError) {
      res.statusCode = 503
      res.end(JSON.stringify({
        ...result,
        error: 'auth_challenges_table_unavailable',
        detail: challengesError.message,
      }))
      return
    }

    result.database = true
    result.stage = 'storage'

    const { data: buckets, error: bucketError } = await client.storage.listBuckets()
    if (bucketError) {
      res.statusCode = 503
      res.end(JSON.stringify({
        ...result,
        error: 'storage_unavailable',
        detail: bucketError.message,
      }))
      return
    }

    const cover = buckets?.find(b => b.id === PRODUCT_COVER_BUCKET || b.name === PRODUCT_COVER_BUCKET)
    const asset = buckets?.find(b => b.id === PRODUCT_ASSET_BUCKET || b.name === PRODUCT_ASSET_BUCKET)

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

    res.statusCode = result.ok ? 200 : 503
    res.end(JSON.stringify(result))
  }
  catch (error) {
    console.error('[supabase-health]', result.stage, error)
    res.statusCode = 500
    res.end(JSON.stringify({
      ok: false,
      error: 'supabase_health_check_failed',
      stage: result.stage ?? 'handler',
      detail: error instanceof Error ? error.message : 'unknown',
    }))
  }
}
