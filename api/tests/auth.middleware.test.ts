import express, { Router } from 'express'
import request from 'supertest'
import { verifyToken, AuthRequest } from '../src/middleware/auth'
import { supabaseAdmin } from '../src/config/supabase'

function makeApp() {
  const app = express()
  app.use(express.json())
  const router = Router()
  router.get('/protected', verifyToken, (req, res) => {
    res.json({ userId: (req as AuthRequest).userId })
  })
  app.use('/api/v1', router)
  return app
}

describe('verifyToken middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp()).get('/api/v1/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing authorization header')
    expect(res.body.data).toBeNull()
  })

  it('returns 401 when header does not start with Bearer', async () => {
    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Basic abc123')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing authorization header')
  })

  it('returns 401 when token is invalid', async () => {
    jest.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    } as any)

    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer bad-token')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid or expired token')
  })

  it('calls next and attaches userId when token is valid', async () => {
    jest.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValueOnce({
      data: { user: { id: 'user-abc', email: 'test@example.com' } },
      error: null,
    } as any)

    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('user-abc')
  })
})
