// Rasmni kichraytirib, base64 (data URL) ga aylantiradi — baza shishmasligi uchun
export function fileToResizedDataUrl(file: File, max = 420, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Faylni o\'qib bo\'lmadi'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > max) {
          height = Math.round((height * max) / width)
          width = max
        } else if (height > max) {
          width = Math.round((width * max) / height)
          height = max
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('Rasm formati noto\'g\'ri'))
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
