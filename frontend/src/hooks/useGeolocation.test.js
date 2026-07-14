import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGeolocation } from './useGeolocation'

const LUCKNOW_FALLBACK = { lat: 26.8467, lng: 80.9462 }

function mockGeolocation(implementation) {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: implementation },
    configurable: true,
  })
}

describe('useGeolocation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in a loading state', () => {
    mockGeolocation(() => {})
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.loading).toBe(true)
    expect(result.current.status).toBe('requesting')
  })

  it('falls back to Lucknow coordinates when permission is denied', async () => {
    mockGeolocation((_success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 })
    })

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.lat).toBe(LUCKNOW_FALLBACK.lat)
    expect(result.current.lng).toBe(LUCKNOW_FALLBACK.lng)
    expect(result.current.status).toBe('denied')
    expect(result.current.error).toMatch(/enter manually/i)
  })

  it('shows a timeout-specific error message and still falls back', async () => {
    mockGeolocation((_success, error) => {
      error({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 })
    })

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.status).toBe('fallback')
    expect(result.current.error).toMatch(/timed out/i)
    expect(result.current.lat).toBe(LUCKNOW_FALLBACK.lat)
  })

  it('uses real coordinates when geolocation succeeds', async () => {
    mockGeolocation((success) => {
      success({ coords: { latitude: 12.34, longitude: 56.78, accuracy: 10 } })
    })

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.lat).toBe(12.34)
    expect(result.current.lng).toBe(56.78)
    expect(result.current.status).toBe('granted')
  })
})
