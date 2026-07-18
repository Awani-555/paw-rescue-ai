import { useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import BackButton from '../components/ui/BackButton'
import MotifIcon from '../components/ui/MotifIcon'
import { WifiOffIcon, ArrowRightIcon } from '../components/ui/Icon'
import CameraCapture from '../components/reporter/CameraCapture'
import LocationDetector from '../components/reporter/LocationDetector'
import FirstAidCard from '../components/reporter/FirstAidCard'
import FacilityCard from '../components/reporter/FacilityCard'
import SOSButton from '../components/reporter/SOSButton'
import HelpOptInPrompt from '../components/reporter/HelpOptInPrompt'
import CallHelperButton from '../components/reporter/CallHelperButton'
import { useCamera } from '../hooks/useCamera'
import { useGeolocation } from '../hooks/useGeolocation'
import { useOffline } from '../hooks/useOffline'
import { submitReport, getReports, getCaseHelpers } from '../utils/api'
import logoUrl from '../assets/logo.png'
import heroUrl from '../assets/hero.png'

const HELPER_POLL_MS = 20000

const STEPS = { LANDING: 'landing', CAPTURE: 'capture', CONFIRM: 'confirm', DISPATCHED: 'dispatched' }

const SEVERITY_OPTIONS = ['Critical', 'Urgent', 'Mild']

// Mirrors ai-service/main.py's first_aid_for() static content. When the
// reporter overrides the AI-detected severity below, the first aid steps
// shown need to match the chosen severity rather than the original one;
// there is no backend endpoint to re-run that logic, so the same static
// content is kept in sync here.
const GENERIC_FIRST_AID = {
  Critical: [
    'Call emergency veterinary service immediately',
    'Do not move the animal unless it is in immediate danger',
    'Keep the animal calm and warm',
    'Monitor breathing and consciousness',
    'Avoid feeding or giving water',
  ],
  Urgent: [
    'Contact a veterinarian as soon as possible',
    'Gently place the animal in a safe, warm location',
    'Provide water if the animal is conscious',
    'Cover any visible wounds with a clean cloth',
    'Minimize handling to reduce stress',
  ],
  Mild: [
    'Keep the animal in a safe, comfortable location',
    'Offer water and food if appropriate',
    'Monitor for any signs of distress',
    'Schedule a veterinary check-up',
    'Take photos for record-keeping',
  ],
}

export default function ReporterPage({ onOpenFirstAidLibrary }) {
  const [step, setStep] = useState(STEPS.LANDING)
  const [notes, setNotes] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [aiFallback, setAiFallback] = useState(false)
  const [locationUncertain, setLocationUncertain] = useState(false)
  const [overrideSeverity, setOverrideSeverity] = useState(null)
  const [activeCaseCount, setActiveCaseCount] = useState(0)
  const [reportId, setReportId] = useState(null)
  const [helpers, setHelpers] = useState([])
  const caseId = reportId ? `case_${reportId}` : null

  const camera = useCamera()
  const geo = useGeolocation()
  const { isOnline } = useOffline()

  useEffect(() => {
    getReports().then(({ data }) => {
      setActiveCaseCount(data?.reports?.length || 0)
    })
  }, [])

  const startReport = () => setStep(STEPS.CAPTURE)

  const handlePhotoTaken = async () => {
    if (!camera.image) return
    setStep(STEPS.CONFIRM)
    setAnalyzing(true)
    setSubmitError('')
    setAiFallback(false)
    setLocationUncertain(false)
    setOverrideSeverity(null)

    const base64 = camera.image.split(',')[1]
    // geo.status === 'granted' is the only case where lat/lng are the
    // device's real coordinates; 'denied'/'fallback'/'requesting' all mean
    // geo.lat/lng are the hardcoded city-center default (see useGeolocation),
    // which the backend must not use to fan out nearby-volunteer alerts -
    // that would notify people near a city the animal may not even be in.
    const {
      data,
      error,
      aiFallback: fellBack,
    } = await submitReport({
      image: base64,
      notes,
      location: manualLocation || 'Location detected via GPS',
      lat: geo.lat,
      lng: geo.lng,
      locationSource: geo.status === 'granted' ? 'gps' : 'fallback',
    })

    setAnalyzing(false)

    if (error) {
      setSubmitError(error.message)
      return
    }

    setAiFallback(Boolean(fellBack))
    setLocationUncertain(Boolean(data.nearbyAlertsSkipped))
    setResult(data.result)
    setReportId(data.id)
  }

  // Public (Tier 1) helper offers arrive asynchronously from strangers,
  // there's no realtime channel in this app, so the dispatched screen
  // polls for them while it's the active step rather than only fetching
  // once on mount.
  useEffect(() => {
    if (step !== STEPS.DISPATCHED || !caseId) return undefined

    const fetchHelpers = () => {
      getCaseHelpers(caseId).then(({ data }) => {
        if (data?.helpers) setHelpers(data.helpers)
      })
    }

    fetchHelpers()
    const interval = setInterval(fetchHelpers, HELPER_POLL_MS)
    return () => clearInterval(interval)
  }, [step, caseId])

  const handleSubmitReport = () => {
    setStep(STEPS.DISPATCHED)
  }

  const handleRetake = () => {
    camera.clear()
    setResult(null)
    setSubmitError('')
    setOverrideSeverity(null)
    setStep(STEPS.CAPTURE)
  }

  const scrollToFacilities = () => {
    document.getElementById('facilities-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  const displaySeverity = overrideSeverity || result?.severity
  const displayFirstAid =
    overrideSeverity && overrideSeverity !== result?.severity ? GENERIC_FIRST_AID[overrideSeverity] : result?.first_aid

  return (
    <div className="page-container">
      {!isOnline && <div className="offline-banner">You're offline. Some features may be limited.</div>}

      {step === STEPS.LANDING && (
        <div key={step} className="landing-page step-transition">
          <div className="landing-topbar">
            <img src={logoUrl} alt="PawRescue AI" className="landing-logo-img" />
          </div>

          <div className="landing-grid">
            <img src={heroUrl} alt="" className="landing-hero-img" />

            <div className="landing-hero-text">
              <h1>Every life counts.</h1>
              <p>Found an injured animal? We'll help you help them.</p>

              <div className="landing-actions">
                <Button variant="primary" onClick={startReport} className="btn-full">
                  Report Injured Animal
                  <ArrowRightIcon width={18} height={18} />
                </Button>
                <Button variant="ghost" onClick={onOpenFirstAidLibrary} className="btn-full">
                  Browse First Aid Guide
                </Button>
              </div>

              {activeCaseCount > 0 && (
                <div className="active-cases-pill">
                  <span className="active-cases-dot" />
                  {activeCaseCount} active case{activeCaseCount === 1 ? '' : 's'} in your area
                </div>
              )}
            </div>
          </div>

          <div className="section-divider">
            <span>How it works</span>
          </div>

          <div className="how-it-works">
            <div className="how-step" style={{ '--stagger': 0 }}>
              <MotifIcon index={0} />
              <div>
                <strong>Take a photo</strong>
                <p>Point your camera at the injured animal</p>
              </div>
            </div>
            <div className="how-step" style={{ '--stagger': 1 }}>
              <MotifIcon index={1} />
              <div>
                <strong>Get instant guidance</strong>
                <p>AI identifies species and suggests first aid</p>
              </div>
            </div>
            <div className="how-step" style={{ '--stagger': 2 }}>
              <MotifIcon index={2} />
              <div>
                <strong>Help is dispatched</strong>
                <p>Nearest rescue teams are alerted immediately</p>
              </div>
            </div>
          </div>

          <div className="offline-callout">
            <WifiOffIcon width={20} height={20} />
            <div>
              <strong>Every second matters</strong>
              <p>The first aid guide works without signal. Tap "Browse First Aid Guide" to save it for offline use.</p>
            </div>
          </div>

          <HelpOptInPrompt />
        </div>
      )}

      {step === STEPS.CAPTURE && (
        <div key={step} className="step-transition">
          <div className="step-header">
            <BackButton onClick={() => setStep(STEPS.LANDING)} />
            <div className="step-title">
              <h2>Take a photo</h2>
              <p>A clear photo helps identify the animal and injuries</p>
            </div>
          </div>

          <CameraCapture camera={camera} />
          <LocationDetector geo={geo} onManualLocation={setManualLocation} />

          {camera.image && (
            <Button
              variant="primary"
              size="large"
              className="btn-full"
              onClick={handlePhotoTaken}
              style={{ marginTop: 'var(--space-6)' }}
            >
              Continue
            </Button>
          )}
        </div>
      )}

      {step === STEPS.CONFIRM && (
        <div key={step} className="step-transition">
          <div className="step-header">
            <BackButton onClick={handleRetake} />
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
              <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-muted)' }}>Analysing...</p>
            </div>
          )}

          {submitError && <div className="form-error">{submitError}</div>}

          {!analyzing && result && (
            <>
              {aiFallback && <div className="offline-banner">AI analysis unavailable. Showing general first aid.</div>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
                <strong>{result.species || 'Unknown species'}</strong>
                <Badge severity={displaySeverity} />
              </div>

              {result.severity_note && <p className="severity-disclaimer">{result.severity_note}</p>}

              <div className="severity-override">
                <p className="severity-override-label">Does this look right?</p>
                <div className="severity-override-row">
                  {SEVERITY_OPTIONS.map((option) => {
                    const token = option.toLowerCase()
                    const selected = displaySeverity === option
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`severity-pill ${selected ? `selected ${token}` : ''}`}
                        onClick={() => setOverrideSeverity(option)}
                      >
                        <span className="badge-dot" style={{ background: `var(--color-${token})` }} />
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>

              <FirstAidCard steps={displayFirstAid} doNot={result.doNot} />

              <textarea
                className="manual-location-input"
                placeholder="Optional: add any observations"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ marginTop: 'var(--space-4)' }}
              />

              <Button
                variant="primary"
                size="large"
                className="btn-full"
                onClick={handleSubmitReport}
                style={{ marginTop: 'var(--space-6)' }}
              >
                Submit Report & Alert Responders
              </Button>
              <Button variant="ghost" className="btn-full" onClick={handleRetake}>
                Retake Photo
              </Button>
            </>
          )}
        </div>
      )}

      {step === STEPS.DISPATCHED && (
        <div key={step} className="step-transition">
          <div className="dispatched-header">
            <h2>Help is on the way</h2>
            <p>We've alerted rescue teams in your area</p>
          </div>

          {locationUncertain && (
            <div className="severity-disclaimer">
              We couldn't get your exact location, so we didn't send nearby-volunteer alerts for this report - they
              would have gone to the wrong area. Your report is still visible to registered responders. If you can,
              retake the report with location access enabled, or contact local rescue services directly.
            </div>
          )}

          <div className="dispatched-photo-row">
            <p style={{ fontWeight: 600 }}>Your report was submitted</p>
            {camera.image && <img src={camera.image} alt="Submitted animal" className="dispatched-photo" />}
            <div className="dispatched-photo-meta">
              <strong>{result?.species || 'Unknown species'}</strong>
              <Badge severity={displaySeverity} />
            </div>
          </div>

          <h3 className="nearest-help-heading">Nearest help:</h3>
          <div id="facilities-section">
            {(result?.nearestFacilities || []).map((facility, idx) => (
              <FacilityCard key={idx} facility={facility} userLocation={{ lat: geo.lat, lng: geo.lng }} index={idx} />
            ))}
          </div>

          {helpers.length > 0 && (
            <div className="public-helpers-section">
              <h3 className="nearest-help-heading">
                {helpers.length} nearby {helpers.length === 1 ? 'person has' : 'people have'} offered to help
              </h3>
              <div className="public-helpers-list">
                {helpers.map((helper) => (
                  <CallHelperButton key={helper.id} caseId={caseId} helperId={helper.id} name={helper.name} />
                ))}
              </div>
            </div>
          )}

          <div className="while-you-wait">
            <h3 style={{ marginBottom: 'var(--space-3)' }}>While you wait:</h3>
            <FirstAidCard steps={displayFirstAid} doNot={result?.doNot} />
          </div>
        </div>
      )}

      <SOSButton onShowNearestFacility={scrollToFacilities} compact={step === STEPS.CONFIRM} />
    </div>
  )
}
