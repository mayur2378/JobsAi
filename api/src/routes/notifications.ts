import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'web']),
})

router.post('/register', verifyToken, validate(registerSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { token, platform } = req.body as { token: string; platform: 'android' | 'web' }

  const { error } = await supabaseAdmin
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    )

  if (error) {
    res.status(500).json(failure('Failed to register token'))
    return
  }

  res.json(success({ registered: true }))
})

export default router
