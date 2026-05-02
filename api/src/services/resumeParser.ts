import Anthropic from '@anthropic-ai/sdk'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>
import mammoth from 'mammoth'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'
import { recomputeForUser } from '../workers/matchEngine'

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

export interface ParsedResume {
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  skills: string[]
  experience: Array<{ title: string; company: string; duration: string; description: string }>
  education: Array<{ degree: string; institution: string; year: string }>
  certifications: string[]
  keywords: string[]
  years_experience: number | null
  summary: string | null
}

async function extractText(buffer: Buffer, fileType: 'pdf' | 'docx'): Promise<string> {
  if (fileType === 'pdf') {
    const result = await pdfParse(buffer)
    return result.text
  }
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function parseResume(buffer: Buffer, fileType: 'pdf' | 'docx'): Promise<ParsedResume> {
  const text = await extractText(buffer, fileType)

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system:
      'You are a resume parser. Extract structured information from resumes and return valid JSON only. No markdown, no code blocks, no explanation — just the raw JSON object.',
    messages: [
      {
        role: 'user',
        content: `Parse this resume and return a JSON object with exactly these fields:
{
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "education": [{"degree": string, "institution": string, "year": string}],
  "certifications": string[],
  "keywords": string[],
  "years_experience": number | null,
  "summary": string | null
}

Resume text:
${text}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  return JSON.parse(content.text) as ParsedResume
}

export async function parseResumeAsync(
  resumeId: string,
  buffer: Buffer,
  fileType: 'pdf' | 'docx',
  userId: string
): Promise<void> {
  try {
    const parsed = await parseResume(buffer, fileType)

    await supabaseAdmin
      .from('resumes')
      .update({
        parsed_data: parsed,
        parsed_at: new Date().toISOString(),
        is_active: true,
      })
      .eq('id', resumeId)

    // Sync resume-sourced skills: remove old, insert fresh
    if (parsed.skills.length > 0) {
      await supabaseAdmin.from('skills').delete().eq('user_id', userId).eq('source', 'resume')

      await supabaseAdmin.from('skills').insert(
        parsed.skills.map((name) => ({ user_id: userId, name, source: 'resume' }))
      )
    }

    recomputeForUser(userId).catch((err) =>
      console.error('[resumeParser] Recompute failed:', err)
    )
  } catch (err) {
    console.error('[resumeParser] Parsing failed:', err)
    // Non-fatal: the resume record stays in DB; user can trigger reparse
  }
}
