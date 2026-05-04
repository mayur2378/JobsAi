import { StatCard } from './StatCard'

interface StatCardDef {
  label: string
  value: string | number
  sub?: string
  accent: string
  accentDim: string
}

interface StatSectionProps {
  title: string
  cards: StatCardDef[]
  cols?: 3 | 4 | 5
  children?: React.ReactNode
}

const COLS_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

export function StatSection({ title, cards, cols = 4, children }: StatSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-widest" style={{ color: '#64748b' }}>
        {title}
      </h2>
      <div className={`grid ${COLS_CLASS[cols] ?? 'grid-cols-4'} gap-3`}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>
      {children}
    </section>
  )
}
