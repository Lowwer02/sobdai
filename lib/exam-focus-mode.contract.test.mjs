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

test('practice and mock mobile controls preserve the existing runtime gates', () => {
  assert.match(runtime, /const hasCurrentHint = isPractice\s+&& status === 'IN_PROGRESS'\s+&& Boolean\(q && !answers\[q\.id\] && q\.hint\?\.trim\(\)\)/)
  assert.match(runtime, /setRevealedHints\(\(previous\) => \(\{ \.\.\.previous, \[q\.id\]: true \}\)\)/)
  assert.match(runtime, /hasCurrentHint \? \(/)
  assert.match(runtime, /exam-mobile-bottom-bar__spacer/)
  assert.match(runtime, /const isPracticeNextDisabled = isPractice && \(!q \|\| !answers\[q\.id\]\)/)
  assert.match(runtime, /onClick=\{status === 'IN_PROGRESS' && isLastQuestion \? handleRequestSubmit : goNext\}/)
  assert.match(runtime, /setTimeout\(\(\) => moveRelative\(1, \{ bypassPracticeGate: true \}\), 300\)/)
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

test('question movement has one path and scrolls to the question content start', () => {
  assert.match(runtime, /const moveToQuestion = useCallback/)
  assert.match(runtime, /const moveRelative = useCallback/)
  assert.match(runtime, /scrollIntoView\(\{\s*behavior: 'smooth',\s*block: 'start'/)
  assert.match(runtime, /onClick=\{\(\) => moveToQuestion\(i\)\}/)
  assert.match(runtime, /onSelectQuestion=\{handleSelectQuestionFromNavigator\}/)
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
