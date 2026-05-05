import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SERPAPI_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RAPIDAPI_KEY: z.string().default(''),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(''),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2))
    process.exit(1)
  }
  const data = result.data
  // VULN-008: Prevent wildcard CORS in production — CORS_ORIGIN must be set explicitly
  if (data.NODE_ENV === 'production' && (!data.CORS_ORIGIN || data.CORS_ORIGIN === '*')) {
    console.error('❌ CORS_ORIGIN must be explicitly set to your production domain — refusing to start with wildcard CORS')
    process.exit(1)
  }
  return data
}

export const env = loadEnv()
