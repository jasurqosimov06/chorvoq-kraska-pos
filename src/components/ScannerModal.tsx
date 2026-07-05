import { useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Modal } from './Modal'

export function ScannerModal({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let active = true
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && active) {
          active = false
          onDetected(result.getText())
          controlsRef.current?.stop()
        }
      })
      .then((controls) => {
        controlsRef.current = controls
      })
      .catch(() => {})
    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, [onDetected])

  return (
    <Modal title="Shtrix-kodni skanerlash" onClose={onClose}>
      <div className="scanner">
        <video ref={videoRef} />
        <div className="scan-hint">Shtrix-kodni kamera oldiga tuting. Avtomatik o'qiladi.</div>
      </div>
    </Modal>
  )
}
