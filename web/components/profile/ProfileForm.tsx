'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

// Keep all fields as strings at the form level (HTML inputs always emit strings).
// Numeric fields are converted to numbers before the API call in onSubmit.
const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
  phone: z.string().optional(),
  work_preference: z.enum(['remote', 'hybrid', 'onsite', '']).optional(),
  years_experience: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), {
      message: 'Must be a non-negative number',
    }),
  salary_min: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), {
      message: 'Must be a non-negative number',
    }),
  salary_max: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), {
      message: 'Must be a non-negative number',
    }),
  desired_titles: z.array(z.object({ value: z.string() })).optional(),
  industries: z.array(z.object({ value: z.string() })).optional(),
})

type FormData = z.infer<typeof profileSchema>

interface ProfileFormProps {
  defaultValues?: Partial<FormData>
  nextPath?: string   // where to navigate after save (default: /onboarding/resume)
  submitLabel?: string
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1'

export function ProfileForm({
  defaultValues,
  nextPath = '/onboarding/resume',
  submitLabel = 'Save & continue',
}: ProfileFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaultValues ?? {},
  })

  const { fields: titleFields, append: addTitle, remove: removeTitle } = useFieldArray({
    control,
    name: 'desired_titles',
  })
  const { fields: industryFields, append: addIndustry, remove: removeIndustry } = useFieldArray({
    control,
    name: 'industries',
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)
    try {
      const toInt = (v?: string) => (v && v.trim() !== '' ? parseInt(v, 10) : undefined)
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: data.full_name,
          location: data.location || undefined,
          phone: data.phone || undefined,
          work_preference: data.work_preference || undefined,
          years_experience: toInt(data.years_experience),
          salary_min: toInt(data.salary_min),
          salary_max: toInt(data.salary_max),
          desired_titles: data.desired_titles?.map((t) => t.value).filter(Boolean) ?? [],
          industries: data.industries?.map((i) => i.value).filter(Boolean) ?? [],
        }),
      })
      router.push(nextPath)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className={labelClass}>Full name *</label>
        <input {...register('full_name')} placeholder="Alice Johnson" className={inputClass} />
        {errors.full_name && <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Location */}
        <div>
          <label className={labelClass}>Location</label>
          <input {...register('location')} placeholder="Austin, TX" className={inputClass} />
        </div>
        {/* Phone */}
        <div>
          <label className={labelClass}>Phone</label>
          <input {...register('phone')} placeholder="+1 555-000-0000" className={inputClass} />
        </div>
      </div>

      {/* Work preference */}
      <div>
        <label className={labelClass}>Work preference</label>
        <select
          {...register('work_preference')}
          className={inputClass}
          style={{ appearance: 'none' }}
        >
          <option value="">Select preference</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Years experience */}
        <div>
          <label className={labelClass}>Years exp.</label>
          <input
            {...register('years_experience')}
            type="number"
            min="0"
            placeholder="5"
            className={inputClass}
          />
          {errors.years_experience && (
            <p className="text-red-400 text-xs mt-1">{errors.years_experience.message}</p>
          )}
        </div>
        {/* Salary min */}
        <div>
          <label className={labelClass}>Min salary ($)</label>
          <input
            {...register('salary_min')}
            type="number"
            min="0"
            placeholder="80000"
            className={inputClass}
          />
          {errors.salary_min && (
            <p className="text-red-400 text-xs mt-1">{errors.salary_min.message}</p>
          )}
        </div>
        {/* Salary max */}
        <div>
          <label className={labelClass}>Max salary ($)</label>
          <input
            {...register('salary_max')}
            type="number"
            min="0"
            placeholder="120000"
            className={inputClass}
          />
          {errors.salary_max && (
            <p className="text-red-400 text-xs mt-1">{errors.salary_max.message}</p>
          )}
        </div>
      </div>

      {/* Desired titles */}
      <div>
        <label className={labelClass}>Desired job titles</label>
        <div className="space-y-2">
          {titleFields.map((field, i) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`desired_titles.${i}.value`)}
                placeholder="e.g. Senior Frontend Engineer"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeTitle(i)}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 transition text-sm"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addTitle({ value: '' })}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            + Add title
          </button>
        </div>
      </div>

      {/* Industries */}
      <div>
        <label className={labelClass}>Industries</label>
        <div className="space-y-2">
          {industryFields.map((field, i) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`industries.${i}.value`)}
                placeholder="e.g. FinTech"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeIndustry(i)}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 transition text-sm"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addIndustry({ value: '' })}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            + Add industry
          </button>
        </div>
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 hover:opacity-90 transition"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
