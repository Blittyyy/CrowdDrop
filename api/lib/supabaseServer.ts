import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatSupabaseConfigError,
  readSupabaseEnv,
} from './supabaseEnv.js'

export type SupabaseServerClientResult =
  | { ok: true, client: SupabaseClient }
  | { ok: false, error: 'supabase_not_configured', missing: string[] }

let cachedClient: SupabaseClient | null = null
let cachedConfigKey: string | null = null

function configCacheKey(config: { url: string, serviceRoleKey: string }): string {
  return `${config.url}:${config.serviceRoleKey.length}`
}

/** Server-only Supabase admin client (service role). Never import from frontend code. */
export async function getSupabaseAdmin(): Promise<SupabaseServerClientResult> {
  const env = readSupabaseEnv()
  if (env.ok === false) {
    return {
      ok: false,
      error: env.error,
      missing: env.missing,
    }
  }

  const key = configCacheKey(env)
  if (!cachedClient || cachedConfigKey !== key) {
    const { createClient } = await import('@supabase/supabase-js')
    cachedClient = createClient(env.url, env.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    cachedConfigKey = key
  }

  return { ok: true, client: cachedClient }
}

export async function requireSupabaseAdmin(): Promise<SupabaseClient> {
  const result = await getSupabaseAdmin()
  if (result.ok === false)
    throw new Error(formatSupabaseConfigError(result))
  return result.client
}

/** Reset cached client (tests only). */
export function resetSupabaseAdminCache(): void {
  cachedClient = null
  cachedConfigKey = null
}
