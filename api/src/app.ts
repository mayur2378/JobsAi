import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import router from './routes'
import { errorHandler, notFound } from './middleware/errorHandler'
import { generalLimiter } from './middleware/rateLimiter'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // Allow Supabase auth redirects
    contentSecurityPolicy: false,     // CSP is set in Next.js for the web layer
  }))
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(generalLimiter)

  app.use('/api/v1', router)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
