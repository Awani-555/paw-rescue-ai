import { useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import BackButton from '../components/ui/BackButton'
import { getCasePublicSummary, submitHelpOffer } from '../utils/api'
import { formatTimeAgo } from '../utils/formatters'

const STATES = { LOADING: 'loading', UNAVAILABLE: 'unavailable', PROMPT: 'prompt', FORM: 'form', DONE: 'done' }

export default function HelpOfferPage({ caseId, onBack }) {
  const [state, setState] = useState(STATES.LOADING)
  const [summary, setSummary] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getCasePublicSummary(caseId).then(({ data, error: reqError }) => {
      if (cancelled) return
      if (reqError || !data || data.status === 'resolved') {
        setState(STATES.UNAVAILABLE)
        return
      }
      setSummary(data)
      setState(STATES.PROMPT)
    })

    return () => {
      cancelled = true
    }
  }, [caseId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!consent || !name.trim() || !phone.trim()) return

    setSubmitting(true)
    setError('')

    const { error: reqError } = await submitHelpOffer(caseId, { name: name.trim(), phone: phone.trim(), consent })

    setSubmitting(false)

    if (reqError) {
      setError(reqError.message)
      return
    }

    setState(STATES.DONE)
  }

  return (
    <div className="page-container">
      <div className="step-header">
        <BackButton onClick={onBack} />
        <div className="step-title">
          <h2>Nearby alert</h2>
        </div>
      </div>

      {state === STATES.LOADING && (
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <Spinner size="lg" />
        </div>
      )}

      {state === STATES.UNAVAILABLE && (
        <div className="help-offer-card">
          <p>This case is no longer active. It may have already been resolved.</p>
          <Button variant="ghost" onClick={onBack}>
            Back to PawRescue
          </Button>
        </div>
      )}

      {state === STATES.PROMPT && (
        <div className="help-offer-card">
          <p className="help-offer-headline">An animal nearby may need help.</p>
          <p className="help-offer-meta">Reported {formatTimeAgo(summary?.timestamp)}</p>
          <p>
            No exact location or details are shared here. If you're nearby and able to help, the person who reported it
            will get your name and number to coordinate.
          </p>
          <Button variant="primary" size="large" className="btn-full" onClick={() => setState(STATES.FORM)}>
            I'll Help
          </Button>
        </div>
      )}

      {state === STATES.FORM && (
        <form className="help-offer-card" onSubmit={handleSubmit}>
          <p className="help-offer-headline">Leave your contact info</p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-field">
            <label htmlFor="helper-name">Name</label>
            <input id="helper-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="helper-phone">Phone number</label>
            <input id="helper-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <label className="help-offer-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I understand my name and phone number will be shared with the person who reported this animal, so they can
              contact me.
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            size="large"
            className="btn-full"
            disabled={!consent || !name.trim() || !phone.trim() || submitting}
            loading={submitting}
          >
            Confirm I'll Help
          </Button>
        </form>
      )}

      {state === STATES.DONE && (
        <div className="help-offer-card">
          <p className="help-offer-headline">Thank you.</p>
          <p>The reporter can now reach you to coordinate. You're doing something good.</p>
          <Button variant="ghost" onClick={onBack}>
            Back to PawRescue
          </Button>
        </div>
      )}
    </div>
  )
}
