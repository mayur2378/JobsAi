import { z } from 'zod'

describe('env config', () => {
  it('exports SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.PORT = '3001'
    process.env.NODE_ENV = 'test'
    process.env.CORS_ORIGIN = 'http://localhost:3000'

    // Re-import after setting env
    jest.resetModules()
    const { env } = require('../src/config/env')
    expect(env.SUPABASE_URL).toBe('https://test.supabase.co')
    expect(env.PORT).toBe('3001')
  })
})
