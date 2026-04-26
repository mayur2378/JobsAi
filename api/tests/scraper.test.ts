import { mapJSearchJob, buildQueries } from '../src/workers/scraper'

describe('buildQueries', () => {
  it('returns empty array when user has no titles and is not remote-only', () => {
    const queries = buildQueries([], [], null)
    expect(queries).toEqual([])
  })

  it('fans out one query per title × location', () => {
    const queries = buildQueries(
      ['Frontend Engineer', 'React Developer'],
      ['Austin, TX', 'Remote'],
      null
    )
    expect(queries).toHaveLength(4)
    expect(queries[0]).toMatchObject({ query: 'Frontend Engineer Austin, TX', remoteOnly: false })
    expect(queries[1]).toMatchObject({ query: 'Frontend Engineer Remote', remoteOnly: false })
  })

  it('produces remote-only query when work_preference is remote and no locations', () => {
    const queries = buildQueries(['Frontend Engineer'], [], 'remote')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ query: 'Frontend Engineer', remoteOnly: true })
  })

  it('skips non-remote queries when work_preference is remote', () => {
    const queries = buildQueries(['Engineer'], ['Austin'], 'remote')
    expect(queries[0].remoteOnly).toBe(true)
  })
})

describe('mapJSearchJob', () => {
  const rawJob = {
    job_id: 'ext-123',
    job_title: 'Senior React Developer',
    employer_name: 'Acme Corp',
    job_city: 'Austin',
    job_country: 'US',
    job_is_remote: false,
    job_description: 'We use React, TypeScript, and Node.js daily.',
    job_highlights: { Qualifications: ['3+ years React experience', 'TypeScript required'] },
    job_min_salary: 100000,
    job_max_salary: 140000,
    job_apply_link: 'https://example.com/apply',
    job_posted_at_datetime_utc: '2026-04-24T10:00:00.000Z',
  }

  it('maps external_id from job_id', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.external_id).toBe('ext-123')
  })

  it('combines city and country into location', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.location).toBe('Austin, US')
  })

  it('extracts skills from description + qualifications', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.extracted_skills).toContain('react')
    expect(mapped.extracted_skills).toContain('typescript')
    expect(mapped.extracted_skills).toContain('node.js')
  })

  it('combines qualifications into requirements string', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.requirements).toContain('3+ years React experience')
  })

  it('handles missing fields gracefully', () => {
    const minimal = { job_id: 'x', job_title: 'Engineer', employer_name: null }
    const mapped = mapJSearchJob(minimal)
    expect(mapped.extracted_skills).toEqual([])
    expect(mapped.location).toBe(', ')
  })
})
