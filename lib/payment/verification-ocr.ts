import { copyFile, mkdir, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Tesseract from 'tesseract.js'
import { extractOcrFields, type OcrExtraction } from './verification-rules'

export const PAYMENT_ANALYZER_OCR_TIMEOUT_MS = 30_000

let workerPromise: Promise<Tesseract.Worker> | null = null
let workerFactoryForTests: (() => Promise<Tesseract.Worker>) | null = null
let recognitionInFlight = false
let ocrTimeoutMs = PAYMENT_ANALYZER_OCR_TIMEOUT_MS

export class PaymentOcrError extends Error {
  readonly reasonCode: string

  constructor(reasonCode: string) {
    super(reasonCode)
    this.name = 'PaymentOcrError'
    this.reasonCode = reasonCode
  }
}

function withOcrTimeout<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new PaymentOcrError('OCR_TIMEOUT')), ocrTimeoutMs)
    task.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

const TESSDATA_FAST_ROOT = join(process.cwd(), 'vendor', 'tessdata_fast', '4.0.0')
const TESSERACT_CORE_ROOT = join(process.cwd(), 'node_modules', 'tesseract.js-core')
const TESSERACT_WORKER_PATH = join(process.cwd(), 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')

function bundledDataFile(fileName: string): string {
  // Keep the official 4.0.0_fast archives as runtime files. Importing a `.gz`
  // subpath directly makes Turbopack treat it as an unknown JavaScript module;
  // next.config.ts adds both archives to outputFileTracingIncludes instead.
  return join(TESSDATA_FAST_ROOT, fileName)
}

async function ensureBundledLanguageDirectory(): Promise<string> {
  const directory = join(tmpdir(), 'sobdai-payment-tessdata-m13a-fast-v1')
  await mkdir(directory, { recursive: true })
  const files = [
    [bundledDataFile('tha.traineddata.gz'), join(directory, 'tha.traineddata.gz')],
    [bundledDataFile('eng.traineddata.gz'), join(directory, 'eng.traineddata.gz')],
  ] as const

  await Promise.all(files.map(async ([source, target]) => {
    try {
      await access(target, fsConstants.R_OK)
    } catch {
      await mkdir(dirname(target), { recursive: true })
      await copyFile(source, target)
    }
  }))

  return directory
}

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    const underlyingWorkerPromise = workerFactoryForTests
      ? workerFactoryForTests()
      : ensureBundledLanguageDirectory().then((langPath) => Tesseract.createWorker('tha+eng', Tesseract.OEM.LSTM_ONLY, {
        corePath: TESSERACT_CORE_ROOT,
        langPath,
        workerPath: TESSERACT_WORKER_PATH,
        cacheMethod: 'none',
        gzip: true,
        workerBlobURL: false,
        logger: () => {},
      }))

    // Keep the exact underlying initialization promise. If a timeout clears
    // this slot, a late first-generation worker cannot reinstall itself.
    workerPromise = underlyingWorkerPromise
    void underlyingWorkerPromise.catch(() => {
      if (workerPromise === underlyingWorkerPromise) workerPromise = null
    })
  }

  return workerPromise
}

export async function recognizePaymentSlipText(image: Buffer): Promise<string> {
  if (recognitionInFlight) throw new PaymentOcrError('OCR_BUSY')
  recognitionInFlight = true

  const workerTask = getWorker()
  let worker: Tesseract.Worker
  try {
    worker = await withOcrTimeout(workerTask)
  } catch (error) {
    if (error instanceof PaymentOcrError && error.reasonCode === 'OCR_TIMEOUT') {
      if (workerPromise === workerTask) workerPromise = null
      void workerTask.then((lateWorker) => lateWorker.terminate()).catch(() => undefined)
    }
    recognitionInFlight = false
    throw error
  }

  try {
    return await withOcrTimeout((async () => {
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      })
      const result = await worker.recognize(image, {}, { text: true })
      return result.data.text || ''
    })())
  } catch (error) {
    if (error instanceof PaymentOcrError && error.reasonCode === 'OCR_TIMEOUT') {
      workerPromise = null
      void worker.terminate().catch(() => undefined)
    }
    throw error
  } finally {
    recognitionInFlight = false
  }
}

export async function extractPaymentSlipText(image: Buffer, expectedRecipientName: string): Promise<OcrExtraction> {
  const text = await recognizePaymentSlipText(image)
  return extractOcrFields(text, expectedRecipientName)
}

// Test-only seams keep the production worker fail-closed while allowing
// deterministic coverage of the busy, timeout, and worker-recreation paths.
export function __setPaymentOcrWorkerForTests(worker: Tesseract.Worker | null) {
  workerPromise = worker ? Promise.resolve(worker) : null
}

export function __setPaymentOcrWorkerFactoryForTests(factory: (() => Promise<Tesseract.Worker>) | null) {
  workerFactoryForTests = factory
  workerPromise = null
}

export function __setPaymentOcrTimeoutForTests(timeoutMs: number) {
  ocrTimeoutMs = timeoutMs
}

export function __resetPaymentOcrForTests() {
  workerPromise = null
  workerFactoryForTests = null
  recognitionInFlight = false
  ocrTimeoutMs = PAYMENT_ANALYZER_OCR_TIMEOUT_MS
}
