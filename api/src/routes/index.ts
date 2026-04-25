import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)

export default router
