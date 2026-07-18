import { useState } from 'react'
import { getCallToken, BASE_URL } from '../../utils/api'

// The phone number never reaches this component, or any frontend JS, at
// all. Tapping fetches a one-time token, then navigates the browser
// straight to the backend's /api/call/:token, which responds with a 302
// redirect to tel:+91XXXXXXXXXX - the number only ever exists in that
// redirect's Location header, not in a page the reporter is looking at.
export default function CallHelperButton({ caseId, helperId, name }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setLoading(true)
    setError('')

    const { data, error: reqError } = await getCallToken(caseId, helperId)

    setLoading(false)

    if (reqError || !data?.token) {
      setError('Could not start the call. Try refreshing the page.')
      return
    }

    window.location.href = `${BASE_URL}/api/call/${data.token}`
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-full public-helper-call"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Connecting...' : `Call ${name}`}
      </button>
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}
