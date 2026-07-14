import { useCallback, useEffect, useState } from 'react'

const LUCKNOW_FALLBACK = { lat: 26.8467, lng: 80.9462 }
const TIMEOUT_MS = 10000

export function useGeolocation() {
  const [state, setState] = useState({
    lat: null,
    lng: null,
    accuracy: null,
    loading: true,
    error: null,
    status: 'requesting',
  })

  const request = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null, status: 'requesting' }))

    if (!navigator.geolocation) {
      setState({
        ...LUCKNOW_FALLBACK,
        accuracy: null,
        loading: false,
        error: 'Geolocation is not supported on this device.',
        status: 'fallback',
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
          status: 'granted',
        })
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location access needed. Tap to enter manually.'
            : err.code === err.TIMEOUT
            ? 'Location timed out. Using approximate location.'
            : 'Could not determine location. Using approximate location.'

        setState({
          ...LUCKNOW_FALLBACK,
          accuracy: null,
          loading: false,
          error: message,
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'fallback',
        })
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 }
    )
  }, [])

  useEffect(() => {
    request()
  }, [request])

  return { ...state, retry: request }
}
