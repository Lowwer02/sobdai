import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPromptPayQrFile,
  getPromptPayQrSaveMode,
  initiatePromptPayQrDownload,
  isPromptPayShareCancelled,
  PROMPTPAY_QR_FILENAME,
  PROMPTPAY_QR_DOWNLOAD_URL_LIFETIME_MS,
} from './promptpay-qr-export'

function makePngFile() {
  return createPromptPayQrFile(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
}

test('PNG export keeps the exact server image bytes and uses a privacy-safe filename', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3])
  const file = createPromptPayQrFile(new Blob([bytes], { type: 'image/png' }))

  assert.equal(file.name, 'sobdai-promptpay-qr.png')
  assert.equal(file.name, PROMPTPAY_QR_FILENAME)
  assert.equal(file.type, 'image/png')
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes)
  assert.doesNotMatch(file.name, /email|user|order|phone|recipient|uuid/i)
})

test('PNG export rejects empty or non-PNG responses', () => {
  assert.throws(() => createPromptPayQrFile(new Blob([], { type: 'image/png' })))
  assert.throws(() => createPromptPayQrFile(new Blob(['not a PNG'], { type: 'image/jpeg' })))
})

test('file sharing is selected only when the browser confirms file support', () => {
  const file = makePngFile()
  let sharedFiles: File[] = []
  const canShareFiles = {
    share: async () => undefined,
    canShare: (data?: ShareData) => {
      sharedFiles = data?.files || []
      return true
    },
  }

  assert.equal(getPromptPayQrSaveMode(canShareFiles, file, false), 'share')
  assert.deepEqual(sharedFiles, [file])
})

test('unsupported file sharing falls back to download or preview', () => {
  const file = makePngFile()
  const cannotShareFiles = {
    share: async () => undefined,
    canShare: () => false,
  }

  assert.equal(getPromptPayQrSaveMode(cannotShareFiles, file, true), 'download')
  assert.equal(getPromptPayQrSaveMode(cannotShareFiles, file, false), 'preview')
  assert.equal(getPromptPayQrSaveMode({ share: async () => undefined }, file, true), 'download')
  assert.equal(getPromptPayQrSaveMode({ share: async () => undefined, canShare: () => { throw new Error('blocked') } }, file, true), 'download')
})

test('share cancellation is neutral and is distinguishable from a share failure', () => {
  assert.equal(isPromptPayShareCancelled(new DOMException('Share cancelled', 'AbortError')), true)
  assert.equal(isPromptPayShareCancelled(new Error('Share failed')), false)
})

function makeDownloadHarness(click: () => void) {
  const scheduled: Array<{ callback: () => void; delayMs: number }> = []
  const urlsCreated: Blob[] = []
  const urlsRevoked: string[] = []
  let appended = false
  let removed = false
  const link = {
    href: '',
    download: '',
    hidden: false,
    click,
    remove() { removed = true },
  }
  const documentRef = {
    createElement: () => link,
    body: {
      appendChild() { appended = true },
    },
  }
  const urlApi = {
    createObjectURL(file: Blob) {
      urlsCreated.push(file)
      return 'blob:promptpay-test'
    },
    revokeObjectURL(url: string) { urlsRevoked.push(url) },
  }

  return {
    options: {
      document: documentRef as unknown as Pick<Document, 'createElement' | 'body'>,
      urlApi,
      schedule(callback: () => void, delayMs: number) { scheduled.push({ callback, delayMs }) },
    },
    scheduled,
    urlsCreated,
    urlsRevoked,
    wasAppended: () => appended,
    wasRemoved: () => removed,
    link,
  }
}

test('a silent anchor click keeps the explicit preview available and expires its URL after the browser grace period', () => {
  const file = makePngFile()
  const harness = makeDownloadHarness(() => undefined)

  initiatePromptPayQrDownload(file, harness.options)

  assert.equal(harness.wasAppended(), true)
  assert.equal(harness.wasRemoved(), true)
  assert.equal(harness.link.download, PROMPTPAY_QR_FILENAME)
  assert.equal(harness.urlsCreated[0], file)
  assert.equal(harness.scheduled.length, 1)
  assert.equal(harness.scheduled[0].delayMs, PROMPTPAY_QR_DOWNLOAD_URL_LIFETIME_MS)
  assert.deepEqual(harness.urlsRevoked, [])
  harness.scheduled[0].callback()
  assert.deepEqual(harness.urlsRevoked, ['blob:promptpay-test'])
})

test('anchor click exceptions still remove the anchor and schedule bounded URL cleanup', () => {
  const harness = makeDownloadHarness(() => { throw new Error('click failed') })

  assert.throws(() => initiatePromptPayQrDownload(makePngFile(), harness.options), /click failed/)
  assert.equal(harness.wasAppended(), true)
  assert.equal(harness.wasRemoved(), true)
  assert.equal(harness.scheduled.length, 1)
  assert.deepEqual(harness.urlsRevoked, [])
  harness.scheduled[0].callback()
  assert.deepEqual(harness.urlsRevoked, ['blob:promptpay-test'])
})
