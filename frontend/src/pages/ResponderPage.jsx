import { useCallback, useEffect, useState } from 'react'
import LoginForm from '../components/responder/LoginForm'
import CaseFeed from '../components/responder/CaseFeed'
import CaseMap from '../components/responder/CaseMap'
import Spinner from '../components/ui/Spinner'
import BackButton from '../components/ui/BackButton'
import { getCases, respondToCase, resolveCase, updateRegisteredLocation, clearToken, hasToken } from '../utils/api'
import { useGeolocation } from '../hooks/useGeolocation'
import { usePushSubscription } from '../hooks/usePushSubscription'

export default function ResponderPage({ onBack, highlightCaseId }) {
  const [loggedIn, setLoggedIn] = useState(hasToken())
  const [view, setView] = useState('list')
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [alertsError, setAlertsError] = useState('')

  const geo = useGeolocation()
  const push = usePushSubscription()

  // A push notification click opens the responder view directly (see
  // App.jsx); jump straight to the map view too, since that's the
  // fastest way to see where the highlighted case actually is.
  useEffect(() => {
    if (highlightCaseId) setView('map')
  }, [highlightCaseId])

  const loadCases = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: reqError } = await getCases({ lat: geo.lat, lng: geo.lng })
    setLoading(false)

    if (reqError) {
      setError(reqError.message)
      return
    }
    setCases(data.cases || [])
  }, [geo.lat, geo.lng])

  useEffect(() => {
    if (loggedIn && !geo.loading) {
      loadCases()
    }
  }, [loggedIn, geo.loading, loadCases])

  const handleRespond = async (caseId) => {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, status: 'responding' } : c)))
    await respondToCase(caseId)
  }

  const handleResolve = async (caseId) => {
    // Resolved cases drop out of the active feed server-side, so remove
    // it locally too instead of leaving a stale "resolved" card in the list.
    setCases((prev) => prev.filter((c) => c.id !== caseId))
    await resolveCase(caseId)
  }

  const handleLogout = () => {
    clearToken()
    setLoggedIn(false)
  }

  const handleToggleAlerts = async () => {
    setAlertsError('')

    if (alertsEnabled) {
      await push.unsubscribe()
      await updateRegisteredLocation({ lat: geo.lat, lng: geo.lng, trackingEnabled: false, pushSubscription: null })
      setAlertsEnabled(false)
      return
    }

    const subscription = await push.subscribe()
    if (!subscription) {
      setAlertsError(push.error || 'Could not enable alerts. Check notification permissions for this site.')
      return
    }

    const { error: reqError } = await updateRegisteredLocation({
      lat: geo.lat,
      lng: geo.lng,
      trackingEnabled: true,
      pushSubscription: subscription,
    })

    if (reqError) {
      setAlertsError(reqError.message)
      return
    }

    setAlertsEnabled(true)
  }

  if (!loggedIn) {
    return (
      <div className="page-container">
        <div className="step-header">
          <BackButton onClick={onBack} />
        </div>
        <LoginForm onSuccess={() => setLoggedIn(true)} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="responder-header">
        <h2>Active Cases</h2>
        <div className="view-toggle">
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            List
          </button>
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
            Map
          </button>
        </div>
      </div>

      <div className="alerts-toggle-row">
        <label className="alerts-toggle">
          <input type="checkbox" checked={alertsEnabled} onChange={handleToggleAlerts} />
          <span>Alert me about cases near my location</span>
        </label>
      </div>
      {alertsError && <div className="form-error">{alertsError}</div>}

      <button className="form-toggle-link" style={{ marginBottom: 'var(--space-4)' }} onClick={handleLogout}>
        Log out
      </button>

      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <Spinner size="lg" />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {!loading && !error && view === 'list' && (
        <CaseFeed
          cases={cases}
          onRespond={handleRespond}
          onResolve={handleResolve}
          onViewMap={() => setView('map')}
          highlightCaseId={highlightCaseId}
        />
      )}

      {!loading && !error && view === 'map' && (
        <CaseMap cases={cases} center={{ lat: geo.lat, lng: geo.lng }} />
      )}
    </div>
  )
}
