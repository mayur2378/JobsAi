'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

export function ForgotPasswordForm() {
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <div className="text-3xl">📧</div>
        <p className="text-slate-300 text-sm">
          Check your inbox — we sent a password reset link.
        </p>
        <Link
          href="/login"
          className="block text-purple-400 hover:text-purple-300 text-sm transition"
        >
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-slate-400 text-sm mb-2">
        Enter your email and we'll send you a reset link.
      </p>
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
        {isLoading ? 'Sending…' : 'Send reset link'}
      </button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition">
          ← Back to sign in
        </Link>
      </p>
    </form>
  )
}
