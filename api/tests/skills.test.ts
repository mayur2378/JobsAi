// api/tests/skills.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: jest.fn(), auth: { getUser: jest.fn() } },
}))

function mockVerifyToken(userId = 'user-abc') {
  ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId, email: 'test@test.com' } },
    error: null,
  })
}

function mockFrom(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('GET /api/v1/skills', () => {
  it('returns skills list for authenticated user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.order.mockResolvedValue({
      data: [{ id: 'skill-1', name: 'TypeScript', source: 'manual' }],
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe('TypeScript')
  })
})

describe('POST /api/v1/skills', () => {
  it('creates a skill and returns 201', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'skill-2', name: 'React', source: 'manual', proficiency: 'expert' },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'React', proficiency: 'expert' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('React')
  })

  it('returns 400 when name is missing', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')
      .send({ proficiency: 'expert' })

    expect(res.status).toBe(400)
  })
})

describe('PUT /api/v1/skills/:id', () => {
  it('updates skill proficiency', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'skill-1', name: 'TypeScript', proficiency: 'expert' },
      error: null,
    })

    const res = await request(createApp())
      .put('/api/v1/skills/skill-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ proficiency: 'expert' })

    expect(res.status).toBe(200)
    expect(res.body.data.proficiency).toBe('expert')
  })
})

describe('PUT /api/v1/skills/:id — not found', () => {
  it('returns 404 when skill does not exist or belongs to another user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: null })

    const res = await request(createApp())
      .put('/api/v1/skills/nonexistent-id')
      .set('Authorization', 'Bearer valid-token')
      .send({ proficiency: 'expert' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Skill not found')
  })
})

describe('GET /api/v1/skills — unauthenticated', () => {
  it('returns 401 without token', async () => {
    const res = await request(createApp()).get('/api/v1/skills')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/v1/skills/:id', () => {
  it('deletes skill and returns 204', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    // Route calls: .delete().eq(id).eq(user_id).select() — resolve on select()
    chain.select.mockResolvedValueOnce({
      data: [{ id: 'skill-1' }],
      error: null,
    })

    const res = await request(createApp())
      .delete('/api/v1/skills/skill-1')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })

  it('returns 404 when skill does not exist or belongs to another user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.select.mockResolvedValueOnce({ data: [], error: null })

    const res = await request(createApp())
      .delete('/api/v1/skills/nonexistent-id')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Skill not found')
  })
})
