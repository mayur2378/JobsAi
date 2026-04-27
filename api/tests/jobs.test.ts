import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

jest.mock('../src/workers/matchEngine', () => ({
  runPipelineForJobs: jest.fn().mockResolvedValue(undefined),
  recomputeForUser: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/workers/scraper', () => ({
  scrapeJobsForUser: jest.fn().mockResolvedValue(['job-1', 'job-2']),
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock
const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock

function makeChain(result: { data: unknown; error: unknown }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'not', 'limit', 'update', 'upsert', 'insert', 'delete'].forEach(
    (m) => { t[m] = jest.fn(() => t) }
  )
  ;['single', 'order', 'in'].forEach((m) => {
    t[m] = jest.fn(() => Promise.resolve(result))
  })
  t.range = jest.fn(() => Promise.resolve(result))
  t.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return t
}

function authAs(userId: string) {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: userId, email: 'test@example.com' } },
    error: null,
  })
}

const app = createApp()

describe('GET /api/v1/jobs', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/jobs')
    expect(res.status).toBe(401)
  })

  it('returns 200 with jobs array on valid auth', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [
          {
            match_score: 75,
            match_label: 'strong',
            refined_score: 78,
            ai_refined: true,
            job_id: 'job-1',
            jobs: {
              id: 'job-1',
              title: 'Frontend Engineer',
              company: 'Acme',
              location: 'Austin, TX',
              is_remote: false,
              salary_min: 100000,
              salary_max: 130000,
              apply_url: null,
              posted_at: '2026-04-24T10:00:00Z',
            },
          },
        ],
        error: null,
      })
    )
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [], error: null }))

    const res = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.jobs).toHaveLength(1)
    expect(res.body.data.jobs[0].title).toBe('Frontend Engineer')
    expect(res.body.data.jobs[0].match_score).toBe(75)
    expect(res.body.data.jobs[0].application_status).toBeNull()
  })
})

describe('GET /api/v1/jobs/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/jobs/some-id')
    expect(res.status).toBe(401)
  })

  it('returns 404 when job match not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: null, error: { message: 'No rows' } })
    )

    const res = await request(app)
      .get('/api/v1/jobs/nonexistent-id')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/jobs/:id/match', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/jobs/some-id/match')
    expect(res.status).toBe(401)
  })

  it('returns match data for a known job', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          match_score: 72,
          match_label: 'strong',
          refined_score: 78,
          ai_refined: true,
          skills_matched: ['React'],
          skills_missing: ['GraphQL'],
          match_explanation: 'Good match.',
          gaps_to_improve: ['Learn GraphQL'],
        },
        error: null,
      })
    )

    const res = await request(app)
      .get('/api/v1/jobs/job-1/match')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.match_score).toBe(72)
    expect(res.body.data.ai_refined).toBe(true)
  })
})

describe('POST /api/v1/jobs/refresh', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/jobs/refresh')
    expect(res.status).toBe(401)
  })

  it('returns 202 when eligible (no previous refresh)', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          id: 'user-1',
          last_refresh_at: null,
          desired_titles: ['Frontend Engineer'],
          preferred_locations: ['Austin'],
          work_preference: null,
        },
        error: null,
      })
    )
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

    const res = await request(app)
      .post('/api/v1/jobs/refresh')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(202)
    expect(res.body.data.message).toBe('Refresh queued')
  })

  it('returns 429 when refreshed within the last hour', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          id: 'user-1',
          last_refresh_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          desired_titles: ['Frontend Engineer'],
          preferred_locations: [],
          work_preference: 'remote',
        },
        error: null,
      })
    )

    const res = await request(app)
      .post('/api/v1/jobs/refresh')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(429)
    expect(res.body.error).toContain('hour')
  })
})

describe('PATCH /api/v1/jobs/:id/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/v1/jobs/job-1/status')
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status value', async () => {
    authAs('user-1')

    const res = await request(app)
      .patch('/api/v1/jobs/job-1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'invalid-status' })

    expect(res.status).toBe(400)
  })

  it('returns 200 with updated application status', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: { job_id: 'job-1', user_id: 'user-1', status: 'applied' },
        error: null,
      })
    )

    const res = await request(app)
      .patch('/api/v1/jobs/job-1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('applied')
  })
})
