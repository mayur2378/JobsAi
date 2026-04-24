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
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2))
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
