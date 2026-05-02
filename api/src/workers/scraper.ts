import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'
import { extractSkills } from '../lib/skillVocabulary'

const JSEARCH_HOST = 'jsearch.p.rapidapi.com'
const JSEARCH_BASE = `https://${JSEARCH_HOST}/search`

export interface ScrapeQuery {
  query: string
  remoteOnly: boolean
}

export function buildQueries(
  desiredTitles: string[],
  preferredLocations: string[],
  workPreference: 'remote' | 'hybrid' | 'onsite' | null,
  locationFallback?: string | null
): ScrapeQuery[] {
  if (desiredTitles.length === 0) return []

  const isRemoteOnly = workPreference === 'remote'

  // Fall back to the single location string if preferred_locations array is empty
  const locations =
    preferredLocations.length > 0
      ? preferredLocations
      : locationFallback
        ? [locationFallback]
        : []

  if (locations.length === 0) {
    if (!isRemoteOnly) return []
    return desiredTitles.map((title) => ({ query: title, remoteOnly: true }))
  }

  const queries: ScrapeQuery[] = []
  for (const title of desiredTitles) {
    for (const location of locations) {
      queries.push({ query: `${title} ${location}`, remoteOnly: isRemoteOnly })
    }
  }
  return queries
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapJSearchJob(raw: any): {
  external_id: string
  source: string
  title: string
  company: string | null
  location: string
  is_remote: boolean
  description: string | null
  requirements: string | null
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
  posted_at: string | null
  extracted_skills: string[]
  raw_data: unknown
} {
  const qualifications: string[] = raw.job_highlights?.Qualifications ?? []
  const requirements = qualifications.length > 0 ? qualifications.join('\n') : null
  const descText = `${raw.job_description ?? ''} ${requirements ?? ''}`

  return {
    external_id: raw.job_id ?? '',
    source: 'jsearch',
    title: raw.job_title ?? '',
    company: raw.employer_name ?? null,
    location: `${raw.job_city ?? ''}, ${raw.job_country ?? ''}`,
    is_remote: raw.job_is_remote ?? false,
    description: raw.job_description ?? null,
    requirements,
    salary_min: raw.job_min_salary ?? null,
    salary_max: raw.job_max_salary ?? null,
    apply_url: raw.job_apply_link ?? null,
    posted_at: raw.job_posted_at_datetime_utc ?? null,
    extracted_skills: extractSkills(descText),
    raw_data: raw,
  }
}

async function fetchJSearchPage(scrapeQuery: ScrapeQuery): Promise<unknown[]> {
  const params = new URLSearchParams({
    query: scrapeQuery.query,
    page: '1',
    num_pages: '1',
    date_posted: '3days',
    ...(scrapeQuery.remoteOnly ? { remote_jobs_only: 'true' } : {}),
  })

  const res = await fetch(`${JSEARCH_BASE}?${params}`, {
    headers: {
      'X-RapidAPI-Key': env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': JSEARCH_HOST,
    },
  })

  if (!res.ok) {
    console.error(`[scraper] JSearch error ${res.status} for query: ${scrapeQuery.query}`)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any
  return Array.isArray(json.data) ? json.data : []
}

export async function scrapeJobsForUser(
  desiredTitles: string[],
  preferredLocations: string[],
  workPreference: 'remote' | 'hybrid' | 'onsite' | null
): Promise<string[]> {
  const queries = buildQueries(desiredTitles, preferredLocations, workPreference)
  if (queries.length === 0) return []

  const newJobIds: string[] = []

  for (const q of queries) {
    const rawJobs = await fetchJSearchPage(q)
    if (rawJobs.length === 0) continue

    const mapped = rawJobs.map(mapJSearchJob)

    const { data, error } = await supabaseAdmin
      .from('jobs')
      .upsert(mapped, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id, external_id')

    if (error) {
      console.error(`[scraper] Insert error for query "${q.query}" (${mapped.length} records):`, error.message)
      continue
    }

    const inserted = (data ?? []).map((j: { id: string }) => j.id)
    newJobIds.push(...inserted)
  }

  return newJobIds
}

export async function scrapeForAllActiveUsers(): Promise<{ userId: string; jobIds: string[] }[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, desired_titles, preferred_locations, work_preference, location')
    .or('desired_titles.neq.{},work_preference.eq.remote')

  if (error || !profiles) {
    console.error('[scraper] Failed to fetch profiles:', error?.message)
    return []
  }

  const results: { userId: string; jobIds: string[] }[] = []

  for (const profile of profiles) {
    const titles: string[] = profile.desired_titles ?? []
    const locations: string[] = profile.preferred_locations ?? []
    const pref = profile.work_preference ?? null

    if (titles.length === 0 && pref !== 'remote') continue

    const jobIds = await scrapeJobsForUser(titles, locations, pref, profile.location)
    results.push({ userId: profile.id, jobIds })
  }

  return results
}
