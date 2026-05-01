import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'
import jobsRouter from './jobs'
import applicationsRouter from './applications'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)
router.use('/jobs', jobsRouter)
router.use('/applications', applicationsRouter)

export default router
