/**
 * Foto-Verarbeitung: Kamerabilder/Uploads werden clientseitig auf max. 512px
 * Kantenlänge verkleinert und als JPEG (Qualität 0.82) in IndexedDB gelegt.
 */

const MAX_EDGE = 512
const JPEG_QUALITY = 0.82

export async function downscalePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      i.src = url
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas nicht verfügbar')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('Foto konnte nicht verarbeitet werden')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
