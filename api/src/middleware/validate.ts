import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { failure } from '../types'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json(
        failure('Validation error', {
          fields: result.error.flatten().fieldErrors,
        })
      )
      return
    }
    req.body = result.data
    next()
  }
}
