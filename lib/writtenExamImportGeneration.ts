export type WrittenExamImportOperation = 'parse' | 'save' | 'publish' | 'archive' | null

export type WrittenExamImportControllerSnapshot = Readonly<{
  generation: number
  operation: WrittenExamImportOperation
}>

export type WrittenExamImportController = {
  snapshot: () => WrittenExamImportControllerSnapshot
  reset: () => WrittenExamImportControllerSnapshot
  beginParse: () => number
  beginSave: () => number
  beginPublish: () => number
  beginArchive: () => number
  applyIfCurrent: (requestGeneration: number, apply: () => void) => boolean
  finish: (requestGeneration: number) => boolean
}

export type WrittenExamGuardedOperationHandlers<Result> = {
  onSuccess: (result: Result) => void
  onError: (error: unknown) => void
  onFinish: () => void
}

export function createWrittenExamImportController(): WrittenExamImportController {
  let generation = 0
  let operation: WrittenExamImportOperation = null

  const snapshot = (): WrittenExamImportControllerSnapshot => ({ generation, operation })

  return {
    snapshot,
    reset: () => {
      generation += 1
      operation = null
      return snapshot()
    },
    beginParse: () => {
      generation += 1
      operation = 'parse'
      return generation
    },
    beginSave: () => {
      operation = 'save'
      return generation
    },
    beginPublish: () => {
      operation = 'publish'
      return generation
    },
    beginArchive: () => {
      operation = 'archive'
      return generation
    },
    applyIfCurrent: (requestGeneration, apply) => {
      if (generation !== requestGeneration) return false

      apply()
      return true
    },
    finish: (requestGeneration) => {
      if (generation !== requestGeneration) return false

      operation = null
      return true
    },
  }
}

export async function runGenerationGuardedOperation<Result>(
  controller: WrittenExamImportController,
  requestGeneration: number,
  operation: () => Promise<Result>,
  handlers: WrittenExamGuardedOperationHandlers<Result>,
): Promise<void> {
  try {
    const result = await operation()
    controller.applyIfCurrent(requestGeneration, () => {
      handlers.onSuccess(result)
    })
  } catch (error) {
    controller.applyIfCurrent(requestGeneration, () => {
      handlers.onError(error)
    })
  } finally {
    if (controller.finish(requestGeneration)) handlers.onFinish()
  }
}
