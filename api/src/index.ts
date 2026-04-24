import { createApp } from './app'
import { env } from './config/env'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
})
