interface ExamFocusModeShellProps {
  children: React.ReactNode
}

/**
 * Server-rendered marker for the active multiple-choice runtime.
 *
 * Keeping this marker in the server route branch lets the global mobile chrome
 * be suppressed without pathname polling or a hydration-time route guess.
 */
export default function ExamFocusModeShell({ children }: ExamFocusModeShellProps) {
  return (
    <div className="exam-focus-mode" data-exam-focus-mode="true">
      {children}
    </div>
  )
}
