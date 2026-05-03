import {
  scoreSkills,
  scorePrioritySkills,
  scoreTitle,
  scoreLocation,
  scoreYearsExp,
  scoreKeywords,
  computePhase1,
} from '../src/workers/matchEngine'

describe('scoreSkills', () => {
  it('returns 0 when user has no skills', () => {
    expect(scoreSkills(['react', 'typescript'], '', [])).toBe(0)
  })

  it('finds skills in extracted_skills array', () => {
    expect(scoreSkills(['react', 'typescript'], '', ['react', 'typescript'])).toBe(10)
  })

  it('finds skills in job text when extracted_skills is empty', () => {
    // Even with no extracted skills, matching via text should work
    const score = scoreSkills([], 'We use React and TypeScript daily', ['react', 'typescript'])
    expect(score).toBe(10)
  })

  it('returns proportional score for partial overlap', () => {
    const score = scoreSkills([], 'We use React in our stack', ['react', 'typescript'])
    expect(score).toBe(5) // Math.round(1/2 * 10) = 5
  })

  it('is case insensitive', () => {
    expect(scoreSkills(['React'], '', ['react'])).toBe(10)
  })
})

describe('scorePrioritySkills', () => {
  it('returns 0 when user has no priority skills', () => {
    expect(scorePrioritySkills('React and TypeScript', [], [])).toBe(0)
  })

  it('returns 30 when all priority skills found in job text', () => {
    expect(scorePrioritySkills('React and TypeScript required', [], ['React', 'TypeScript'])).toBe(30)
  })

  it('returns proportional score for partial match', () => {
    const score = scorePrioritySkills('We use React', [], ['React', 'TypeScript'])
    expect(score).toBe(15) // Math.round(0.5 * 30) = 15
  })

  it('matches via extracted_skills array', () => {
    expect(scorePrioritySkills('', ['react'], ['React'])).toBe(30)
  })
})

describe('scoreTitle', () => {
  it('returns 0 when user has no desired titles', () => {
    expect(scoreTitle('Senior Frontend Engineer', [])).toBe(0)
  })

  it('returns 40 when job title exactly matches desired title', () => {
    expect(scoreTitle('Senior Frontend Engineer', ['Senior Frontend Engineer'])).toBe(40)
  })

  it('matches across seniority levels — MuleSoft Developer matches MuleSoft Integration Director', () => {
    // "Developer" and "Director" are both stripped; "mulesoft" matches fully
    const score = scoreTitle('MuleSoft Integration Director', ['MuleSoft Developer'])
    expect(score).toBe(40)
  })

  it('matches domain words when seniority differs', () => {
    // "Senior" stripped from both; "frontend" and "engineer" match
    const score = scoreTitle('Senior Frontend Engineer', ['Junior Frontend Engineer'])
    expect(score).toBe(40)
  })

  it('returns partial score for partial domain overlap', () => {
    const score = scoreTitle('Frontend Engineer', ['Backend Engineer'])
    // core: "frontend","engineer" vs "backend","engineer" — "engineer" matches = 1/2 = 20
    expect(score).toBe(20)
  })
})

describe('scoreLocation', () => {
  it('returns 5 when user is remote-only and job is remote', () => {
    expect(scoreLocation('Austin, TX', true, 'Austin, TX', 'remote', [])).toBe(5)
  })

  it('returns 0 when user is remote-only and job is not remote', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin, TX', 'remote', [])).toBe(0)
  })

  it('returns 3 when job is remote and user has hybrid preference', () => {
    expect(scoreLocation('Remote', true, null, 'hybrid', [])).toBe(3)
  })

  it('returns 5 when job location matches preferred location', () => {
    expect(scoreLocation('Austin, TX', false, 'Seattle', null, ['Austin'])).toBe(5)
  })

  it('returns 5 when job location matches user location (no preferred_locations)', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin', null, [])).toBe(5)
  })

  it('returns 0 when location mismatches and job is not remote', () => {
    expect(scoreLocation('New York, NY', false, 'Seattle', 'onsite', [])).toBe(0)
  })
})

describe('scoreYearsExp', () => {
  it('returns 0 when user has no years experience set', () => {
    expect(scoreYearsExp('Requires 3+ years experience', null)).toBe(0)
  })

  it('returns 10 when user experience is within required range', () => {
    expect(scoreYearsExp('Requires 3-5 years of experience', 4)).toBe(10)
  })

  it('returns 10 for open-ended requirement when user meets minimum', () => {
    // "10+ years" should score full for a user with 15 years, not fail the old max+2 check
    expect(scoreYearsExp('Requires 10+ years experience', 15)).toBe(10)
    expect(scoreYearsExp('Requires 5+ years experience', 5)).toBe(10)
  })

  it('returns 5 when user is within 2 years below open-ended minimum', () => {
    expect(scoreYearsExp('Requires 5+ years experience', 3)).toBe(5)
  })

  it('returns 5 partial credit when no experience requirement found', () => {
    expect(scoreYearsExp('Great opportunity at a fast-growing startup', 5)).toBe(5)
  })
})

describe('scoreKeywords', () => {
  it('returns 0 when user has no parsed keywords', () => {
    expect(scoreKeywords('We use React and TypeScript', [])).toBe(0)
  })

  it('returns 5 when all user keywords appear in job description', () => {
    expect(scoreKeywords('We use React and TypeScript daily', ['react', 'typescript'])).toBe(5)
  })

  it('returns proportional score for partial match', () => {
    const score = scoreKeywords('We use React in our stack', ['react', 'typescript'])
    expect(score).toBe(3) // Math.round(1/2 * 5) = 3
  })
})

describe('computePhase1', () => {
  const baseProfile = {
    desired_titles: ['Frontend Engineer'],
    preferred_locations: ['Austin'],
    work_preference: null as null,
    location: 'Austin, TX',
    salary_min: 80000,
    salary_max: 130000,
    years_experience: 5,
    priority_skills: [] as string[],
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
    const result = computePhase1(job, baseProfile, userSkills, keywords)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(['excellent', 'strong', 'good', 'low']).toContain(result.label)
    expect(result.breakdown).toHaveProperty('skills')
    expect(result.breakdown).toHaveProperty('title')
    expect(result.breakdown).toHaveProperty('priority_skills')
  })

  it('assigns excellent label when priority skills boost score to 80+', () => {
    const profile = { ...baseProfile, priority_skills: ['react', 'typescript'] }
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
    const result = computePhase1(job, profile, userSkills, keywords)
    // title=40 + priority_skills=30 + skills=10 + exp=10 + keywords=5 + location=5 = 100
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
    const result = computePhase1(job, baseProfile, [], [])
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

    await runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any, 'user-test-id')

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
      runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any, 'user-test-id')
    ).resolves.not.toThrow()

    const fromMock = supabaseAdmin.from as jest.Mock
    expect(fromMock).toHaveBeenCalledWith('job_matches')
  })
})
