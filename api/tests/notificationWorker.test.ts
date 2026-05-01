// api/tests/notificationWorker.test.ts
import { supabaseAdmin } from '../src/config/supabase'
import { processReminders } from '../src/workers/notificationWorker'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock

function makeChain(result: { data: unknown; error: unknown }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'update', 'insert', 'in', 'order', 'limit'].forEach(
    (m) => { t[m] = jest.fn(() => t) }
  )
  t.single = jest.fn(() => Promise.resolve(result))
  t.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return t
}

describe('processReminders', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('does nothing when no reminders are due', async () => {
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [], error: null }))
    await processReminders()
    expect(mockSbFrom).toHaveBeenCalledTimes(1)
  })

  it('creates notifications and marks reminders sent', async () => {
    const reminder = {
      id: 'rem-1',
      user_id: 'user-1',
      reminder_type: 'interview',
      message: 'Prep now',
      job_applications: {
        jobs: { title: 'SWE', id: 'job-1' },
        id: 'app-1',
      },
    }
    // First call: fetch due reminders
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [reminder], error: null }))
    // Second call: insert notifications
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))
    // Third call: mark is_sent = true
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

    await processReminders()

    expect(mockSbFrom).toHaveBeenCalledTimes(3)
    const insertCall = mockSbFrom.mock.calls[1][0]
    expect(insertCall).toBe('notifications')
  })

  it('maps reminder_type to notification_type correctly', async () => {
    const cases: Array<{ input: string; expected: string }> = [
      { input: 'interview', expected: 'interview_reminder' },
      { input: 'followup', expected: 'followup' },
      { input: 'deadline', expected: 'system' },
      { input: 'custom', expected: 'system' },
    ]

    for (const { input, expected } of cases) {
      jest.clearAllMocks()

      const reminder = {
        id: `rem-${input}`, user_id: 'u1', reminder_type: input, message: null,
        job_applications: { jobs: { title: 'SWE', id: 'job-1' }, id: 'app-1' },
      }

      // Capture the insert payload
      let insertedData: any = null
      const insertChain = makeChain({ data: null, error: null })
      insertChain.insert = jest.fn((payload: any) => {
        insertedData = payload
        return insertChain
      })
      mockSbFrom.mockReturnValueOnce(makeChain({ data: [reminder], error: null }))
      mockSbFrom.mockReturnValueOnce(insertChain)
      mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

      await processReminders()

      const row = Array.isArray(insertedData) ? insertedData[0] : insertedData
      expect(row?.type).toBe(expected)
    }
  })
})
