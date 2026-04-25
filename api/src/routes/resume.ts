import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { parseResumeAsync } from '../services/resumeParser'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    cb(null, allowed.includes(file.mimetype))
  },
})

// POST /resume/upload
router.post(
  '/upload',
  verifyToken,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError || err) {
        res.status(400).json(failure(err.message || 'File upload error'))
        return
      }
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json(failure('No file uploaded'))
      return
    }

    const { userId } = req as AuthRequest
    const fileExt = req.file.originalname.split('.').pop()?.toLowerCase() ?? ''
    const fileType = fileExt === 'pdf' ? 'pdf' : 'docx'
    const storagePath = `${userId}/${randomUUID()}-${req.file.originalname}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('resumes')
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype })

    if (uploadError) {
      res.status(500).json(failure('Failed to upload file to storage'))
      return
    }

    // Deactivate any previous active resumes
    await supabaseAdmin
      .from('resumes')
      .update({ is_active: false })
      .eq('user_id', userId)

    const { data, error } = await supabaseAdmin
      .from('resumes')
      .insert({
        user_id: userId,
        file_name: req.file.originalname,
        file_url: storagePath,
        file_type: fileType,
        is_active: false,
      })
      .select()
      .single()

    if (error) {
      res.status(500).json(failure('Failed to save resume record'))
      return
    }

    // Fire-and-forget: parse async, update DB when done
    parseResumeAsync(data.id, req.file.buffer, fileType as 'pdf' | 'docx', userId).catch(
      console.error
    )

    res.status(201).json(success(data))
  }
)

// GET /resume — returns active resume with a fresh signed URL
router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data: resume, error } = await supabaseAdmin
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !resume) {
    res.json(success(null))
    return
  }

  const { data: urlData } = await supabaseAdmin.storage
    .from('resumes')
    .createSignedUrl(resume.file_url, 3600)

  res.json(success({ ...resume, signed_url: urlData?.signedUrl ?? null }))
})

// GET /resume/status/:id — poll for parse completion
router.get('/status/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('resumes')
    .select('id, is_active, parsed_data, parsed_at')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    res.status(404).json(failure('Resume not found'))
    return
  }
  res.json(success(data))
})

// DELETE /resume/:id
router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  // Fetch by id, then verify ownership in code
  const { data: resume, error: fetchError } = await supabaseAdmin
    .from('resumes')
    .select('id, file_url, user_id')
    .single()

  if (fetchError || !resume || resume.user_id !== userId) {
    res.status(404).json(failure('Resume not found'))
    return
  }

  await supabaseAdmin.storage.from('resumes').remove([resume.file_url])

  await supabaseAdmin.from('resumes').delete().eq('id', resume.id)

  res.status(204).send()
})

// POST /resume/:id/reparse
router.post('/:id/reparse', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: resume, error } = await supabaseAdmin
    .from('resumes')
    .select('id, file_url, file_type')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !resume) {
    res.status(404).json(failure('Resume not found'))
    return
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('resumes')
    .download(resume.file_url)

  if (downloadError || !fileData) {
    res.status(500).json(failure('Failed to download resume for reparsing'))
    return
  }

  const buffer = Buffer.from(await (fileData as Blob).arrayBuffer())
  parseResumeAsync(resume.id, buffer, resume.file_type as 'pdf' | 'docx', userId).catch(
    console.error
  )

  res.json(success({ message: 'Reparsing started' }))
})

export default router
