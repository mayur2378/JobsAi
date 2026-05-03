import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'
import jobsRouter from './jobs'
import applicationsRouter from './applications'
import notificationsRouter from './notifications'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)
router.use('/jobs', jobsRouter)
router.use('/applications', applicationsRouter)
router.use('/notifications', notificationsRouter)

export default router
