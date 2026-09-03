import type { PublishableAssessmentSet } from './publish-adapter'

export interface PublishApprovedAssessmentInput {
  readonly approval: {
    readonly decision: 'approved'
    readonly executionId: string
  }
  /**
   * Blueprint identity of the approved result. Verified server-side against
   * the Assessment Blueprint registry — never trusted as authority; the
   * authoritative question target is derived from the registered source.
   */
  readonly blueprint: {
    readonly id: string
    readonly version: string
  }
  readonly packageId: string
  readonly baseName: string
  readonly description: string
  readonly durationMinutes: number
  readonly isSample: boolean
  readonly sortOrder: number
  readonly displayOrder: number
  readonly sets: readonly PublishableAssessmentSet[]
}

export interface PublishedExamSet {
  readonly id: string
  readonly name: string
  readonly setNumber: number
  readonly questionCount: number
  readonly status: 'draft' | 'published'
}
