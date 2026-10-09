export const PROMPTPAY_QR_FILENAME = 'sobdai-promptpay-qr.png'

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
