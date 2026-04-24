import { Router } from 'express'
import { success } from '../types'

const router = Router()

router.get('/', (_req, res) => {
  res.json(success({ status: 'ok', timestamp: new Date().toISOString() }))
})

export default router
