export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous') // needed to avoid cross-origin issues on CodeSandbox
    image.src = url
  })

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  flip = { horizontal: false, vertical: false }
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  // Set the canvas size to the final 512x512 target resolution
  const targetSize = 512
  canvas.width = targetSize
  canvas.height = targetSize

  // Scale the context to draw the cropped area into the 512x512 canvas
  ctx.scale(targetSize / pixelCrop.width, targetSize / pixelCrop.height)

  ctx.translate(-pixelCrop.x, -pixelCrop.y)

  // Draw the image
  ctx.drawImage(image, 0, 0)

  // As a blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (file) => {
        if (file) resolve(file)
        else reject(new Error('Canvas is empty'))
      },
      'image/webp',
      0.9
    )
  })
}
