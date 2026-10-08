import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * app/exams/exams-analytics-merge.ui-contract.test.ts
 *
 * Learning Analytics UX V1 (MERGE) — /exams is the single Learning Home.
 * Pins the four merge capabilities + the deferred boundaries:
 *  A. subject insight derivation exists as a PURE layer reusing the shared
 *     validator, with the exact gating/ranking constants
 *  B. the /exams "วิชา" section renders between weak topics and My Packages,
 *     gated on completed attempts, with a muted note when eligible-but-empty
 *  C. SubjectPerformance renders tokenized rows with a visible accuracy
 *     number (color is never the only signal), semantic list, no links
 *  D. the two GTM events exist with consent-gated wiring and NO other new
 *     events (no resume-click, no impressions)
 *  E. the redirect stub + actions.ts dependency contract
 *  F. style discipline: no raw hex/rgba literals in any touched/new file
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const learnerAnalytics = read('lib/assessment/learner-analytics.ts')
const examsPage = read('app/exams/page.tsx')
const subjectPerformance = read('components/exams/SubjectPerformance.tsx')
const analyticsLib = read('lib/analytics.ts')
const trackedLink = read('components/exams/TrackedLink.tsx')
const weakTopics = read('components/exams/WeakTopics.tsx')
const attemptPage = read('app/exams/attempts/[attemptId]/page.tsx')
const redirectStub = read('app/assessment/analytics/page.tsx')
const actions = read('app/assessment/actions.ts')
const continueCard = read('components/exams/ContinueLearningCard.tsx')

test('A: subject derivation is pure, shared-validator, with the exact contract', () => {
  assert.match(learnerAnalytics, /export interface SubjectPerformanceGroup/)
  assert.match(learnerAnalytics, /export const SUBJECT_MIN_ENCOUNTERS = 3/)
  // Reuses the shared persisted-contract validator — no second validator.
  assert.match(learnerAnalytics, /export function deriveSubjectPerformance\([\s\S]*?\{[\s\S]*?validateAnswerSummary\(attempt\.answerSummary\)/)
  // Subject-only grouping (no topic>law>subject priority on this rollup).
  const fn = learnerAnalytics.match(/export function deriveSubjectPerformance\([\s\S]*?\n\}/)?.[0] ?? ''
  assert.doesNotMatch(fn, /topic>law>subject|resolveGroupLabel/)
  assert.match(fn, /e\.subject\?\.trim\(\)/)
  // Eligibility + ranking + cap.
  assert.match(fn, /acc\.total < SUBJECT_MIN_ENCOUNTERS/)
  assert.match(fn, /acc\.incorrect === 0 && acc\.unanswered === 0/)
  assert.match(fn, /localeCompare\(b\.label, 'th', \{ numeric: true, sensitivity: 'base' \}\)/)
  assert.match(learnerAnalytics, /SUBJECT_PERFORMANCE_MAX_RESULTS = 4/)
  // Zero new queries: the derivation is registered inside the pure payload.
  assert.match(learnerAnalytics, /subjectPerformance: deriveSubjectPerformance\(attempts\)/)
  assert.match(learnerAnalytics, /subjectPerformance: \[\]/)
})

test('B: /exams renders the วิชา section between weak topics and My Packages', () => {
  assert.match(examsPage, /<SectionTitle>วิชา<\/SectionTitle>/)
  assert.match(examsPage, /<SubjectPerformance subjectPerformance=\{learnerAnalytics\.subjectPerformance\} \/>/)
  // Gated on completed attempts; eligible-but-empty shows the muted note.
  assert.match(examsPage, /hasCompletedAttempts && \([\s\S]*?<SectionTitle>วิชา<\/SectionTitle>/)
  assert.match(examsPage, /ยังไม่มีข้อมูลรายวิชาที่เพียงพอ/)
  assert.match(examsPage, /text-sm text-muted-foreground">ยังไม่มีข้อมูลรายวิชาที่เพียงพอ</)
  // Section order: weak topics → วิชา → My Packages.
  const weakIdx = examsPage.indexOf('หัวข้อที่ควรทบทวน</SectionTitle>')
  const subjectIdx = examsPage.indexOf('<SectionTitle>วิชา</SectionTitle>')
  const packagesIdx = examsPage.indexOf('<SectionTitle>แพ็กเกจของฉัน</SectionTitle>')
  assert.ok(weakIdx !== -1 && subjectIdx !== -1 && packagesIdx !== -1)
  assert.ok(weakIdx < subjectIdx && subjectIdx < packagesIdx)
})

test('C: SubjectPerformance rows are tokenized, accessible, number-first, link-free', () => {
  assert.match(subjectPerformance, /aria-label="ผลการเรียนแยกตามรายวิชา"/)
  assert.match(subjectPerformance, /<ul/)
  assert.match(subjectPerformance, /<li/)
  assert.match(subjectPerformance, /border-border-subtle bg-card rounded-xl px-4 py-3/)
  assert.match(subjectPerformance, /text-foreground text-sm font-medium/)
  assert.match(subjectPerformance, /ถูก \{s\.correct\}\/\{s\.total\}/)
  // Visible accuracy text — color is never the only signal.
  assert.match(subjectPerformance, /\{s\.accuracy\}%/)
  assert.match(subjectPerformance, /text-destructive bg-destructive-bg/)
  assert.match(subjectPerformance, /text-success bg-success-bg/)
  assert.match(subjectPerformance, /text-brand bg-brand-solid\/10/)
  // V1: no links inside rows.
  assert.doesNotMatch(subjectPerformance, /<Link|<a /)
  // Server component: no client directive.
  assert.doesNotMatch(subjectPerformance, /'use client'/)
})

test('D: exactly two new GTM events, consent-gated, wired through TrackedLink', () => {
  assert.match(analyticsLib, /export function trackExamsEvent\(\s*name:\s*'exams_weak_topic_review_click' \| 'exams_insight_cta_click',?\s*\)/)
  assert.match(analyticsLib, /event: name,/)
  // No resume-click / impression events anywhere in the analytics module.
  assert.doesNotMatch(analyticsLib, /exams_resume_click|exams_.*_view|exams_.*_impression/)
  // TrackedLink: client wrapper, fires then navigates (no preventDefault).
  assert.match(trackedLink, /'use client'/)
  assert.match(trackedLink, /onClick=\{\(\) => trackExamsEvent\(eventName\)\}/)
  assert.doesNotMatch(trackedLink, /preventDefault/)
  // Weak Topics review CTA wiring.
  assert.match(weakTopics, /eventName="exams_weak_topic_review_click"/)
  assert.match(weakTopics, /view=incorrect/)
  // Attempt-page insight CTA wiring with the exact approved classes.
  assert.match(attemptPage, /ดูสรุปการเรียนของฉัน/)
  assert.match(attemptPage, /eventName="exams_insight_cta_click"/)
  assert.match(attemptPage, /bg-brand-solid hover:bg-brand-hover text-brand-foreground font-bold text-sm px-5 py-2\.5 rounded-xl transition-colors/)
  // Deferred: ContinueLearningCard keeps zero client JS (server-rendered card).
  assert.doesNotMatch(continueCard, /'use client'/)
  assert.doesNotMatch(continueCard, /trackExamsEvent|TrackedLink/)
})

test('E: redirect stub + actions dependency contract', () => {
  assert.match(redirectStub, /redirect\('\/exams'\)/)
  assert.doesNotMatch(redirectStub, /fetchMyAnalytics|fetchMyRecommendations/)
  assert.match(actions, /export async function fetchMyAnalytics/)
  assert.match(actions, /export async function fetchMyRecommendations/)
})

test('F: no raw hex/rgba literals in touched or new files', () => {
  const files: [string, string][] = [
    ['components/exams/SubjectPerformance.tsx', subjectPerformance],
    ['components/exams/TrackedLink.tsx', trackedLink],
    ['lib/analytics.ts (new block)', analyticsLib.split('trackExamsEvent')[1] ?? ''],
    ['app/assessment/analytics/page.tsx', redirectStub],
  ]
  for (const [name, src] of files) {
    const leftover = src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)
    assert.equal(leftover, null, `${name} must use semantic tokens only; found: ${leftover?.join(', ') ?? 'none'}`)
  }
})
