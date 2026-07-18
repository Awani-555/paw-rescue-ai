import { lazy, Suspense, useEffect, useState } from 'react'
import ReporterPage from './pages/ReporterPage'
import Spinner from './components/ui/Spinner'
import AlertOptOutToggle from './components/reporter/AlertOptOutToggle'

const ResponderPage = lazy(() => import('./pages/ResponderPage'))
const FirstAidLibrary = lazy(() => import('./pages/FirstAidLibrary'))
const HelpOfferPage = lazy(() => import('./pages/HelpOfferPage'))

const PAGES = { REPORTER: 'reporter', RESPONDER: 'responder', FIRST_AID: 'firstaid', HELP_OFFER: 'help' }

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
      <Spinner size="lg" />
    </div>
  )
}

// This app has no client-side router (page is just React state), so a
// notification click needs a manual way to say "open here". Push payloads
// point at ?case=<id> (Tier 2, registered responders) or ?help=<id>
// (Tier 1, anonymous public); this reads whichever is present, once, from
// the URL the page was loaded or focused with.
function readDeepLinkFromUrl(url) {
  const params = new URLSearchParams(new URL(url, window.location.origin).search)
  const caseId = params.get('case')
  if (caseId) return { page: PAGES.RESPONDER, caseId }
  const helpId = params.get('help')
  if (helpId) return { page: PAGES.HELP_OFFER, caseId: helpId }
  return null
}

function App() {
  const [page, setPage] = useState(PAGES.REPORTER)
  const [deepLinkCaseId, setDeepLinkCaseId] = useState(null)

  useEffect(() => {
    const initial = readDeepLinkFromUrl(window.location.href)
    if (initial) {
      setPage(initial.page)
      setDeepLinkCaseId(initial.caseId)
    }

    // Same deep link, but for a tab that was already open when the
    // notification was tapped (sw.js posts this instead of relying on a
    // fresh navigation).
    const onMessage = (event) => {
      if (event.data?.type !== 'pawrescue-notification-click') return
      const deepLink = readDeepLinkFromUrl(event.data.url)
      if (deepLink) {
        setPage(deepLink.page)
        setDeepLinkCaseId(deepLink.caseId)
      }
    }

    navigator.serviceWorker?.addEventListener?.('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener?.('message', onMessage)
  }, [])

  const backToReporter = () => setPage(PAGES.REPORTER)

  return (
    <div className="app-shell">
      {page !== PAGES.RESPONDER && page !== PAGES.HELP_OFFER && (
        <div className="corner-nav">
          <AlertOptOutToggle />
          <button onClick={() => setPage(PAGES.RESPONDER)}>Responder Login</button>
        </div>
      )}

      {page === PAGES.REPORTER && (
        <ReporterPage onOpenFirstAidLibrary={() => setPage(PAGES.FIRST_AID)} />
      )}

      {page === PAGES.FIRST_AID && (
        <Suspense fallback={<PageFallback />}>
          <FirstAidLibrary onBack={backToReporter} />
        </Suspense>
      )}

      {page === PAGES.RESPONDER && (
        <Suspense fallback={<PageFallback />}>
          <ResponderPage onBack={backToReporter} highlightCaseId={deepLinkCaseId} />
        </Suspense>
      )}

      {page === PAGES.HELP_OFFER && (
        <Suspense fallback={<PageFallback />}>
          <HelpOfferPage caseId={deepLinkCaseId} onBack={backToReporter} />
        </Suspense>
      )}
    </div>
  )
}

export default App
