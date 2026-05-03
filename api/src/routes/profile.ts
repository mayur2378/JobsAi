import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  desired_titles: z.array(z.string()).optional(),
  preferred_locations: z.array(z.string()).optional(),
  work_preference: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  salary_min: z.number().int().min(0).optional(),
  salary_max: z.number().int().min(0).optional(),
  years_experience: z.number().int().min(0).optional(),
  industries: z.array(z.string()).optional(),
  priority_skills: z.array(z.string()).max(10).optional(),
})

router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone, location, desired_titles, preferred_locations, work_preference, salary_min, salary_max, years_experience, industries, priority_skills, onboarding_completed, last_refresh_at, updated_at')
    .eq('id', userId)
    .single()

  if (error) {
    res.status(500).json(failure('Failed to fetch profile'))
    return
  }
  res.json(success(data))
})

router.put('/', verifyToken, validate(updateProfileSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, ...req.body, updated_at: new Date().toISOString() })
    .select('id, full_name, phone, location, desired_titles, preferred_locations, work_preference, salary_min, salary_max, years_experience, industries, priority_skills, onboarding_completed, last_refresh_at, updated_at')
    .single()

  if (error) {
    console.error('[profile PUT] Supabase error code:', error.code)
    res.status(500).json(failure('Failed to update profile'))
    return
  }
  res.json(success(data))
})

router.post('/onboarding', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, onboarding_completed')
    .single()

  if (error) {
    res.status(500).json(failure('Failed to complete onboarding'))
    return
  }
  res.json(success(data))
})

export default router
