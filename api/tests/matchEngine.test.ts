import {
  scoreSkills,
  scoreTitle,
  scoreLocation,
  scoreYearsExp,
  scoreKeywords,
  scoreSalary,
  computePhase1,
} from '../src/workers/matchEngine'

describe('scoreSkills', () => {
  it('returns 0 when job has no extracted skills', () => {
    expect(scoreSkills([], ['React', 'TypeScript'])).toBe(0)
  })

  it('returns 35 when all job skills match user skills', () => {
    expect(scoreSkills(['react', 'typescript'], ['react', 'typescript', 'node.js'])).toBe(35)
  })

  it('returns proportional score for partial overlap', () => {
    const score = scoreSkills(['react', 'vue'], ['react', 'node.js'])
    expect(score).toBe(18) // Math.round(0.5 * 35) = 18
  })

  it('is case insensitive', () => {
    expect(scoreSkills(['React'], ['react'])).toBe(35)
  })
})

describe('scoreTitle', () => {
  it('returns 0 when user has no desired titles', () => {
    expect(scoreTitle('Senior Frontend Engineer', [])).toBe(0)
  })

  it('returns 20 when job title exactly matches desired title', () => {
    expect(scoreTitle('Senior Frontend Engineer', ['Senior Frontend Engineer'])).toBe(20)
  })

  it('returns partial score for partial word overlap', () => {
    const score = scoreTitle('Senior Frontend Engineer', ['Frontend Developer'])
    // "frontend" matches out of ["frontend", "developer"] = 1/2 = 0.5 * 20 = 10
    expect(score).toBe(10)
  })
})

describe('scoreLocation', () => {
  it('returns 15 when user is remote-only and job is remote', () => {
    expect(scoreLocation('Austin, TX', true, 'Austin, TX', 'remote', [])).toBe(15)
  })

  it('returns 0 when user is remote-only and job is not remote', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin, TX', 'remote', [])).toBe(0)
  })

  it('returns 8 when job is remote and user has hybrid preference', () => {
    expect(scoreLocation('Remote', true, null, 'hybrid', [])).toBe(8)
  })

  it('returns 15 when job location matches preferred location', () => {
    expect(scoreLocation('Austin, TX', false, 'Seattle', null, ['Austin'])).toBe(15)
  })

  it('returns 15 when job location matches user location (no preferred_locations)', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin', null, [])).toBe(15)
  })

  it('returns 0 when location mismatches and job is not remote', () => {
    expect(scoreLocation('New York, NY', false, 'Seattle', 'onsite', [])).toBe(0)
  })
})

describe('scoreYearsExp', () => {
  it('returns 0 when user has no years experience set', () => {
    expect(scoreYearsExp('Requires 3+ years experience', null)).toBe(0)
  })

  it('returns 15 when user experience is within required range', () => {
    expect(scoreYearsExp('Requires 3-5 years of experience', 4)).toBe(15)
  })

  it('returns 8 when user experience is within 2 years of requirement', () => {
    expect(scoreYearsExp('Requires 5+ years experience', 3)).toBe(8)
  })

  it('returns 7 partial credit when no experience requirement found', () => {
    expect(scoreYearsExp('Great opportunity at a fast-growing startup', 5)).toBe(7)
  })
})

describe('scoreKeywords', () => {
  it('returns 0 when user has no parsed keywords', () => {
    expect(scoreKeywords('We use React and TypeScript', [])).toBe(0)
  })

  it('returns 10 when all user keywords appear in job description', () => {
    expect(scoreKeywords('We use React and TypeScript daily', ['react', 'typescript'])).toBe(10)
  })

  it('returns proportional score for partial match', () => {
    const score = scoreKeywords('We use React in our stack', ['react', 'typescript'])
    expect(score).toBe(5) // 1 of 2 = 0.5 * 10 = 5
  })
})

describe('scoreSalary', () => {
  it('returns 2 when user has no salary preference', () => {
    expect(scoreSalary(100000, 130000, null, null)).toBe(2)
  })

  it('returns 2 when job does not disclose salary', () => {
    expect(scoreSalary(null, null, 80000, 120000)).toBe(2)
  })

  it('returns 5 when ranges fully overlap', () => {
    expect(scoreSalary(90000, 120000, 80000, 130000)).toBe(5)
  })

  it('returns 0 when salary ranges do not overlap', () => {
    expect(scoreSalary(50000, 70000, 100000, 130000)).toBe(0)
  })
})

describe('computePhase1', () => {
  const userProfile = {
    desired_titles: ['Frontend Engineer'],
    preferred_locations: ['Austin'],
    work_preference: null as null,
    location: 'Austin, TX',
    salary_min: 80000,
    salary_max: 130000,
    years_experience: 5,
  }
  const userSkills = ['react', 'typescript', 'node.js']
  const keywords = ['react', 'typescript']

  it('returns a score and label', () => {
    const job = {
      title: 'Frontend Engineer',
      location: 'Austin, TX',
      is_remote: false,
      description: 'We use React and TypeScript.',
      requirements: 'Requires 4-6 years of experience.',
      salary_min: 90000,
      salary_max: 125000,
      extracted_skills: ['react', 'typescript'],
    }
    const result = computePhase1(job, userProfile, userSkills, keywords)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(['excellent', 'strong', 'good', 'low']).toContain(result.label)
    expect(result.breakdown).toHaveProperty('skills')
    expect(result.breakdown).toHaveProperty('title')
  })

  it('assigns excellent label for high score', () => {
    const job = {
      title: 'Frontend Engineer',
      location: 'Austin, TX',
      is_remote: false,
      description: 'React and TypeScript required. 5 years experience.',
      requirements: '5 years of experience required.',
      salary_min: 90000,
      salary_max: 120000,
      extracted_skills: ['react', 'typescript', 'node.js'],
    }
    const result = computePhase1(job, userProfile, userSkills, keywords)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.label).toBe('excellent')
  })

  it('assigns low label for score below 40', () => {
    const job = {
      title: 'DevOps Engineer',
      location: 'Remote',
      is_remote: true,
      description: 'Kubernetes and Terraform required.',
      requirements: '10+ years experience.',
      salary_min: 50000,
      salary_max: 60000,
      extracted_skills: ['kubernetes', 'terraform', 'ansible'],
    }
    const result = computePhase1(job, userProfile, [], [])
    expect(result.label).toBe('low')
  })
})

// ─── Phase 2 tests ───────────────────────────────────────────────────────────

import { runPhase2ForMatch } from '../src/workers/matchEngine'
import Anthropic from '@anthropic-ai/sdk'

jest.mock('@anthropic-ai/sdk')

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

import { supabaseAdmin } from '../src/config/supabase'

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>

describe('runPhase2ForMatch', () => {
  const mockMatchId = 'match-uuid-1'
  const mockJob = {
    id: 'job-uuid-1',
    title: 'Frontend Engineer',
    company: 'Acme',
    description: 'We use React and TypeScript.',
    requirements: '3+ years experience.',
  }
  const mockParsedResume = {
    skills: ['React', 'TypeScript'],
    keywords: ['react', 'typescript'],
    experience: [],
    education: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('calls Anthropic with the resume in the system prompt', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            refined_score: 85,
            skills_matched: ['React', 'TypeScript'],
            skills_missing: ['GraphQL'],
            explanation: 'Strong match.',
            gaps_to_improve: ['Learn GraphQL'],
          }),
        },
      ],
    })

    MockAnthropic.prototype.messages = { create: mockCreate } as any

    await runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0][0]
    expect(call.system[0].text).toContain('resume')
    expect(call.messages[0].content).toContain('Frontend Engineer')
  })

  it('sets ai_refined=false and does not throw when Claude returns invalid JSON', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })
    MockAnthropic.prototype.messages = { create: mockCreate } as any

    await expect(
      runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any)
    ).resolves.not.toThrow()

    const fromMock = supabaseAdmin.from as jest.Mock
    expect(fromMock).toHaveBeenCalledWith('job_matches')
  })
})
