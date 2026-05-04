'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DailyCount } from './adminQueries'

function shortDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function DailySignupsChart({ data }: { data: DailyCount[] }) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">No signup data yet</p>
      </div>
    )
  }
  const chartData = data.map((d) => ({ date: shortDate(d.date), count: d.count }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1425',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          cursor={{ fill: 'rgba(56,189,248,0.05)' }}
        />
        <Bar dataKey="count" fill="#38bdf8" radius={[3, 3, 0, 0]} name="signups" />
      </BarChart>
    </ResponsiveContainer>
  )
}
