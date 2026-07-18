import { useCallback, useRef, useState } from 'react'

const MAX_DIMENSION = 1200
const JPEG_QUALITY = 0.85

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width)
          width = MAX_DIMENSION
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height)
          height = MAX_DIMENSION
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not process image'))
              return
            }
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' })
            const previewReader = new FileReader()
            previewReader.onload = () => resolve({ base64: previewReader.result, file: compressedFile })
            previewReader.onerror = reject
            previewReader.readAsDataURL(blob)
          },
          'image/jpeg',
          JPEG_QUALITY
        )
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useCamera() {
  const [image, setImage] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [error, setError] = useState(null)
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    try {
      const { base64, file: compressedFile } = await compressImage(file)
      setImage(base64)
      setImageFile(compressedFile)
    } catch {
      setError('Could not process this image. Please try another.')
    }
  }, [])

  const pickFromCamera = useCallback(() => cameraInputRef.current?.click(), [])
  const pickFromGallery = useCallback(() => galleryInputRef.current?.click(), [])

  const clear = useCallback(() => {
    setImage(null)
    setImageFile(null)
    setError(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }, [])

  return {
    image,
    imageFile,
    error,
    cameraInputRef,
    galleryInputRef,
    handleFile,
    pickFromCamera,
    pickFromGallery,
    clear,
  }
}
