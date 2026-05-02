import Anthropic from '@anthropic-ai/sdk'
import PQueue from 'p-queue'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

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

// ─── Phase 2 — Claude refinement ─────────────────────────────────────────────

interface Phase2Output {
  refined_score: number
  skills_matched: string[]
  skills_missing: string[]
  explanation: string
  gaps_to_improve: string[]
}

interface JobForPhase2 {
  id: string
  title: string
  company: string | null
  description: string | null
  requirements: string | null
}

export async function runPhase2ForMatch(
  matchId: string,
  job: JobForPhase2,
  parsedResume: Record<string, unknown>
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  let output: Phase2Output | null = null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: `You are a job matching assistant. Given a candidate's resume data and a job description, output a JSON object with exactly these fields:
{
  "refined_score": number 0-100,
  "skills_matched": string[],
  "skills_missing": string[],
  "explanation": "2-3 sentences on fit quality",
  "gaps_to_improve": ["top 3 actionable gaps"]
}
Output raw JSON only — no markdown, no code blocks.

Candidate resume:
${JSON.stringify(parsedResume)}`,
          cache_control: { type: 'ephemeral' } as any, // SDK types don't yet expose cache_control; valid API field
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Rate this job for the candidate above:

Title: ${job.title}
Company: ${job.company ?? 'Unknown'}
Description: ${job.description ?? ''}
Requirements: ${job.requirements ?? ''}`,
        },
      ],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    output = JSON.parse(text) as Phase2Output
  } catch (err) {
    console.error('[matchEngine] Phase 2 failed for match', matchId, err)
  }

  if (output) {
    const { error: updateErr } = await supabaseAdmin
      .from('job_matches')
      .update({
        refined_score: output.refined_score,
        skills_matched: output.skills_matched,
        skills_missing: output.skills_missing,
        match_explanation: output.explanation,
        gaps_to_improve: output.gaps_to_improve,
        ai_refined: true,
        refined_at: new Date().toISOString(),
      })
      .eq('id', matchId)
    if (updateErr) console.error('[matchEngine] Failed to save Phase 2 result for match', matchId, updateErr.message)
  } else {
    const { error: fallbackErr } = await supabaseAdmin
      .from('job_matches')
      .update({ ai_refined: false })
      .eq('id', matchId)
    if (fallbackErr) console.error('[matchEngine] Failed to set ai_refined=false for match', matchId, fallbackErr.message)
  }
}

// ─── Pipeline orchestration ───────────────────────────────────────────────────

const phase2Queue = new PQueue({ concurrency: 3 })

interface ActiveUser {
  id: string
  desired_titles: string[]
  preferred_locations: string[]
  work_preference: 'remote' | 'hybrid' | 'onsite' | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  years_experience: number | null
}

export async function runPipelineForJobs(
  newJobIds: string[],
  userId: string
): Promise<void> {
  if (newJobIds.length === 0) return

  // Fetch user profile, skills, and resume in parallel
  const [profileResult, skillsResult, resumeResult] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
    supabaseAdmin.from('skills').select('name').eq('user_id', userId),
    supabaseAdmin
      .from('resumes')
      .select('parsed_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const profile = profileResult.data as ActiveUser | null
  if (!profile) return

  const userSkills: string[] = (skillsResult.data ?? []).map((s: { name: string }) => s.name)
  const parsedResume = resumeResult.data?.parsed_data ?? null
  const keywords: string[] = (parsedResume as { keywords?: string[] } | null)?.keywords ?? []

  // Fetch the new jobs
  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('id, title, company, location, is_remote, description, requirements, salary_min, salary_max, extracted_skills, posted_at')
    .in('id', newJobIds)

  if (!jobs) return

  const phase2JobsRaw = await Promise.all(
    jobs.map(async (job) => {
      const phase1 = computePhase1(
        {
          title: job.title,
          location: job.location,
          is_remote: job.is_remote,
          description: job.description,
          requirements: job.requirements,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          extracted_skills: job.extracted_skills ?? [],
        },
        profile,
        userSkills,
        keywords
      )

      const { data: matchRow } = await supabaseAdmin
        .from('job_matches')
        .upsert(
          {
            user_id: userId,
            job_id: job.id,
            match_score: phase1.score,
            match_label: phase1.label,
            match_breakdown: phase1.breakdown,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,job_id' }
        )
        .select('id')
        .single()

      if (matchRow && phase1.score >= 40 && parsedResume) {
        return { matchId: matchRow.id, job: job as JobForPhase2 }
      }
      return null
    })
  )

  const phase2Jobs = phase2JobsRaw.filter(Boolean) as Array<{ matchId: string; job: JobForPhase2 }>

  for (const { matchId, job } of phase2Jobs) {
    phase2Queue.add(() => runPhase2ForMatch(matchId, job, parsedResume as Record<string, unknown>))
  }
}

export async function recomputeForUser(userId: string): Promise<void> {
  const { data: existingMatches } = await supabaseAdmin
    .from('job_matches')
    .select('job_id')
    .eq('user_id', userId)

  const jobIds = (existingMatches ?? []).map((m: { job_id: string }) => m.job_id)
  if (jobIds.length === 0) return

  await runPipelineForJobs(jobIds, userId)
}
