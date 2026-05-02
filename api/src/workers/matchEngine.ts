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
  priority_skills: string[]
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
    priority_skills: number
    title: number
    skills: number
    experience: number
    keywords: number
    location: number
  }
}

// 'possible' from the DB match_label_enum is intentionally unused — Phase 1 uses 4 bands only.

// ─── Phase 1 — pure scoring functions ────────────────────────────────────────

// Words that describe seniority/employment type but not the role domain.
// Stripping these before title comparison makes "MuleSoft Developer" match
// "MuleSoft Integration Director" by their shared domain words instead of penalising
// for the different level word.
// Generic job-function words that appear in titles but don't identify domain or technology.
// Stripping these before comparison lets "MuleSoft Developer" match "MuleSoft Integration
// Director" by their shared technology word rather than failing on Developer vs Director.
const SENIORITY_WORDS = new Set([
  // Levels / grades
  'senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'associate',
  'director', 'manager', 'head', 'vp', 'vice', 'president', 'chief', 'officer',
  'executive', 'intern', 'entry', 'mid', 'contract', 'contractor', 'consultant',
  'remote', 'hybrid', 'part', 'full', 'time', 'i', 'ii', 'iii', 'iv', 'v',
  // Generic role nouns — the domain/tech word is what matters
  'developer', 'engineer', 'programmer', 'analyst', 'specialist', 'technician',
  'administrator', 'expert', 'professional', 'generalist',
])

function coreWords(title: string): string[] {
  return title.toLowerCase().split(/\W+/).filter((w) => w.length > 1 && !SENIORITY_WORDS.has(w))
}

export function scoreSkills(jobSkills: string[], jobText: string, userSkills: string[]): number {
  if (userSkills.length === 0) return 0
  const textLower = jobText.toLowerCase()
  const jobSkillSet = new Set(jobSkills.map((s) => s.toLowerCase()))
  let matches = 0
  for (const skill of userSkills) {
    const lower = skill.toLowerCase()
    if (jobSkillSet.has(lower) || textLower.includes(lower)) matches++
  }
  // Cap denominator at 15 so having 50 skills doesn't dilute the score
  const cap = Math.min(userSkills.length, 15)
  return Math.round((Math.min(matches, cap) / cap) * 10)
}

export function scorePrioritySkills(
  jobText: string,
  jobSkills: string[],
  prioritySkills: string[]
): number {
  if (prioritySkills.length === 0) return 0
  const text = jobText.toLowerCase()
  const jobSkillSet = new Set(jobSkills.map((s) => s.toLowerCase()))
  let matches = 0
  for (const skill of prioritySkills) {
    const lower = skill.toLowerCase()
    if (text.includes(lower) || jobSkillSet.has(lower)) matches++
  }
  return Math.round((matches / prioritySkills.length) * 30)
}

export function scoreTitle(jobTitle: string, desiredTitles: string[]): number {
  if (desiredTitles.length === 0) return 0

  const jobCore = new Set(coreWords(jobTitle))
  const jobAllWords = new Set(jobTitle.toLowerCase().split(/\W+/).filter(Boolean))

  let best = 0
  for (const desired of desiredTitles) {
    const desiredCore = coreWords(desired)
    if (desiredCore.length > 0) {
      // Seniority-stripped comparison — "MuleSoft Developer" vs "MuleSoft Integration Director"
      // both strip to domain words so "mulesoft" matches fully
      const coreMatches = desiredCore.filter((w) => jobCore.has(w)).length
      best = Math.max(best, coreMatches / desiredCore.length)
    }
    // Also try raw word overlap as a floor so exact matches always win
    const rawWords = desired.toLowerCase().split(/\W+/).filter(Boolean)
    if (rawWords.length > 0) {
      const rawMatches = rawWords.filter((w) => jobAllWords.has(w)).length
      best = Math.max(best, rawMatches / rawWords.length)
    }
  }
  return Math.round(best * 40)
}

export function scoreLocation(
  jobLocation: string | null,
  jobIsRemote: boolean,
  userLocation: string | null,
  workPreference: string | null,
  preferredLocations: string[]
): number {
  if (workPreference === 'remote') return jobIsRemote ? 5 : 0
  if (jobIsRemote) return workPreference === 'hybrid' || !workPreference ? 3 : 0

  const jobLoc = (jobLocation ?? '').toLowerCase()
  const preferred =
    preferredLocations.length > 0
      ? preferredLocations.map((l) => l.toLowerCase())
      : userLocation
      ? [userLocation.toLowerCase()]
      : []

  if (preferred.length === 0) return 0
  for (const pref of preferred) {
    if (jobLoc.includes(pref) || pref.includes(jobLoc)) return 5
  }
  return 0
}

export function scoreYearsExp(jobText: string, userYearsExp: number | null): number {
  if (userYearsExp === null) return 0
  const match = jobText.match(
    /(\d+)\+?\s*(?:[-–to]+\s*(\d+)\s*)?years?\s+(?:of\s+)?(?:\w+\s+)?experience/i
  )
  if (!match) return 5
  const min = parseInt(match[1])
  const isOpenEnded = !match[2] // "10+ years" has no stated upper bound
  const max = match[2] ? parseInt(match[2]) : min
  // Open-ended requirement: any experience at or above minimum is a full match
  if (isOpenEnded) {
    if (userYearsExp >= min) return 10
    if (min - userYearsExp <= 2) return 5
    return 1
  }
  if (userYearsExp >= min && userYearsExp <= max + 2) return 10
  if (Math.abs(userYearsExp - min) <= 2) return 5
  return 1
}

export function scoreKeywords(jobDescription: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const desc = (jobDescription ?? '').toLowerCase()
  const matches = keywords.filter((kw) => desc.includes(kw.toLowerCase()))
  return Math.round((matches.length / keywords.length) * 5)
}

export function computePhase1(
  job: JobForScoring,
  profile: UserMatchProfile,
  userSkillNames: string[],
  resumeKeywords: string[]
): Phase1Result {
  // Include the job title so tech names in the title (e.g. "MuleSoft Integration Director")
  // are found by priority skills, keywords, and skills text scanning
  const jobText = `${job.title} ${job.description ?? ''} ${job.requirements ?? ''}`

  const title = scoreTitle(job.title, profile.desired_titles)
  const priority_skills = scorePrioritySkills(jobText, job.extracted_skills, profile.priority_skills)
  const skills = scoreSkills(job.extracted_skills, jobText, userSkillNames)
  const experience = scoreYearsExp(jobText, profile.years_experience)
  const keywords = scoreKeywords(jobText, resumeKeywords)
  const location = scoreLocation(
    job.location,
    job.is_remote,
    profile.location,
    profile.work_preference,
    profile.preferred_locations
  )

  const score = Math.min(title + priority_skills + skills + experience + keywords + location, 100)

  let label: Phase1Result['label']
  if (score >= 80) label = 'excellent'
  else if (score >= 60) label = 'strong'
  else if (score >= 40) label = 'good'
  else label = 'low'

  return { score, label, breakdown: { title, priority_skills, skills, experience, keywords, location } }
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
    // Promote refined_score into match_score so all DB queries (filters, sorts, counts)
    // automatically use the AI-refined value instead of the raw Phase 1 score.
    const refinedLabel =
      output.refined_score >= 80 ? 'excellent'
      : output.refined_score >= 60 ? 'strong'
      : output.refined_score >= 40 ? 'good'
      : 'low'

    const { error: updateErr } = await supabaseAdmin
      .from('job_matches')
      .update({
        match_score: output.refined_score,
        match_label: refinedLabel,
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
  priority_skills: string[]
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

  const profileRaw = profileResult.data as (ActiveUser & { priority_skills?: string[] }) | null
  if (!profileRaw) return
  const profile: ActiveUser = { ...profileRaw, priority_skills: profileRaw.priority_skills ?? [] }

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
