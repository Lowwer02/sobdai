import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { createWrittenExamImportController, runGenerationGuardedOperation } from './writtenExamImportGeneration.ts'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function runStaleSaveScenario(outcome: 'success' | 'error') {
  const controller = createWrittenExamImportController()
  const state = {
    activeFile: 'written-exam-a.md',
    previewStatus: 'success' as 'success' | 'parsing' | 'empty',
    saveResult: null as 'success' | 'error' | null,
    operation: controller.snapshot().operation,
  }

  const saveAGeneration = controller.beginSave()
  state.operation = controller.snapshot().operation

  controller.reset()
  state.activeFile = ''
  state.previewStatus = 'empty'
  state.operation = controller.snapshot().operation

  const parseBGeneration = controller.beginParse()
  state.activeFile = 'written-exam-b.md'
  state.previewStatus = 'parsing'
  state.operation = controller.snapshot().operation
  assert.equal(controller.finish(parseBGeneration), true)
  state.previewStatus = 'success'
  state.operation = controller.snapshot().operation

  const saveBGeneration = controller.beginSave()
  state.operation = controller.snapshot().operation
  assert.notEqual(saveAGeneration, saveBGeneration)

  const saveA = deferred<'success'>()
  const saveARequest = runGenerationGuardedOperation(
    controller,
    saveAGeneration,
    () => saveA.promise,
    {
      onSuccess: (result) => {
        state.saveResult = result
      },
      onError: () => {
        state.saveResult = 'error'
      },
      onFinish: () => {
        state.operation = controller.snapshot().operation
      },
    },
  )

  if (outcome === 'success') {
    saveA.resolve('success')
  } else {
    saveA.reject(new Error('Save A failed'))
  }
  await saveARequest

  assert.equal(state.activeFile, 'written-exam-b.md')
  assert.equal(state.previewStatus, 'success')
  assert.equal(state.saveResult, null)
  assert.equal(state.operation, 'save')
}

test('deferred stale Save Draft success is ignored and cannot clear newer state', async () => {
  await runStaleSaveScenario('success')
})

test('deferred stale Save Draft error is ignored and cannot clear newer state', async () => {
  await runStaleSaveScenario('error')
})

test('ImportClient uses the shared guarded orchestration for parse and save', () => {
  const clientSource = readFileSync(
    join(process.cwd(), 'app/admin/written-exams/import/ImportClient.tsx'),
    'utf8',
  )

  assert.equal(clientSource.match(/runGenerationGuardedOperation\(/g)?.length, 2)
  assert.match(
    clientSource,
    /runGenerationGuardedOperation\(\s*controller,\s*requestGeneration,\s*\(\) => saveWrittenExamDraft\(formData\)/,
  )
})

test('current deferred Save Draft result applies and finally clears its operation', async () => {
  const controller = createWrittenExamImportController()
  const state = { saveResult: null as 'success' | null, operation: controller.snapshot().operation }
  const saveGeneration = controller.beginSave()
  state.operation = controller.snapshot().operation
  const save = deferred<'success'>()

  const saveRequest = runGenerationGuardedOperation(
    controller,
    saveGeneration,
    () => save.promise,
    {
      onSuccess: (result) => {
        state.saveResult = result
      },
      onError: () => {
        throw new Error('Unexpected Save Draft rejection')
      },
      onFinish: () => {
        state.operation = controller.snapshot().operation
      },
    },
  )

  save.resolve('success')
  await saveRequest

  assert.equal(state.saveResult, 'success')
  assert.equal(state.operation, null)
})
