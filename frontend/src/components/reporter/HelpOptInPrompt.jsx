import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { usePushSubscription } from '../../hooks/usePushSubscription'
import { getOrCreateDeviceId } from '../../hooks/useDeviceId'
import { updatePublicLocation } from '../../utils/api'
import { getHelpOptInChoice, setHelpOptInChoice } from '../../utils/helpOptIn'

const LUCKNOW_FALLBACK = { lat: 26.8467, lng: 80.9462 }

export default function HelpOptInPrompt() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const push = usePushSubscription()

  useEffect(() => {
    if (!getHelpOptInChoice()) {
      setVisible(true)
    }
  }, [])

  const dismiss = (choice) => {
    setHelpOptInChoice(choice)
    setVisible(false)
  }

  const handleAccept = async () => {
    setBusy(true)
    setError('')

    const { subscription, error: subscribeError } = await push.subscribe()
    if (!subscription) {
      setBusy(false)
      setError(subscribeError || 'Could not enable alerts on this device.')
      return
    }

    const deviceId = getOrCreateDeviceId()

    const getPosition = () =>
      new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(LUCKNOW_FALLBACK)
          return
        }
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
          () => resolve(LUCKNOW_FALLBACK),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })

    const { lat, lng } = await getPosition()

    const { error: reqError } = await updatePublicLocation({
      deviceId,
      lat,
      lng,
      trackingEnabled: true,
      pushSubscription: subscription,
    })

    setBusy(false)

    if (reqError) {
      setError(reqError.message)
      return
    }

    dismiss('accepted')
  }

  if (!visible) return null

  return (
    <div className="help-optin-card">
      <p className="help-optin-title">Get alerted if an animal needs help near you</p>
      <p className="help-optin-body">
        No account needed. You'll only ever see a general nearby alert, never exact details, unless you choose to help.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="help-optin-actions">
        <Button variant="primary" onClick={handleAccept} loading={busy} disabled={busy}>
          Turn on alerts
        </Button>
        <Button variant="ghost" onClick={() => dismiss('dismissed')} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  )
}
