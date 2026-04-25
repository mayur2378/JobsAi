// api/tests/resume.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    storage: { from: jest.fn() },
    auth: { getUser: jest.fn() },
  },
}))

// Mock parseResumeAsync so upload tests don't hit Claude
jest.mock('../src/services/resumeParser', () => ({
  parseResumeAsync: jest.fn().mockResolvedValue(undefined),
}))

function mockVerifyToken(userId = 'user-abc') {
  ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId, email: 'test@test.com' } },
    error: null,
  })
}

function mockStorage() {
  const storageChain = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/file.pdf' } }),
    download: jest.fn().mockResolvedValue({ data: Buffer.from('pdf content'), error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
  }
  ;(supabaseAdmin.storage.from as jest.Mock).mockReturnValue(storageChain)
  return storageChain
}

function mockFrom(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('POST /api/v1/resume/upload', () => {
  it('returns 400 when no file is attached', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No file uploaded')
  })

  it('returns 201 with resume record on valid PDF upload', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    // First call: deactivate old resumes (update, no single)
    chain.update.mockReturnThis()
    // Second call: insert new record
    chain.single.mockResolvedValue({
      data: {
        id: 'resume-1',
        user_id: 'user-abc',
        file_name: 'cv.pdf',
        file_url: 'user-abc/uuid-cv.pdf',
        file_type: 'pdf',
        is_active: false,
        parsed_data: null,
      },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('%PDF-1.4 fake pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.data.file_name).toBe('cv.pdf')
  })

  it('returns 400 for unsupported file type', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('plain text'), { filename: 'cv.txt', contentType: 'text/plain' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Only PDF and DOCX files are allowed')
  })
})

describe('GET /api/v1/resume', () => {
  it('returns null data when no active resume exists', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const res = await request(createApp())
      .get('/api/v1/resume')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('returns resume with signed_url when active resume exists', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'resume-1', file_url: 'user-abc/uuid-cv.pdf', file_name: 'cv.pdf', parsed_data: null },
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/resume')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.signed_url).toBe('https://signed.url/file.pdf')
  })
})

describe('GET /api/v1/resume/status/:id', () => {
  it('returns resume status when found', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'resume-1', is_active: false, parsed_data: null, parsed_at: null },
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/resume/status/resume-1')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('resume-1')
    expect(res.body.data.parsed_data).toBeNull()
  })

  it('returns 404 when resume not found', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const res = await request(createApp())
      .get('/api/v1/resume/status/nonexistent')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Resume not found')
  })
})

describe('DELETE /api/v1/resume/:id', () => {
  it('deletes resume record and returns 204', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    // The fetch SELECT chains: .eq('id', ...).eq('user_id', ...).single()
    // eq calls must return chain (for chaining), single resolves
    chain.single.mockResolvedValue({
      data: { id: 'resume-1', file_url: 'user-abc/uuid-cv.pdf' },
      error: null,
    })

    const res = await request(createApp())
      .delete('/api/v1/resume/resume-1')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })
})
