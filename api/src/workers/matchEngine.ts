// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserMatchProfile {
  desired_titles: string[]
  preferred_locations: string[]
  work_preference: 'remote' | 'hybrid' | 'onsite' | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  years_experience: number | null
}

export interface JobForScoring {
  title: string
  location: string | null
  is_remote: boolean
  description: string | null
  requirements: string | null
  salary_min: number | null
  salary_max: number | null
  extracted_skills: string[]
}

export interface Phase1Result {
  score: number
  label: 'excellent' | 'strong' | 'good' | 'low'
  breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  }
}

// 'possible' from the DB match_label_enum is intentionally unused — Phase 1 uses 4 bands only.

// ─── Phase 1 — pure scoring functions ────────────────────────────────────────

export function scoreSkills(jobSkills: string[], userSkills: string[]): number {
  if (jobSkills.length === 0) return 0
  const userSet = new Set(userSkills.map((s) => s.toLowerCase()))
  const matches = jobSkills.filter((s) => userSet.has(s.toLowerCase()))
  return Math.round((matches.length / jobSkills.length) * 35)
}

export function scoreTitle(jobTitle: string, desiredTitles: string[]): number {
  if (desiredTitles.length === 0) return 0
  const jobWords = new Set(jobTitle.toLowerCase().split(/\W+/).filter(Boolean))
  let best = 0
  for (const desired of desiredTitles) {
    const desiredWords = desired.toLowerCase().split(/\W+/).filter(Boolean)
    if (desiredWords.length === 0) continue
    const matchCount = desiredWords.filter((w) => jobWords.has(w)).length
    best = Math.max(best, matchCount / desiredWords.length)
  }
  return Math.round(best * 20)
}

export function scoreLocation(
  jobLocation: string | null,
  jobIsRemote: boolean,
  userLocation: string | null,
  workPreference: string | null,
  preferredLocations: string[]
): number {
  if (workPreference === 'remote') return jobIsRemote ? 15 : 0
  if (jobIsRemote) return workPreference === 'hybrid' || !workPreference ? 8 : 0

  const jobLoc = (jobLocation ?? '').toLowerCase()
  const preferred =
    preferredLocations.length > 0
      ? preferredLocations.map((l) => l.toLowerCase())
      : userLocation
      ? [userLocation.toLowerCase()]
      : []

  if (preferred.length === 0) return 0
  for (const pref of preferred) {
    if (jobLoc.includes(pref) || pref.includes(jobLoc)) return 15
  }
  return 0
}

export function scoreYearsExp(jobText: string, userYearsExp: number | null): number {
  if (userYearsExp === null) return 0
  const match = jobText.match(
    /(\d+)\+?\s*(?:[-–to]+\s*(\d+)\s*)?years?\s+(?:of\s+)?(?:\w+\s+)?experience/i
  )
  if (!match) return 7
  const min = parseInt(match[1])
  const max = match[2] ? parseInt(match[2]) : min
  if (userYearsExp >= min && userYearsExp <= max + 2) return 15
  if (Math.abs(userYearsExp - min) <= 2) return 8
  return 2
}

export function scoreKeywords(jobDescription: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const desc = (jobDescription ?? '').toLowerCase()
  const matches = keywords.filter((kw) => desc.includes(kw.toLowerCase()))
  return Math.round((matches.length / keywords.length) * 10)
}

export function scoreSalary(
  jobSalaryMin: number | null,
  jobSalaryMax: number | null,
  userSalaryMin: number | null,
  userSalaryMax: number | null
): number {
  if (userSalaryMin === null && userSalaryMax === null) return 2
  if (jobSalaryMin === null && jobSalaryMax === null) return 2

  const jMin = jobSalaryMin ?? 0
  const jMax = jobSalaryMax ?? jMin
  const uMin = userSalaryMin ?? 0
  const uMax = userSalaryMax ?? uMin

  const overlapStart = Math.max(jMin, uMin)
  const overlapEnd = Math.min(jMax, uMax)

  if (overlapEnd < overlapStart) return 0
  const relevantRange = Math.max(Math.min(jMax - jMin, uMax - uMin), 1)
  return Math.round(Math.min((overlapEnd - overlapStart) / relevantRange, 1) * 5)
}

export function computePhase1(
  job: JobForScoring,
  profile: UserMatchProfile,
  userSkillNames: string[],
  resumeKeywords: string[]
): Phase1Result {
  const jobText = `${job.description ?? ''} ${job.requirements ?? ''}`

  const skills = scoreSkills(job.extracted_skills, userSkillNames)
  const title = scoreTitle(job.title, profile.desired_titles)
  const location = scoreLocation(
    job.location,
    job.is_remote,
    profile.location,
    profile.work_preference,
    profile.preferred_locations
  )
  const experience = scoreYearsExp(jobText, profile.years_experience)
  const keywords = scoreKeywords(jobText, resumeKeywords)
  const salary = scoreSalary(job.salary_min, job.salary_max, profile.salary_min, profile.salary_max)

  const score = Math.min(skills + title + location + experience + keywords + salary, 100)

  let label: Phase1Result['label']
  if (score >= 80) label = 'excellent'
  else if (score >= 60) label = 'strong'
  else if (score >= 40) label = 'good'
  else label = 'low'

  return { score, label, breakdown: { skills, title, location, experience, keywords, salary } }
}
