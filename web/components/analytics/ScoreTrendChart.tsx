'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WeeklyScore } from './analyticsQueries'

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
      <p>avg: {payload[0].value}</p>
    </div>
  )
}

export function ScoreTrendChart({ weeks }: { weeks: WeeklyScore[] }) {
  if (weeks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">Not enough data yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={weeks} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="week"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={60} stroke="rgba(139,92,246,0.3)" strokeDasharray="4 4" />
        <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={{ fill: '#a78bfa', r: 3 }}
          activeDot={{ r: 5, fill: '#7c3aed' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
