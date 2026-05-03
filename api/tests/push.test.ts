import { sendPush } from '../src/services/push'

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  cert: jest.fn((json) => json),
}))

const mockSend = jest.fn()
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}))

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

jest.mock('../src/config/env', () => ({
  env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"test"}' },
}))

import { supabaseAdmin } from '../src/config/supabase'

describe('sendPush', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends FCM message to all tokens for a user', async () => {
    const mockTokens = [
      { id: 'tok-1', token: 'fcm-token-abc', platform: 'android' },
      { id: 'tok-2', token: 'fcm-token-def', platform: 'web' },
    ]
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: mockTokens, error: null }),
    })
    mockSend.mockResolvedValue('message-id-1')

    await sendPush('user-123', 'New match!', 'Frontend Engineer at Acme — 82%')

    expect(mockSend).toHaveBeenCalledTimes(2)
    const firstCall = mockSend.mock.calls[0][0]
    expect(firstCall.token).toBe('fcm-token-abc')
    expect(firstCall.notification.title).toBe('New match!')
    expect(firstCall.notification.body).toBe('Frontend Engineer at Acme — 82%')
  })

  it('deletes invalid tokens when FCM rejects them', async () => {
    const mockTokens = [{ id: 'tok-bad', token: 'invalid-token', platform: 'web' }]
    const mockDelete = jest.fn().mockReturnThis()
    const mockIn = jest.fn().mockResolvedValue({ error: null })
    ;(supabaseAdmin.from as jest.Mock)
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockTokens, error: null }),
      })
      .mockReturnValueOnce({ delete: mockDelete })
    mockDelete.mockReturnValue({ in: mockIn })

    const err = new Error('invalid token') as any
    err.code = 'messaging/registration-token-not-registered'
    mockSend.mockRejectedValue(err)

    await sendPush('user-123', 'Test', 'Body')

    expect(mockIn).toHaveBeenCalledWith('id', ['tok-bad'])
  })

  it('does nothing when the user has no tokens', async () => {
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    })

    await sendPush('user-no-tokens', 'Test', 'Body')

    expect(mockSend).not.toHaveBeenCalled()
  })
})
