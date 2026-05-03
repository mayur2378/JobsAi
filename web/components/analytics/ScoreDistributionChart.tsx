'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ScoreBucket } from './analyticsQueries'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{ background: '#1a1425', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0' }}
    >
      <p style={{ color: '#a78bfa' }}>{label}</p>
      <p>{payload[0].value} jobs</p>
    </div>
  )
}

export function ScoreDistributionChart({ buckets }: { buckets: ScoreBucket[] }) {
  if (buckets.every((b) => b.count === 0)) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">No match data yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139,92,246,0.05)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {buckets.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
