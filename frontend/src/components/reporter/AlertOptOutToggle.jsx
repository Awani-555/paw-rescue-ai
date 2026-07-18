import { useEffect, useState } from 'react'
import { usePushSubscription } from '../../hooks/usePushSubscription'
import { getOrCreateDeviceId } from '../../hooks/useDeviceId'
import { deletePublicLocation } from '../../utils/api'
import { getHelpOptInChoice, setHelpOptInChoice } from '../../utils/helpOptIn'

// Only rendered once the reporter has actually opted in to Tier 1 nearby
// alerts, so the header never shows a toggle for something that isn't on.
export default function AlertOptOutToggle() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const push = usePushSubscription()

  useEffect(() => {
    setEnabled(getHelpOptInChoice() === 'accepted')
  }, [])

  if (!enabled) return null

  const handleDisable = async () => {
    setBusy(true)
    await push.unsubscribe()
    await deletePublicLocation(getOrCreateDeviceId())
    setHelpOptInChoice('dismissed')
    setBusy(false)
    setEnabled(false)
  }

  return (
    <button type="button" onClick={handleDisable} disabled={busy}>
      {busy ? 'Turning off...' : 'Nearby alerts: On (tap to turn off)'}
    </button>
  )
}
