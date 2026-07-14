import { useState } from 'react'

export default function LocationDetector({ geo, onManualLocation }) {
  const [manualInput, setManualInput] = useState('')
  const { loading, error, status } = geo

  if (loading) {
    return <p className="location-status-line">📍 Getting your location…</p>
  }

  if (status === 'denied') {
    return (
      <div>
        <p className="location-status-line denied">📍 {error}</p>
        <input
          type="text"
          className="manual-location-input"
          placeholder="Enter address or landmark manually"
          value={manualInput}
          onChange={(e) => {
            setManualInput(e.target.value)
            onManualLocation?.(e.target.value)
          }}
        />
      </div>
    )
  }

  if (status === 'fallback') {
    return <p className="location-status-line">📍 {error}</p>
  }

  return <p className="location-status-line granted">📍 Location captured</p>
}
