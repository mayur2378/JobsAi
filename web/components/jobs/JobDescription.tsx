'use client'

interface Block {
  type: 'heading' | 'bullets' | 'paragraph'
  heading?: string
  items?: string[]
  text?: string
}

function parseJobText(raw: string): Block[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Detect section header: ends with ":", or short all-caps line, or known header words
    const isHeader =
      /^[A-Z][^.!?]*:$/.test(line) ||
      (/^[A-Z\s]{4,}$/.test(line) && line.length < 60) ||
      /^(responsibilities|requirements|qualifications|about|what you|nice to have|benefits|compensation|skills|experience|education|duties|overview|summary|role|position|job description)s?:?\s*$/i.test(line)

    if (isHeader) {
      const heading = line.replace(/:$/, '')
      const bullets: string[] = []
      i++
      while (i < lines.length) {
        const next = lines[i]
        if (isBullet(next)) {
          bullets.push(cleanBullet(next))
          i++
        } else if (isHeader || isNextHeader(next)) {
          break
        } else {
          // Short non-bullet lines after a header often belong to the section as prose
          bullets.push(next)
          i++
        }
      }
      if (bullets.length > 0) {
        blocks.push({ type: 'bullets', heading, items: bullets })
      } else {
        blocks.push({ type: 'heading', heading })
      }
      continue
    }

    if (isBullet(line)) {
      // Collect run of bullets (possibly without a header)
      const bullets: string[] = [cleanBullet(line)]
      i++
      while (i < lines.length && isBullet(lines[i])) {
        bullets.push(cleanBullet(lines[i]))
        i++
      }
      blocks.push({ type: 'bullets', items: bullets })
      continue
    }

    // Plain paragraph
    blocks.push({ type: 'paragraph', text: line })
    i++
  }

  return blocks
}

function isBullet(line: string): boolean {
  return /^[•\-–*▪◦▸►→]\s/.test(line) || /^\d+[.)]\s/.test(line)
}

function isNextHeader(line: string): boolean {
  return /^[A-Z][^.!?]*:$/.test(line) || /^[A-Z\s]{4,}$/.test(line)
}

function cleanBullet(line: string): string {
  return line.replace(/^[•\-–*▪◦▸►→]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()
}

interface JobDescriptionProps {
  text: string
  label?: string
}

export function JobDescription({ text, label }: JobDescriptionProps) {
  const blocks = parseJobText(text)

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      {label && (
        <div
          className="font-mono text-xs uppercase tracking-widest mb-4"
          style={{ color: '#64748b', fontSize: 9 }}
        >
          {label}
        </div>
      )}
      <div className="space-y-4">
        {blocks.map((block, idx) => {
          if (block.type === 'heading') {
            return (
              <div key={idx} className="font-semibold text-xs" style={{ color: '#a78bfa' }}>
                {block.heading}
              </div>
            )
          }

          if (block.type === 'bullets') {
            return (
              <div key={idx}>
                {block.heading && (
                  <div
                    className="font-semibold text-xs mb-2"
                    style={{ color: '#a78bfa' }}
                  >
                    {block.heading}
                  </div>
                )}
                <ul className="space-y-1.5">
                  {(block.items ?? []).map((item, j) => (
                    <li key={j} className="flex gap-2 text-xs" style={{ color: '#94a3b8', lineHeight: 1.6 }}>
                      <span className="flex-shrink-0 mt-1" style={{ color: '#4c1d95', fontSize: 6 }}>
                        ●
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          }

          return (
            <p key={idx} className="text-xs leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.75 }}>
              {block.text}
            </p>
          )
        })}
      </div>
    </div>
  )
}
