import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)

export default router
