import request from 'supertest'
import { createApp } from '../src/app'

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await request(createApp()).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ok')
    expect(res.body.error).toBeNull()
    expect(typeof res.body.data.timestamp).toBe('string')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
