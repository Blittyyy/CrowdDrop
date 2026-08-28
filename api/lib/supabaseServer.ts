import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  formatSupabaseConfigError,
  readSupabaseEnv,
  type SupabaseEnvResult,
} from './supabaseEnv'

export type SupabaseServerClientResult =
  | { ok: true, client: SupabaseClient }
  | Extract<SupabaseEnvResult, { ok: false }>

let cachedClient: SupabaseClient | null = null
let cachedConfigKey: string | null = null

function configCacheKey(config: Extract<SupabaseEnvResult, { ok: true }>): string {
  return `${config.url}:${config.serviceRoleKey.length}`
}

/** Server-only Supabase admin client (service role). Never import from frontend code. */
export function getSupabaseAdmin(): SupabaseServerClientResult {
  const env = readSupabaseEnv()
  if (!env.ok)
    return env

  const key = configCacheKey(env)
  if (!cachedClient || cachedConfigKey !== key) {
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

export function requireSupabaseAdmin(): SupabaseClient {
  const result = getSupabaseAdmin()
  if (!result.ok)
    throw new Error(formatSupabaseConfigError(result))
  return result.client
}

/** Reset cached client (tests only). */
export function resetSupabaseAdminCache(): void {
  cachedClient = null
  cachedConfigKey = null
}
