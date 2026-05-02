// api/tests/profile.test.ts
import express from 'express'
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
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('GET /api/v1/profile', () => {
  it('returns 401 without token', async () => {
    const res = await request(createApp()).get('/api/v1/profile')
    expect(res.status).toBe(401)
  })

  it('returns profile data for authenticated user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', full_name: 'Alice', onboarding_completed: false },
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.full_name).toBe('Alice')
    expect(res.body.error).toBeNull()
  })
})

describe('PUT /api/v1/profile', () => {
  it('updates profile and returns updated row', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', full_name: 'Bob', location: 'Austin', updated_at: new Date().toISOString() },
      error: null,
    })

    const res = await request(createApp())
      .put('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ full_name: 'Bob', location: 'Austin' })

    expect(res.status).toBe(200)
    expect(res.body.data.full_name).toBe('Bob')
  })

  it('returns 400 for invalid field type', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .put('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ salary_min: 'not-a-number' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation error')
  })
})

describe('POST /api/v1/profile/onboarding', () => {
  it('marks onboarding_completed true', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', onboarding_completed: true },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/profile/onboarding')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.onboarding_completed).toBe(true)
  })
})

describe('GET /api/v1/profile — error path', () => {
  it('returns 500 when database query fails', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const res = await request(createApp())
      .get('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to fetch profile')
  })
})

describe('PUT /api/v1/profile — error path', () => {
  it('returns 500 when database update fails', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const res = await request(createApp())
      .put('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ full_name: 'Bob' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('db error')
  })
})

describe('POST /api/v1/profile/onboarding — error path', () => {
  it('returns 500 when database update fails', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const res = await request(createApp())
      .post('/api/v1/profile/onboarding')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to complete onboarding')
  })
})
