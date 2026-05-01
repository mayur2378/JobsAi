// api/tests/applications.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock
const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock

function makeChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'not', 'limit', 'update', 'upsert',
    'insert', 'delete', 'order', 'in'].forEach((m) => { t[m] = jest.fn(() => t) })
  t.single = jest.fn(() => Promise.resolve(result))
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

let app: ReturnType<typeof createApp>
beforeAll(() => { app = createApp() })

describe('GET /api/v1/applications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/applications')
    expect(res.status).toBe(401)
  })

  it('returns 200 with applications array', async () => {
    authAs('user-1')
    // First mock: job_applications query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{
          id: 'app-1', user_id: 'user-1', job_id: 'job-1',
          status: 'applied', applied_at: null, interview_date: null,
          follow_up_date: null, offer_amount: null,
          created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
          jobs: { id: 'job-1', title: 'SWE', company: 'Acme', location: 'NYC',
                  is_remote: false, salary_min: 120000, salary_max: 150000, apply_url: null },
        }],
        error: null,
      })
    )
    // Second mock: job_matches query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{ job_id: 'job-1', match_score: 82, match_label: 'excellent',
                 refined_score: 85, ai_refined: true }],
        error: null,
      })
    )

    const res = await request(app)
      .get('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].status).toBe('applied')
    expect(res.body.data[0].jobs.title).toBe('SWE')
    expect(res.body.data[0].match.match_score).toBe(82)
  })
})

describe('POST /api/v1/applications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/applications').send({ job_id: 'j1', status: 'saved' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing job_id', async () => {
    authAs('user-1')
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'saved' })
    expect(res.status).toBe(400)
  })

  it('returns 201 on successful upsert', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', job_id: 'job-1', status: 'saved' }, error: null })
    )
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')
      .send({ job_id: 'job-1', status: 'saved' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('saved')
  })
})

describe('PUT /api/v1/applications/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).put('/api/v1/applications/app-1').send({ status: 'applied' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when application not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'No rows' } }))
    const res = await request(app)
      .put('/api/v1/applications/nonexistent')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated application', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', status: 'applied' }, error: null })
    )
    const res = await request(app)
      .put('/api/v1/applications/app-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('applied')
  })
})

describe('DELETE /api/v1/applications/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/applications/app-1')
    expect(res.status).toBe(401)
  })

  it('returns 204 on successful delete', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'app-1' }], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/app-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(204)
  })

  it('returns 404 when not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/nonexistent')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/applications/:id/notes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/applications/app-1/notes')
    expect(res.status).toBe(401)
  })

  it('returns 200 with notes array', async () => {
    authAs('user-1')
    // First mock: ownership check
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null })
    )
    // Second mock: notes query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{ id: 'note-1', content: 'Great interview', created_at: '2026-05-01T00:00:00Z' }],
        error: null,
      })
    )
    const res = await request(app)
      .get('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].content).toBe('Great interview')
  })
})

describe('POST /api/v1/applications/:id/notes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/applications/app-1/notes').send({ content: 'hi' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for empty content', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null }))
    const res = await request(app)
      .post('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
      .send({ content: '' })
    expect(res.status).toBe(400)
  })

  it('returns 201 with created note', async () => {
    authAs('user-1')
    // Ownership check
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null }))
    // Insert note
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'note-1', content: 'Prep system design', created_at: '2026-05-01T00:00:00Z' }, error: null })
    )
    const res = await request(app)
      .post('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
      .send({ content: 'Prep system design' })
    expect(res.status).toBe(201)
    expect(res.body.data.content).toBe('Prep system design')
  })
})

describe('DELETE /api/v1/applications/notes/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/applications/notes/note-1')
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'note-1' }], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/notes/note-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(204)
  })
})
