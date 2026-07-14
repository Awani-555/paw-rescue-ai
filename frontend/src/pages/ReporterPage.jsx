import { useState } from 'react'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import CameraCapture from '../components/reporter/CameraCapture'
import LocationDetector from '../components/reporter/LocationDetector'
import FirstAidCard from '../components/reporter/FirstAidCard'
import FacilityCard from '../components/reporter/FacilityCard'
import SOSButton from '../components/reporter/SOSButton'
import { useCamera } from '../hooks/useCamera'
import { useGeolocation } from '../hooks/useGeolocation'
import { useOffline } from '../hooks/useOffline'
import { submitReport } from '../utils/api'

const STEPS = { LANDING: 'landing', CAPTURE: 'capture', CONFIRM: 'confirm', DISPATCHED: 'dispatched' }

export default function ReporterPage({ onOpenFirstAidLibrary }) {
  const [step, setStep] = useState(STEPS.LANDING)
  const [notes, setNotes] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [aiFallback, setAiFallback] = useState(false)

  const camera = useCamera()
  const geo = useGeolocation()
  const { isOnline } = useOffline()

  const startReport = () => setStep(STEPS.CAPTURE)

  const handlePhotoTaken = async () => {
    if (!camera.image) return
    setStep(STEPS.CONFIRM)
    setAnalyzing(true)
    setSubmitError('')
    setAiFallback(false)

    const base64 = camera.image.split(',')[1]
    const { data, error, aiFallback: fellBack } = await submitReport({
      image: base64,
      notes,
      location: manualLocation || 'Location detected via GPS',
      lat: geo.lat,
      lng: geo.lng,
    })

    setAnalyzing(false)

    if (error) {
      setSubmitError(error.message)
      return
    }

    setAiFallback(Boolean(fellBack))
    setResult(data.result)
  }

  const handleSubmitReport = () => {
    setStep(STEPS.DISPATCHED)
  }

  const handleRetake = () => {
    camera.clear()
    setResult(null)
    setSubmitError('')
    setStep(STEPS.CAPTURE)
  }

  const scrollToFacilities = () => {
    document.getElementById('facilities-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="page-container">
      {!isOnline && <div className="offline-banner">You're offline. Some features may be limited.</div>}

      {step === STEPS.LANDING && (
        <div className="landing-hero">
          <h1>Every life counts.</h1>
          <p>Found an injured animal? We'll help you help them.</p>
          <div className="landing-actions">
            <Button variant="primary" size="large" onClick={startReport}>
              Report Injured Animal →
            </Button>
            <Button variant="ghost" onClick={onOpenFirstAidLibrary}>
              Browse First Aid Guide
            </Button>
          </div>
        </div>
      )}

      {step === STEPS.CAPTURE && (
        <>
          <div className="step-header">
            <button className="step-back" onClick={() => setStep(STEPS.LANDING)}>
              ←
            </button>
            <div className="step-title">
              <h2>Take a photo</h2>
              <p>A clear photo helps identify the animal and injuries</p>
            </div>
          </div>

          <CameraCapture camera={camera} />
          <LocationDetector geo={geo} onManualLocation={setManualLocation} />

          {camera.image && (
            <Button variant="primary" size="large" className="btn-full" onClick={handlePhotoTaken} style={{ marginTop: 'var(--space-6)' }}>
              Continue
            </Button>
          )}
        </>
      )}

      {step === STEPS.CONFIRM && (
        <>
          <div className="step-header">
            <button className="step-back" onClick={handleRetake}>
              ←
            </button>
            <div className="step-title">
              <h2>Confirm details</h2>
            </div>
          </div>

          {camera.image && (
            <div className="image-preview-wrap">
              <img src={camera.image} alt="Captured animal" loading="lazy" />
            </div>
          )}

          {analyzing && (
            <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
              <Spinner size="lg" />
              <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-muted)' }}>Analysing…</p>
            </div>
          )}

          {submitError && (
            <div className="form-error">{submitError}</div>
          )}

          {!analyzing && result && (
            <>
              {aiFallback && (
                <div className="offline-banner">AI analysis unavailable. Showing general first aid.</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
                <strong>{result.species || 'Unknown species'}</strong>
                <Badge severity={result.severity} />
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  {Math.round((result.confidence || 0) * 100)}% confidence
                </span>
              </div>

              <FirstAidCard steps={result.first_aid} doNot={result.doNot} />

              <textarea
                className="manual-location-input"
                placeholder="Optional: add any observations"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ marginTop: 'var(--space-4)' }}
              />

              <Button variant="primary" size="large" className="btn-full" onClick={handleSubmitReport} style={{ marginTop: 'var(--space-6)' }}>
                Submit Report & Alert Responders
              </Button>
              <Button variant="ghost" className="btn-full" onClick={handleRetake}>
                Retake Photo
              </Button>
            </>
          )}
        </>
      )}

      {step === STEPS.DISPATCHED && (
        <>
          <div className="dispatched-header">
            <h2>Help is on the way</h2>
            <p>We've alerted rescue teams in your area</p>
          </div>

          <div id="facilities-section">
            {(result?.nearestFacilities || []).map((facility, idx) => (
              <FacilityCard key={idx} facility={facility} userLocation={{ lat: geo.lat, lng: geo.lng }} />
            ))}
          </div>

          <div className="while-you-wait">
            <h3 style={{ marginBottom: 'var(--space-3)' }}>While you wait:</h3>
            <FirstAidCard steps={result?.first_aid} doNot={result?.doNot} />
          </div>
        </>
      )}

      <SOSButton onShowNearestFacility={scrollToFacilities} />
    </div>
  )
}
