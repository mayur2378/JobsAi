// api/tests/resumeParser.test.ts

// Mock Anthropic SDK — must be before any imports that trigger module load
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  }
})

// Mock pdf-parse
jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: 'Alice Johnson\nTypeScript, React, Node.js\n5 years experience' })
)

// Mock mammoth
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'Alice Johnson\nTypeScript, React\n3 years' }),
}))

import Anthropic from '@anthropic-ai/sdk'
import { parseResume } from '../src/services/resumeParser'

const MOCK_PARSED: Record<string, unknown> = {
  full_name: 'Alice Johnson',
  email: 'alice@example.com',
  phone: null,
  location: 'Austin, TX',
  skills: ['TypeScript', 'React', 'Node.js'],
  experience: [{ title: 'Engineer', company: 'ACME', duration: '2020–present', description: 'Built stuff' }],
  education: [{ degree: 'BSc Computer Science', institution: 'UT Austin', year: '2019' }],
  certifications: [],
  keywords: ['TypeScript', 'React'],
  years_experience: 5,
  summary: 'Experienced engineer',
}

// Helper to get the mock messages.create function from the singleton anthropic instance
function getMockCreate(): jest.Mock {
  const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>
  // After clearMocks, mock.results is cleared. Re-instantiate to get a fresh ref,
  // or retrieve from mock.instances[0] which is also cleared.
  // Instead, rely on the fact that the module-level `anthropic` instance was created
  // at module load and its `messages.create` is the same jest.fn() from the factory.
  // We access it via mock.instances[0] which survives clearMocks in some jest versions,
  // but to be safe we get it from the constructor calls before clearMocks cleared them.
  // Simplest: call the mock constructor ourselves to get a new instance reference.
  const instance = new MockedAnthropic()
  return instance.messages.create as jest.Mock
}

describe('parseResume', () => {
  let mockCreate: jest.Mock

  beforeAll(() => {
    // The Anthropic constructor was called at module load time to create the singleton.
    // Capture mock.results[0].value before clearMocks wipes it.
    const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>
    // mock.results[0] exists here since constructor was called at module load
    const singletonInstance = MockedAnthropic.mock.results[0]?.value
    if (singletonInstance) {
      mockCreate = singletonInstance.messages.create as jest.Mock
    }
  })

  beforeEach(() => {
    if (mockCreate) {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(MOCK_PARSED) }],
      })
    }
  })

  it('parses a PDF buffer and returns structured data', async () => {
    const result = await parseResume(Buffer.from('%PDF fake'), 'pdf')
    expect(result.full_name).toBe('Alice Johnson')
    expect(result.skills).toContain('TypeScript')
    expect(result.years_experience).toBe(5)
  })

  it('parses a DOCX buffer using mammoth', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ ...MOCK_PARSED, skills: ['TypeScript', 'React'] }) }],
    })

    const result = await parseResume(Buffer.from('PK fake docx'), 'docx')
    expect(result.skills).toContain('React')
  })

  it('throws when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json {{' }],
    })

    await expect(parseResume(Buffer.from('%PDF fake'), 'pdf')).rejects.toThrow()
  })
})
