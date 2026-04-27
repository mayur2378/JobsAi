import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { recomputeForUser } from '../workers/matchEngine'

const router = Router()

const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  proficiency: z.enum(['beginner', 'intermediate', 'expert']).optional(),
})

const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  proficiency: z.enum(['beginner', 'intermediate', 'expert']).optional(),
})

router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json(failure('Failed to fetch skills'))
    return
  }
  res.json(success(data))
})

router.post('/', verifyToken, validate(createSkillSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .insert({ user_id: userId, source: 'manual', ...req.body })
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create skill'))
    return
  }
  res.status(201).json(success(data))
  recomputeForUser(userId).catch(console.error)
})

router.put('/:id', verifyToken, validate(updateSkillSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json(failure('Skill not found'))
    return
  }
  res.json(success(data))
  recomputeForUser(userId).catch(console.error)
})

router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete skill'))
    return
  }
  if (!data || data.length === 0) {
    res.status(404).json(failure('Skill not found'))
    return
  }
  recomputeForUser(userId).catch(console.error)
  res.status(204).send()
})

export default router
