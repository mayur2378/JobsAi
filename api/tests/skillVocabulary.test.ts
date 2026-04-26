import { extractSkills, SKILL_VOCABULARY } from '../src/lib/skillVocabulary'

describe('SKILL_VOCABULARY', () => {
  it('contains at least 50 skills', () => {
    expect(SKILL_VOCABULARY.length).toBeGreaterThanOrEqual(50)
  })

  it('has no duplicate entries', () => {
    const unique = new Set(SKILL_VOCABULARY)
    expect(unique.size).toBe(SKILL_VOCABULARY.length)
  })
})

describe('extractSkills', () => {
  it('returns empty array for empty text', () => {
    expect(extractSkills('')).toEqual([])
  })

  it('extracts skills that appear as whole words', () => {
    const text = 'We need a React developer with TypeScript and Node.js experience.'
    const skills = extractSkills(text)
    expect(skills).toContain('react')
    expect(skills).toContain('typescript')
    expect(skills).toContain('node.js')
  })

  it('is case insensitive', () => {
    const text = 'PYTHON developer with POSTGRESQL'
    const skills = extractSkills(text)
    expect(skills).toContain('python')
    expect(skills).toContain('postgresql')
  })

  it('handles multi-word skills', () => {
    const text = 'Experience with machine learning and deep learning required'
    const skills = extractSkills(text)
    expect(skills).toContain('machine learning')
    expect(skills).toContain('deep learning')
  })
})
