import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { aiLimiter } from '../middleware/rateLimiter'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { scrapeJobsForUser } from '../workers/scraper'
import { runPipelineForJobs } from '../workers/matchEngine'

const router = Router()

const ONE_HOUR_MS = 60 * 60 * 1000

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  status: z
    .enum(['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected'])
    .optional(),
  remote: z.coerce.boolean().optional(),
})

const statusSchema = z.object({
  status: z.enum(['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected']),
})

// GET /jobs — paginated list with match scores
router.get('/', verifyToken, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json(failure('Invalid query parameters'))
    return
  }

  const { page, limit, min_score, status: statusFilter, remote } = parsed.data
  const { userId } = req as AuthRequest
  const offset = (page - 1) * limit

  let statusJobIds: string[] | null = null
  if (statusFilter) {
    const { data: apps } = await supabaseAdmin
      .from('job_applications')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', statusFilter)
    statusJobIds = (apps ?? []).map((a: { job_id: string }) => a.job_id)
    if (statusJobIds.length === 0) {
      res.json(success({ jobs: [], total: 0, page, limit }))
      return
    }
  }

  const baseQuery = supabaseAdmin
    .from('job_matches')
    .select(
      `match_score, match_label, refined_score, ai_refined, job_id,
       jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url, posted_at)`,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .gte('match_score', min_score ?? 0)
    .order('match_score', { ascending: false })

  const withStatus = statusJobIds ? baseQuery.in('job_id', statusJobIds) : baseQuery
  const withRemote = remote !== undefined ? (withStatus as any).eq('jobs.is_remote', remote) : withStatus

  const { data: matches, error, count } = await withRemote.range(offset, offset + limit - 1)

  if (error) {
    res.status(500).json(failure('Failed to fetch jobs'))
    return
  }

  const matchList = matches ?? []
  const jobIds = matchList.map((m: any) => m.job_id)

  const appQueryResult = jobIds.length > 0
    ? await supabaseAdmin
        .from('job_applications')
        .select('job_id, status')
        .eq('user_id', userId)
        .in('job_id', jobIds)
    : { data: [], error: null }

  if (appQueryResult.error) {
    res.status(500).json(failure('Failed to fetch application status'))
    return
  }

  const appMap = new Map(
    (appQueryResult.data ?? []).map((a: { job_id: string; status: string }) => [a.job_id, a.status])
  )

  const jobs = matchList.map((m: any) => ({
    ...m.jobs,
    match_score: m.match_score,
    match_label: m.match_label,
    refined_score: m.refined_score,
    ai_refined: m.ai_refined,
    application_status: appMap.get(m.job_id) ?? null,
  }))

  res.json(success({ jobs, total: count ?? 0, page, limit }))
})

// POST /jobs/refresh — manual trigger (rate-limited 1/hour/user)
// NOTE: Must be registered before GET /:id to avoid param capture
router.post('/refresh', aiLimiter, verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, last_refresh_at, desired_titles, preferred_locations, work_preference, location')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    res.status(500).json(failure('Failed to fetch profile'))
    return
  }

  const p = profile as any

  if (p.last_refresh_at) {
    const elapsed = Date.now() - new Date(p.last_refresh_at).getTime()
    if (elapsed < ONE_HOUR_MS) {
      res.status(429).json(failure('Refresh allowed once per hour'))
      return
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ last_refresh_at: new Date().toISOString() })
    .eq('id', userId)

  if (updateError) {
    console.error('[jobs/refresh] Failed to update last_refresh_at:', updateError.message)
  }

  // Fire-and-forget: scrape + match
  ;(async () => {
    try {
      const jobIds = await scrapeJobsForUser(
        p.desired_titles ?? [],
        p.preferred_locations ?? [],
        p.work_preference ?? null,
        p.location ?? null
      )
      if (jobIds.length > 0) {
        await runPipelineForJobs(jobIds, userId)
      }
    } catch (err) {
      console.error('[jobs/refresh] Pipeline error:', err)
    }
  })()

  res.status(202).json(success({ message: 'Refresh queued' }))
})

// GET /jobs/:id — full detail with match breakdown
router.get('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: match, error } = await supabaseAdmin
    .from('job_matches')
    .select(
      `match_score, match_label, refined_score, ai_refined,
       skills_matched, skills_missing, match_explanation, gaps_to_improve, match_breakdown,
       jobs!inner(id, title, company, location, is_remote, description, requirements,
                  extracted_skills, salary_min, salary_max, apply_url, posted_at)`
    )
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !match) {
    res.status(404).json(failure('Job not found'))
    return
  }

  const { data: application } = await supabaseAdmin
    .from('job_applications')
    .select('status')
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  const m = match as any
  res.json(
    success({
      ...m.jobs,
      match_score: m.match_score,
      match_label: m.match_label,
      refined_score: m.refined_score,
      ai_refined: m.ai_refined,
      skills_matched: m.skills_matched,
      skills_missing: m.skills_missing,
      match_explanation: m.match_explanation,
      gaps_to_improve: m.gaps_to_improve,
      match_breakdown: m.match_breakdown,
      application_status: (application as any)?.status ?? null,
    })
  )
})

// GET /jobs/:id/match — match data only (for polling while Phase 2 runs)
router.get('/:id/match', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data, error } = await supabaseAdmin
    .from('job_matches')
    .select(
      'match_score, match_label, refined_score, ai_refined, skills_matched, skills_missing, match_explanation, gaps_to_improve'
    )
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    res.status(404).json(failure('Match not found'))
    return
  }

  res.json(success(data))
})

// PATCH /jobs/:id/status — update application status
router.patch('/:id/status', verifyToken, validate(statusSchema), async (req, res) => {
  const { userId } = req as AuthRequest

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .upsert(
      {
        user_id: userId,
        job_id: req.params.id,
        status: req.body.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to update status'))
    return
  }

  res.json(success(data))
})

export default router
