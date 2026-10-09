export const PROMPTPAY_QR_FILENAME = 'sobdai-promptpay-qr.png'
export const PROMPTPAY_QR_DOWNLOAD_URL_LIFETIME_MS = 60_000

export type PromptPayQrShareApi = {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
}

export type PromptPayQrSaveMode = 'share' | 'download' | 'preview'

export function createPromptPayQrFile(blob: Blob): File {
  const contentType = blob.type.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'image/png' || blob.size === 0) {
    throw new Error('PromptPay QR export must be a non-empty PNG.')
  }

  return new File([blob], PROMPTPAY_QR_FILENAME, { type: 'image/png' })
}

export function canSharePromptPayQrFile(
  shareApi: PromptPayQrShareApi,
  file: File,
): boolean {
  if (typeof shareApi.share !== 'function' || typeof shareApi.canShare !== 'function') {
    return false
  }

  try {
    return shareApi.canShare({ files: [file] })
  } catch {
    return false
  }
}

export function getPromptPayQrSaveMode(
  shareApi: PromptPayQrShareApi,
  file: File,
  downloadSupported: boolean,
): PromptPayQrSaveMode {
  if (canSharePromptPayQrFile(shareApi, file)) return 'share'
  return downloadSupported ? 'download' : 'preview'
}

export function isPromptPayShareCancelled(reason: unknown): boolean {
  return Boolean(
    reason
      && typeof reason === 'object'
      && 'name' in reason
      && reason.name === 'AbortError',
  )
}

export interface PromptPayQrDownloadOptions {
  document?: Pick<Document, 'createElement' | 'body'>
  urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  schedule?: (callback: () => void, delayMs: number) => unknown
}

/** Start a browser download without treating a returned click as proof of save. */
export function initiatePromptPayQrDownload(
  file: File,
  options: PromptPayQrDownloadOptions = {},
): void {
  if (file.type !== 'image/png' || file.size === 0) {
    throw new Error('PromptPay QR export must be a non-empty PNG.')
  }

  const documentRef = options.document ?? document
  const urlApi = options.urlApi ?? URL
  const schedule = options.schedule ?? ((callback, delayMs) => window.setTimeout(callback, delayMs))
  const link = documentRef.createElement('a')
  let objectUrl: string | null = null

  try {
    objectUrl = urlApi.createObjectURL(file)
    link.href = objectUrl
    link.download = PROMPTPAY_QR_FILENAME
    link.hidden = true
    documentRef.body.appendChild(link)
    link.click()
  } finally {
    try {
      link.remove()
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl
        schedule(() => urlApi.revokeObjectURL(urlToRevoke), PROMPTPAY_QR_DOWNLOAD_URL_LIFETIME_MS)
      }
    }
  }
}
