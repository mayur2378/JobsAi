interface Step {
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => {
        const isComplete = i < currentStep
        const isActive = i === currentStep
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  background: isComplete
                    ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                    : isActive
                    ? 'rgba(139,92,246,0.25)'
                    : 'rgba(255,255,255,0.05)',
                  border: isActive
                    ? '2px solid #a78bfa'
                    : isComplete
                    ? '2px solid transparent'
                    : '2px solid rgba(255,255,255,0.1)',
                  color: isComplete ? '#fff' : isActive ? '#a78bfa' : '#4b5563',
                  boxShadow: isActive
                    ? '0 0 12px rgba(167,139,250,0.35)'
                    : isComplete
                    ? '0 0 8px rgba(168,85,247,0.25)'
                    : 'none',
                }}
              >
                {isComplete ? '✓' : i + 1}
              </div>
              <span
                className="text-xs font-medium tracking-wide"
                style={{ color: isActive ? '#a78bfa' : isComplete ? '#7c3aed' : '#4b5563' }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-8 h-px mb-5"
                style={{
                  background: isComplete
                    ? 'linear-gradient(90deg, #7c3aed, #a855f7)'
                    : 'rgba(255,255,255,0.08)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
