export const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const DEFAULT_TIMEOUT_MS = 15000

function getToken() {
  return localStorage.getItem('pawrescue_responder_token')
}

async function request(path, { method = 'GET', body, auth = false, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timer)

    const json = await response.json().catch(() => null)

    if (!response.ok) {
      const message = json?.error?.message || 'Our servers had an issue. Your report was saved locally.'
      return { data: null, error: { message, code: json?.error?.code || 'SERVER_ERROR', status: response.status } }
    }

    return { data: json?.data ?? json, error: null }
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      return { data: null, error: { message: 'This is taking longer than expected. Try again.', code: 'TIMEOUT' } }
    }
    return { data: null, error: { message: 'No connection. Please check your signal.', code: 'NETWORK_ERROR' } }
  }
}

export async function submitReport({ image, notes, location, lat, lng, locationSource }) {
  const result = await request('/api/report', {
    method: 'POST',
    body: { image, notes, location, lat, lng, locationSource },
  })
  if (result.data?.result?.species === 'Unknown' && result.data?.result?.confidence <= 0.5) {
    result.aiFallback = true
  }
  return result
}

export async function getReports() {
  return request('/api/reports')
}

export async function registerResponder({ name, email, password, organization, phone }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { name, email, password, organization, phone },
  })
}

export async function loginResponder({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export async function getCases({ lat, lng } = {}) {
  const params = new URLSearchParams()
  if (lat != null) params.set('lat', lat)
  if (lng != null) params.set('lng', lng)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/cases${query}`, { auth: true })
}

export async function respondToCase(caseId) {
  return request(`/api/cases/${caseId}/respond`, { method: 'POST', auth: true })
}

export async function resolveCase(caseId) {
  return request(`/api/cases/${caseId}/resolve`, { method: 'POST', auth: true })
}

export async function updateRegisteredLocation({ lat, lng, trackingEnabled, pushSubscription }) {
  return request('/api/volunteers/registered-location', {
    method: 'POST',
    auth: true,
    body: { lat, lng, trackingEnabled, pushSubscription },
  })
}

export async function updatePublicLocation({ deviceId, lat, lng, trackingEnabled, pushSubscription }) {
  return request('/api/volunteers/public-location', {
    method: 'POST',
    body: { deviceId, lat, lng, trackingEnabled, pushSubscription },
  })
}

export async function getCasePublicSummary(caseId) {
  return request(`/api/cases/${caseId}/public-summary`)
}

export async function submitHelpOffer(caseId, { name, phone, consent }) {
  return request(`/api/cases/${caseId}/help`, {
    method: 'POST',
    body: { name, phone, consent },
  })
}

export async function getCaseHelpers(caseId) {
  return request(`/api/cases/${caseId}/helpers`)
}

// Returns a short-lived, single-use token. The phone number itself never
// appears in this (or any) JSON response - see components/reporter/CallHelperButton.jsx
// for how it's used: navigate the browser straight to /api/call/:token and
// let the backend's 302 redirect do the rest.
export async function getCallToken(caseId, helperId) {
  return request(`/api/cases/${caseId}/helpers/${helperId}/call-token`)
}

export async function deletePublicLocation(deviceId) {
  return request(`/api/volunteers/public-location/${deviceId}`, { method: 'DELETE' })
}

export function saveToken(token) {
  localStorage.setItem('pawrescue_responder_token', token)
}

export function clearToken() {
  localStorage.removeItem('pawrescue_responder_token')
}

export function hasToken() {
  return Boolean(getToken())
}
