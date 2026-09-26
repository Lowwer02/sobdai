import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path) => readFileSync(`${root}/${path}`, 'utf8')

const runtime = read('app/package/[slug]/exam/[examSetId]/ExamRuntime.tsx')
const examPage = read('app/package/[slug]/exam/[examSetId]/page.tsx')
const globals = read('app/globals.css')
const navbar = read('components/Navbar.tsx')
const footer = read('components/Footer.tsx')
const navigator = read('components/exams/QuestionNavigator.tsx')

test('practice and mock mobile controls preserve the existing runtime gates', () => {
  assert.match(runtime, /const hasCurrentHint = isPractice\s+&& status === 'IN_PROGRESS'\s+&& Boolean\(q && !answers\[q\.id\] && q\.hint\?\.trim\(\)\)/)
  assert.match(runtime, /setRevealedHints\(\(previous\) => \(\{ \.\.\.previous, \[q\.id\]: true \}\)\)/)
  assert.match(runtime, /hasCurrentHint \? \(/)
  assert.match(runtime, /exam-mobile-bottom-bar__spacer/)
  assert.match(runtime, /const isPracticeNextDisabled = isPractice && \(!q \|\| !answers\[q\.id\]\)/)
  assert.match(runtime, /const isNextDisabled = status === 'IN_PROGRESS'\s+\? \(isPractice \? isPracticeNextDisabled : false\)/)
  assert.match(runtime, /onClick=\{status === 'IN_PROGRESS' && isLastQuestion \? handleRequestSubmit : goNext\}/)
  assert.match(runtime, /scheduleMockAutoAdvance\(currentIndex\)/)
  assert.match(runtime, /status === 'IN_PROGRESS' && isPractice && !options\?\.bypassPracticeGate/)
})

test('practice hint timing stays pre-answer and local-only', () => {
  const hintClick = runtime.match(/const handleHintClick = \(\) => \{([\s\S]*?)\n  \}/)?.[1]
  const handleSelect = runtime.match(/const handleSelect = \(letter: ChoiceLetter\) => \{([\s\S]*?)\n  \}/)?.[1]

  assert.ok(hintClick, 'expected a local hint click handler')
  assert.ok(handleSelect, 'expected the answer selection handler')
  assert.match(runtime, /if \(!hasCurrentHint\) setIsHintOpen\(false\)/)
  assert.match(hintClick, /setRevealedHints\(/)
  assert.match(hintClick, /setIsHintOpen\(true\)/)
  assert.doesNotMatch(hintClick, /setAnswers|saveMyAssessmentSession|handleRequestSubmit/)
  assert.match(handleSelect, /setIsHintOpen\(false\)/)
  assert.match(runtime, /const isPracticeNextDisabled = isPractice && \(!q \|\| !answers\[q\.id\]\)/)
})

test('hint visibility covers no-hint practice and mock modes', () => {
  assert.match(runtime, /Boolean\(q && !answers\[q\.id\] && q\.hint\?\.trim\(\)\)/)
  assert.match(runtime, /const hasCurrentHint = isPractice/)
  assert.match(runtime, /\{hasCurrentHint \? \(/)
  assert.match(runtime, /exam-mobile-bottom-bar__spacer/)
})

test('Hint never appears in consolidated answer feedback or REVIEW', () => {
  const feedback = runtime.match(/const renderExplanationFeedback = \(\) => \{([\s\S]*?)\n  \}\n\n  const isCurrentHintRevealed/)?.[1]

  assert.ok(feedback, 'expected consolidated feedback renderer')
  assert.doesNotMatch(feedback, /q\.hint|คำใบ้|hasReviewHint/)
  assert.doesNotMatch(runtime, /const hasReviewHint/)
})

test('Mock final mobile control submits while Practice keeps its result gate', () => {
  assert.match(runtime, /onClick=\{status === 'IN_PROGRESS' && isLastQuestion \? handleRequestSubmit : goNext\}/)
  assert.match(runtime, /aria-label=\{status === 'IN_PROGRESS' && isLastQuestion \? \(isPractice \? 'ดูผลคะแนน' : 'ส่งข้อสอบ'\) : 'ถัดไป'\}/)
  assert.match(runtime, /<span>\{status === 'IN_PROGRESS' && isLastQuestion \? \(isPractice \? 'ดูผลคะแนน' : 'ส่งข้อสอบ'\) : 'ถัดไป'\}<\/span>/)
  assert.match(runtime, /const isNextDisabled = status === 'IN_PROGRESS'\s+\? \(isPractice \? isPracticeNextDisabled : false\)/)
})

test('desktop footer removes the dot strip but keeps its navigator counter', () => {
  assert.doesNotMatch(runtime, /renderIndicators/)
  assert.doesNotMatch(runtime, /Bottom Row: Indicators/)
  assert.match(runtime, /className="hidden lg:flex fixed bottom-0/)
  assert.match(runtime, /<LayoutGrid size=\{15\}/)
  assert.match(runtime, /<span>ข้อ <span className="text-lg font-bold text-\[#D4AF37\]">\{currentIndex \+ 1\}<\/span> \/ \{questions\.length\}<\/span>/)
})

test('mobile header removes its duplicate counter and keeps compact title spacing', () => {
  const header = runtime.match(/\{\/\* Header \*\/\}([\s\S]*?)<div id="exam-question-content"/)?.[1]

  assert.ok(header, 'expected the Exam Focus header block')
  assert.doesNotMatch(header, /ข้อ \{currentIndex \+ 1\} \/ \{questions\.length\}/)
  assert.doesNotMatch(header, /aria-controls="question-navigator-dialog"/)
  assert.match(header, /flex min-w-0 flex-1 items-center gap-2 sm:gap-4/)
  assert.match(header, /truncate text-\[10px\]/)
  assert.match(header, /flex shrink-0 items-center gap-2 sm:gap-3/)
})

test('mobile bottom counter remains the navigator entry point', () => {
  assert.match(runtime, /onClick=\{openNavigator\}[\s\S]*?aria-label=\{`ข้อ \$\{currentIndex \+ 1\} \/ \$\{questions\.length\} เปิดตัวนำทางข้อสอบ`\}[\s\S]*?exam-mobile-bottom-bar__action--counter/)
  assert.match(runtime, /<span>ข้อ \{currentIndex \+ 1\}\/\{questions\.length\}<\/span>/)
})

test('mobile palette submit reuses the runtime submit flow and desktop availability rule', () => {
  const paletteSubmit = runtime.match(/const handleRequestSubmitFromNavigator = \(\) => \{([\s\S]*?)\n  \}/)?.[1]

  assert.ok(paletteSubmit, 'expected a palette submit transition handler')
  assert.match(paletteSubmit, /setIsNavigatorOpen\(false\)/)
  assert.match(paletteSubmit, /handleRequestSubmit\(\)/)
  assert.match(runtime, /const canRequestSubmit = status === 'IN_PROGRESS'/)
  assert.match(runtime, /\{canRequestSubmit && \(/)
  assert.match(runtime, /canRequestSubmit=\{canRequestSubmit\}/)
  assert.match(runtime, /onRequestSubmit=\{handleRequestSubmitFromNavigator\}/)
  assert.match(navigator, /canRequestSubmit\?: boolean/)
  assert.match(navigator, /onRequestSubmit\?: \(\) => void/)
  assert.match(navigator, /\{canRequestSubmit && onRequestSubmit && \(/)
  assert.match(navigator, /onClick=\{onRequestSubmit\}/)
  assert.match(navigator, /sm:hidden/)
  assert.match(navigator, />\s*ส่งข้อสอบ\s*<\/button>/)
})

test('Mock auto-advance is single-shot, source-index guarded, and cancellable', () => {
  assert.match(runtime, /resolveMockAutoAdvanceTarget\(/)
  assert.match(runtime, /hasPendingTimer: mockAutoAdvanceTimerRef\.current !== null/)
  assert.match(runtime, /currentIndex: currentIndexRef\.current/)
  assert.match(runtime, /sourceIndex,/)
  assert.match(runtime, /setCurrentIndex\(guardedTarget\)/)
  assert.match(runtime, /const clearMockAutoAdvance = useCallback/)
  assert.match(runtime, /clearMockAutoAdvance\(\)/)
  assert.match(runtime, /if \(status !== 'IN_PROGRESS'\) clearMockAutoAdvance\(\)/)
  assert.doesNotMatch(runtime, /setTimeout\(\(\) => moveRelative\(1/)
})

test('question movement has one path and scrolls to the question content start', () => {
  assert.match(runtime, /const moveToQuestion = useCallback/)
  assert.match(runtime, /const moveRelative = useCallback/)
  assert.match(runtime, /scrollIntoView\(\{\s*behavior: 'smooth',\s*block: 'start'/)
  assert.match(runtime, /onSelectQuestion=\{handleSelectQuestionFromNavigator\}/)
  assert.match(navigator, /onClick=\{\(\) => onSelectQuestion\(index\)\}/)
  assert.match(runtime, /id="exam-question-content"/)
})

test('QuestionNavigator is treated as an isolated accessible dialog', () => {
  assert.match(runtime, /createPortal\(/)
  assert.match(runtime, /aria-controls="question-navigator-dialog"/)
  assert.match(runtime, /aria-expanded=\{isNavigatorOpen\}/)
  assert.match(runtime, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(runtime, /child\.setAttribute\('inert', ''\)/)
  assert.match(runtime, /if \(event\.key === 'Escape'\)/)
  assert.match(runtime, /event\.key !== 'Tab'/)
  assert.match(runtime, /navigatorTriggerRef\.current\?\.focus\(\)/)
  assert.match(runtime, /onClick=\{closeNavigator\}/)
  assert.match(runtime, /onClose=\{closeNavigator\}/)
})

test('Focus Mode is server-marked and hides only mobile global chrome', () => {
  assert.match(examPage, /<ExamFocusModeShell>/)
  assert.match(examPage, /<ExamRuntime/)
  assert.match(navbar, /data-site-navbar="true"/)
  assert.match(footer, /data-site-footer="true"/)
  assert.match(globals, /body:has\(\[data-exam-focus-mode="true"\]\) \[data-site-navbar\]/)
  assert.match(globals, /@media \(max-width: 1023px\)/)
  assert.match(globals, /@media \(min-width: 1024px\)/)
  assert.match(globals, /\.exam-focus-runtime \[data-exam-focus-header="true"\]\s*\{\s*padding-top: env\(safe-area-inset-top, 0px\);/)
})

test('feedback is consolidated and never renders a correct choice as a wrong reason', () => {
  assert.match(runtime, /const renderExplanationFeedback = \(\) => \{/)
  assert.match(runtime, /filter\(\(letter\) => letter !== q\.correct_answer\)/)
  assert.match(runtime, /คำตอบที่ถูกต้อง/)
  assert.match(runtime, /เหตุผลตัวเลือกอื่น/)
  assert.match(runtime, /q\.reference/)
  assert.doesNotMatch(runtime, /Explanation specifically for this choice/)
  assert.doesNotMatch(runtime, /ตอบถูกต้อง!\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  assert.doesNotMatch(runtime, /ตอบผิด\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  assert.doesNotMatch(runtime, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})
