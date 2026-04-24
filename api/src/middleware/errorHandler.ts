import { Request, Response, NextFunction } from 'express'
import { failure } from '../types'
import { env } from '../config/env'

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(failure('Not found'))
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err.stack)
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  res.status(500).json(failure(message))
}
