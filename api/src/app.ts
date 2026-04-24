import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import router from './routes'
import { errorHandler, notFound } from './middleware/errorHandler'
import { generalLimiter } from './middleware/rateLimiter'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  )
  app.use(express.json({ limit: '10mb' }))
  app.use(generalLimiter)

  app.use('/api/v1', router)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
