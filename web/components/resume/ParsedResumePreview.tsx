interface ParsedData {
  full_name?: string | null
  skills?: string[]
  experience?: Array<{ title: string; company: string; duration: string }>
  education?: Array<{ degree: string; institution: string; year: string }>
  years_experience?: number | null
  summary?: string | null
}

interface ParsedResumePreviewProps {
  fileName: string
  parsedData: ParsedData | null
  isParsing: boolean
}

export function ParsedResumePreview({ fileName, parsedData, isParsing }: ParsedResumePreviewProps) {
  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">📄</span>
        <div>
          <p className="text-slate-200 text-sm font-medium">{fileName}</p>
          <p className="text-slate-500 text-xs">
            {isParsing ? (
              <span className="text-purple-400 animate-pulse">AI is parsing your resume…</span>
            ) : parsedData ? (
              <span className="text-green-400">✓ Parsed successfully</span>
            ) : (
              <span className="text-slate-500">Awaiting parse</span>
            )}
          </p>
        </div>
      </div>

      {parsedData && (
        <div className="space-y-3 text-sm">
          {parsedData.summary && (
            <p className="text-slate-400 leading-relaxed text-xs">{parsedData.summary}</p>
          )}

          {parsedData.skills && parsedData.skills.length > 0 && (
            <div>
              <p className="text-slate-400 font-medium mb-2 text-xs uppercase tracking-wide">
                Skills detected ({parsedData.skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {parsedData.skills.slice(0, 12).map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 rounded-md text-xs"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
                  >
                    {skill}
                  </span>
                ))}
                {parsedData.skills.length > 12 && (
                  <span className="text-slate-500 text-xs px-1">
                    +{parsedData.skills.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}

          {parsedData.experience && parsedData.experience.length > 0 && (
            <div>
              <p className="text-slate-400 font-medium mb-2 text-xs uppercase tracking-wide">Experience</p>
              <div className="space-y-1">
                {parsedData.experience.slice(0, 3).map((exp, i) => (
                  <div key={i} className="text-xs text-slate-400">
                    <span className="text-slate-300">{exp.title}</span>
                    {exp.company && <span> at {exp.company}</span>}
                    {exp.duration && <span className="text-slate-500"> · {exp.duration}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
