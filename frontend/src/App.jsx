import { lazy, Suspense, useState } from 'react'
import ReporterPage from './pages/ReporterPage'
import Spinner from './components/ui/Spinner'

const ResponderPage = lazy(() => import('./pages/ResponderPage'))
const FirstAidLibrary = lazy(() => import('./pages/FirstAidLibrary'))

const PAGES = { REPORTER: 'reporter', RESPONDER: 'responder', FIRST_AID: 'firstaid' }

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
      <Spinner size="lg" />
    </div>
  )
}

function App() {
  const [page, setPage] = useState(PAGES.REPORTER)

  return (
    <div className="app-shell">
      {page !== PAGES.RESPONDER && (
        <div className="corner-nav">
          <button onClick={() => setPage(PAGES.RESPONDER)}>Responder Login</button>
        </div>
      )}

      {page === PAGES.REPORTER && (
        <ReporterPage onOpenFirstAidLibrary={() => setPage(PAGES.FIRST_AID)} />
      )}

      {page === PAGES.FIRST_AID && (
        <Suspense fallback={<PageFallback />}>
          <FirstAidLibrary onBack={() => setPage(PAGES.REPORTER)} />
        </Suspense>
      )}

      {page === PAGES.RESPONDER && (
        <Suspense fallback={<PageFallback />}>
          <ResponderPage onBack={() => setPage(PAGES.REPORTER)} />
        </Suspense>
      )}
    </div>
  )
}

export default App
