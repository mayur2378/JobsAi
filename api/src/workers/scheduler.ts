import cron from 'node-cron'
import { scrapeForAllActiveUsers } from './scraper'
import { runPipelineForJobs } from './matchEngine'

let schedulerTask: ReturnType<typeof cron.schedule> | null = null

async function runFullPipeline(): Promise<void> {
  console.log('[scheduler] Starting jobs pipeline run...')
  try {
    const results = await scrapeForAllActiveUsers()
    for (const { userId, jobIds } of results) {
      if (jobIds.length > 0) {
        await runPipelineForJobs(jobIds, userId)
      }
    }
    console.log(`[scheduler] Pipeline complete. Processed ${results.length} users.`)
  } catch (err) {
    console.error('[scheduler] Pipeline run failed:', err)
  }
}

export function startScheduler(): void {
  if (schedulerTask) return

  schedulerTask = cron.schedule('0 */2 * * *', () => {
    runFullPipeline().catch(console.error)
  })

  console.log('[scheduler] Jobs pipeline scheduled (every 2 hours)')
}

export function stopScheduler(): void {
  schedulerTask?.stop()
  schedulerTask = null
}
