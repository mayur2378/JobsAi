import request from 'supertest'
import express from 'express'
import notificationsRouter from '../src/routes/notifications'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/middleware/auth', () => ({
  verifyToken: jest.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-abc'
    next()
  }),
}))

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const app = express()
app.use(express.json())
app.use('/notifications', notificationsRouter)

describe('POST /notifications/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upserts the token and returns { registered: true }', async () => {
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })

    const res = await request(app)
      .post('/notifications/register')
      .send({ token: 'fcm-abc', platform: 'android' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ registered: true })
  })

  it('returns 400 for missing token', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ platform: 'android' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid platform', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ token: 'abc', platform: 'ios' })

    expect(res.status).toBe(400)
  })
})
