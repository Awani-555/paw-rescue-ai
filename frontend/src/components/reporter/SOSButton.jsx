import { useState } from 'react'
import { PawIcon } from '../ui/Icon'

const HELPLINE_NUMBER = '+911800200997'
const LUCKNOW_FALLBACK = { lat: 26.8467, lng: 80.9462 }

export default function SOSButton({ onShowNearestFacility, compact = false }) {
  const [open, setOpen] = useState(false)

  const sendWhatsAppLocation = () => {
    const send = (lat, lng) => {
      const message = `ANIMAL EMERGENCY at https://maps.google.com/?q=${lat},${lng}. Please help immediately.`
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => send(position.coords.latitude, position.coords.longitude),
        () => send(LUCKNOW_FALLBACK.lat, LUCKNOW_FALLBACK.lng)
      )
    } else {
      send(LUCKNOW_FALLBACK.lat, LUCKNOW_FALLBACK.lng)
    }
    setOpen(false)
  }

  const handleShowFacility = () => {
    setOpen(false)
    onShowNearestFacility?.()
  }

  return (
    <>
      <button
        className={`sos-fab ${compact ? 'sos-fab-compact' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="SOS: Get help now"
      >
        {compact ? <PawIcon width={22} height={22} /> : 'SOS: Get Help Now'}
      </button>

      {open && (
        <div className="sos-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sos-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>How can we help?</h3>
            <a className="sos-sheet-option" href={`tel:${HELPLINE_NUMBER}`}>
              Call Animal Helpline
            </a>
            <button className="sos-sheet-option" onClick={sendWhatsAppLocation}>
              Send Location via WhatsApp
            </button>
            <button className="sos-sheet-option" onClick={handleShowFacility}>
              Show Nearest Facility
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
