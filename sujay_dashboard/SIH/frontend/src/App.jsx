import { useEffect, useState } from 'react'
import HeaderBar from './components/HeaderBar'
import OverviewPage from './pages/OverviewPage'
import PrisonsPage from './pages/PrisonsPage'
import ForecastPage from './pages/ForecastPage'
import SimulatorPage from './pages/SimulatorPage'
import { fetchStateSummary, fetchPrisons, fetchForecast } from './lib/api'

function ErrorBanner({ message }) {
  return (
    <div className="card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      <span className="font-semibold">Backend unreachable:</span> {message}
      <p className="mt-1 text-xs text-red-500">
        Start the API with <code className="rounded bg-white px-1.5 py-0.5">python -m backend.app.main</code> and reload.
      </p>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [prisons, setPrisons] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchStateSummary(), fetchPrisons()])
      .then(([s, p]) => {
        setSummary(s)
        setPrisons(p)
        if (p.length > 0) setSelectedId(p[0].prison_id)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    fetchForecast(selectedId).then(setForecast).catch((e) => setError(e.message))
  }, [selectedId])

  return (
    <div className="min-h-screen">
      <HeaderBar page={page} onNavigate={setPage} />
      <main className="mx-auto max-w-[1280px] px-8 py-6">
        {error && (
          <div className="mb-5">
            <ErrorBanner message={error} />
          </div>
        )}

        {page === 'overview' && <OverviewPage summary={summary} prisons={prisons} />}
        {page === 'prisons' && <PrisonsPage prisons={prisons} selectedId={selectedId} onSelect={setSelectedId} />}
        {page === 'forecast' && (
          <ForecastPage
            prisons={prisons}
            selectedId={selectedId}
            onSelect={setSelectedId}
            forecast={forecast}
          />
        )}
        {page === 'simulator' && (
          <SimulatorPage prisons={prisons} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </main>
      <footer className="pb-6 pt-2 text-center text-[11px] text-gray-400">
        AI-Assisted Section 479 Undertrial Release &amp; Prison Rehabilitation System · Team Void
      </footer>
    </div>
  )
}
