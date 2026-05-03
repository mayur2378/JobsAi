import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { failure } from '../types'

export interface AuthRequest extends Request {
  userId: string
  userEmail: string
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn(`[auth] 401 missing-header ip=${req.ip ?? 'unknown'} path=${req.path}`)
    res.status(401).json(failure('Missing authorization header'))
    return
  }

  const token = authHeader.slice(7)

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      console.warn(`[auth] 401 invalid-token ip=${req.ip ?? 'unknown'} path=${req.path}`)
      res.status(401).json(failure('Invalid or expired token'))
      return
    }

    ;(req as AuthRequest).userId = user.id
    ;(req as AuthRequest).userEmail = user.email ?? ''
    next()
  } catch {
    res.status(401).json(failure('Token verification failed'))
  }
}
