// api/src/routes/applications.ts
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const APP_STATUS = ['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected'] as const
type AppStatus = typeof APP_STATUS[number]

const createAppSchema = z.object({
  job_id: z.string().min(1),
  status: z.enum(APP_STATUS).default('saved'),
})

const updateAppSchema = z.object({
  status: z.enum(APP_STATUS).optional(),
  applied_at: z.string().datetime({ offset: true }).nullable().optional(),
  interview_date: z.string().datetime({ offset: true }).nullable().optional(),
  follow_up_date: z.string().datetime({ offset: true }).nullable().optional(),
  offer_amount: z.number().int().nullable().optional(),
})

// GET /applications — all non-dismissed apps with job details + match scores
router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: apps, error: appsError } = await supabaseAdmin
    .from('job_applications')
    .select(
      `id, user_id, job_id, status, applied_at, interview_date, follow_up_date,
       offer_amount, created_at, updated_at,
       jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url)`
    )
    .eq('user_id', userId)
    .neq('status', 'dismissed')
    .order('updated_at', { ascending: false })

  if (appsError) {
    res.status(500).json(failure('Failed to fetch applications'))
    return
  }

  const appsData = (apps ?? []) as any[]
  const jobIds = appsData.map((a) => a.job_id)

  let matchMap = new Map<string, any>()
  if (jobIds.length > 0) {
    const { data: matches } = await supabaseAdmin
      .from('job_matches')
      .select('job_id, match_score, match_label, refined_score, ai_refined')
      .eq('user_id', userId)
      .in('job_id', jobIds)
    for (const m of matches ?? []) matchMap.set(m.job_id, m)
  }

  const result = appsData.map((a) => ({
    ...a,
    match: matchMap.get(a.job_id) ?? null,
  }))

  res.json(success(result))
})

// POST /applications — upsert application record
router.post('/', verifyToken, validate(createAppSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .upsert(
      { user_id: userId, ...req.body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create application'))
    return
  }
  res.status(201).json(success(data))
})

const noteSchema = z.object({ content: z.string().min(1) })

// Ownership guard helper
async function ownsApplication(applicationId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_applications')
    .select('id')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// GET /applications/:id/notes
router.get('/:id/notes', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  if (!(await ownsApplication(req.params.id, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('notes')
    .select('id, content, created_at, updated_at')
    .eq('job_application_id', req.params.id)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json(failure('Failed to fetch notes'))
    return
  }
  res.json(success(data))
})

// POST /applications/:id/notes
router.post('/:id/notes', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  if (!(await ownsApplication(req.params.id, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const parsed = noteSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json(failure('Validation error', { fields: parsed.error.flatten().fieldErrors }))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('notes')
    .insert({
      user_id: userId,
      job_application_id: req.params.id,
      content: parsed.data.content,
    })
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create note'))
    return
  }
  res.status(201).json(success(data))
})

// DELETE /notes/:noteId  (mounted at /applications so full path is /applications/notes/:noteId)
router.delete('/notes/:noteId', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('notes')
    .delete()
    .eq('id', req.params.noteId)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete note'))
    return
  }
  if (!data || (data as any[]).length === 0) {
    res.status(404).json(failure('Note not found'))
    return
  }
  res.status(204).send()
})

// PUT /applications/:id — update status / date fields
router.put('/:id', verifyToken, validate(updateAppSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json(failure('Application not found'))
    return
  }
  res.json(success(data))
})

// DELETE /applications/:id
router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete application'))
    return
  }
  if (!data || (data as any[]).length === 0) {
    res.status(404).json(failure('Application not found'))
    return
  }
  res.status(204).send()
})

export default router
