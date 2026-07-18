import { useCallback, useState } from 'react'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Push subscriptions carry a binary applicationServerKey, but VAPID public
// keys are handed out as URL-safe base64. This is the standard conversion.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// status: idle | requesting | granted | denied | unsupported | error
export function usePushSubscription() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  // Returns { subscription, error } rather than relying on callers to read
  // the `error` state back off this hook's return value: a state update
  // scheduled by setError() here doesn't appear on the `push` object a
  // caller already holds a reference to until the *next* render, so
  // reading push.error immediately after awaiting subscribe() would
  // always see the stale (pre-call) value. Returning the message directly
  // sidesteps that entirely.
  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      const message = 'Push notifications are not supported on this browser.'
      setError(message)
      return { subscription: null, error: message }
    }
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error')
      const message = 'Push notifications are not configured for this deployment.'
      setError(message)
      return { subscription: null, error: message }
    }

    setStatus('requesting')

    try {
      // The service worker only registers in production builds (see
      // main.jsx), so in local dev there is nothing to wait on and
      // navigator.serviceWorker.ready would hang forever. Fail fast with
      // a clear message instead.
      const existingRegistration = await navigator.serviceWorker.getRegistration()
      if (!existingRegistration) {
        setStatus('error')
        const message = 'Push notifications need a production build. They are not available in local dev.'
        setError(message)
        return { subscription: null, error: message }
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        const message = 'Notification permission was denied. Enable notifications for this site in your browser settings.'
        setError(message)
        return { subscription: null, error: message }
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      setStatus('granted')
      return { subscription: subscription.toJSON(), error: null }
    } catch {
      setStatus('error')
      const message = 'Could not enable push notifications on this device.'
      setError(message)
      return { subscription: null, error: message }
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()
    setStatus('idle')
  }, [])

  return { status, error, subscribe, unsubscribe }
}
