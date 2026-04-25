'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        setServerError('Invalid or expired reset link. Please request a new one.')
      }
    })
  }, [supabase])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.updateUser({ password: data.password })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    router.push('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          New password
        </label>
        <input
          {...register('password')}
          type="password"
          placeholder="Min. 8 characters"
          className={inputClass}
        />
        {errors.password && (
          <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Confirm password
        </label>
        <input
          {...register('confirmPassword')}
          type="password"
          placeholder="Repeat your password"
          className={inputClass}
        />
        {errors.confirmPassword && (
          <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !sessionReady}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-slate-100 mb-6">Set new password</h2>
      <ResetPasswordForm />
    </>
  )
}
