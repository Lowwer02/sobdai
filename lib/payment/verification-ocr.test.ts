import assert from 'node:assert/strict'
import test from 'node:test'
import type Tesseract from 'tesseract.js'
import {
  __resetPaymentOcrForTests,
  __setPaymentOcrTimeoutForTests,
  __setPaymentOcrWorkerForTests,
  __setPaymentOcrWorkerFactoryForTests,
  PAYMENT_ANALYZER_OCR_TIMEOUT_MS,
  PaymentOcrError,
  recognizePaymentSlipText,
} from './verification-ocr'

function fakeWorker(recognize: () => Promise<{ data: { text: string } }>, terminate: () => Promise<void> = async () => {}) {
  return {
    setParameters: async () => {},
    recognize,
    terminate,
  } as unknown as Tesseract.Worker
}

test('concurrent OCR is single-flight and returns OCR_BUSY to the second caller', async () => {
  __resetPaymentOcrForTests()
  const worker = fakeWorker(async () => ({ data: { text: 'first' } }))
  __setPaymentOcrWorkerForTests(worker)

  try {
    const first = recognizePaymentSlipText(Buffer.from('image'))
    await assert.rejects(
      () => recognizePaymentSlipText(Buffer.from('image')),
      (error: unknown) => error instanceof PaymentOcrError && error.reasonCode === 'OCR_BUSY',
    )
    assert.equal(await first, 'first')
  } finally {
    __resetPaymentOcrForTests()
  }
})

test('OCR timeout terminates the worker and a recreated worker can recover', async () => {
  __resetPaymentOcrForTests()
  let terminated = 0
  const timedOutWorker = fakeWorker(() => new Promise(() => {}), async () => { terminated += 1 })
  __setPaymentOcrWorkerForTests(timedOutWorker)
  __setPaymentOcrTimeoutForTests(5)

  try {
    await assert.rejects(
      () => recognizePaymentSlipText(Buffer.from('image')),
      (error: unknown) => error instanceof PaymentOcrError && error.reasonCode === 'OCR_TIMEOUT',
    )
    assert.equal(terminated, 1)

    const recreatedWorker = fakeWorker(async () => ({ data: { text: 'recovered' } }))
    __setPaymentOcrWorkerForTests(recreatedWorker)
    assert.equal(await recognizePaymentSlipText(Buffer.from('image')), 'recovered')
  } finally {
    __resetPaymentOcrForTests()
  }
})

test('initialization timeout clears the underlying promise and quarantines a stale worker generation', async () => {
  __resetPaymentOcrForTests()
  let firstResolve: ((worker: Tesseract.Worker) => void) | null = null
  let factoryCalls = 0
  let terminated = 0
  const staleWorker = fakeWorker(async () => ({ data: { text: 'stale' } }), async () => { terminated += 1 })
  const healthyWorker = fakeWorker(async () => ({ data: { text: 'healthy' } }))
  const resolveStaleWorker = () => {
    const resolver: ((worker: Tesseract.Worker) => void) | null = firstResolve
    if (resolver) resolver(staleWorker)
  }

  __setPaymentOcrWorkerFactoryForTests(() => {
    factoryCalls += 1
    if (factoryCalls === 1) {
      return new Promise<Tesseract.Worker>((resolve) => { firstResolve = resolve })
    }
    return Promise.resolve(healthyWorker)
  })
  __setPaymentOcrTimeoutForTests(5)

  try {
    await assert.rejects(
      () => recognizePaymentSlipText(Buffer.from('image')),
      (error: unknown) => error instanceof PaymentOcrError && error.reasonCode === 'OCR_TIMEOUT',
    )

    // A new invocation must create a new generation even though generation 1
    // is still pending. The stale worker is terminated when it eventually
    // resolves and never becomes the cached active worker.
    assert.equal(await recognizePaymentSlipText(Buffer.from('image')), 'healthy')
    assert.equal(factoryCalls, 2)
    resolveStaleWorker()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(terminated, 1)
    assert.equal(await recognizePaymentSlipText(Buffer.from('image')), 'healthy')
    assert.equal(factoryCalls, 2)
  } finally {
    resolveStaleWorker()
    __resetPaymentOcrForTests()
  }
})

test('OCR retains a bounded production timeout', () => {
  assert.equal(PAYMENT_ANALYZER_OCR_TIMEOUT_MS, 30_000)
})
