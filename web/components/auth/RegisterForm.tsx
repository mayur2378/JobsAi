'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const schema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

export function RegisterForm() {
  const router = useRouter()
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding/welcome`,
      },
    })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    router.push('/onboarding/welcome')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Email
        </label>
        <input
          {...register('email')}
          type="email"
          placeholder="you@example.com"
          className={inputClass}
        />
        {errors.email && (
          <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Password
        </label>
        <input
          {...register('password')}
          type="password"
          placeholder="Min 8 characters"
          className={inputClass}
        />
        {errors.password && (
          <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Confirm Password
        </label>
        <input
          {...register('confirmPassword')}
          type="password"
          placeholder="••••••••"
          className={inputClass}
        />
        {errors.confirmPassword && (
          <p className="text-red-400 text-xs mt-1">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition">
          Sign in
        </Link>
      </p>
    </form>
  )
}
