// api/src/workers/notificationWorker.ts
import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'

type ReminderType = 'interview' | 'followup' | 'deadline' | 'custom'
type NotificationType = 'interview_reminder' | 'followup' | 'system'

function mapReminderType(t: ReminderType): NotificationType {
  if (t === 'interview') return 'interview_reminder'
  if (t === 'followup') return 'followup'
  return 'system'
}

export async function processReminders(): Promise<void> {
  const { data: reminders, error } = await supabaseAdmin
    .from('reminders')
    .select(
      `id, user_id, reminder_type, message,
       job_applications!inner(id, jobs!inner(id, title))`
    )
    .lte('remind_at', new Date().toISOString())
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[notificationWorker] Failed to fetch reminders:', error)
    return
  }

  const rows = (reminders ?? []) as any[]
  if (rows.length === 0) return

  const notifications = rows.map((r) => ({
    user_id: r.user_id,
    type: mapReminderType(r.reminder_type as ReminderType),
    title: r.job_applications.jobs.title,
    message: r.message ?? '',
    metadata: {
      job_id: r.job_applications.jobs.id,
      application_id: r.job_applications.id,
    },
  }))

  const { error: insertError } = await supabaseAdmin
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    console.error('[notificationWorker] Failed to insert notifications:', insertError)
    return
  }

  const ids = rows.map((r) => r.id)
  await supabaseAdmin
    .from('reminders')
    .update({ is_sent: true })
    .in('id', ids)

  console.log(`[notificationWorker] Processed ${rows.length} reminders`)
}

let workerTask: ReturnType<typeof cron.schedule> | null = null

export function startNotificationWorker(): void {
  if (workerTask) return
  workerTask = cron.schedule('*/15 * * * *', () => {
    processReminders().catch(console.error)
  })
  console.log('[notificationWorker] Reminder worker scheduled (every 15 min)')
}

export function stopNotificationWorker(): void {
  workerTask?.stop()
  workerTask = null
}
