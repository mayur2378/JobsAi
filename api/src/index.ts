import 'dotenv/config'
import { createApp } from './app'
import { env } from './config/env'
import { startScheduler } from './workers/scheduler'
import { startNotificationWorker } from './workers/notificationWorker'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
  if (env.NODE_ENV !== 'test') {
    startScheduler()
    startNotificationWorker()
  }
})
