import { useEffect, useState } from 'react'
import { runWhatIf } from '../lib/api'
import { occupancyColor, statusChipClass, occupancyStatus } from '../lib/format'

function PrisonSelect({ prisons, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#1f2d3d] outline-none focus:border-orange-500"
    >
      {prisons.map((p) => (
        <option key={p.prison_id} value={p.prison_id}>
          {p.prison_name} ({p.prison_id})
        </option>
      ))}
    </select>
  )
}

export default function SimulatorPage({ prisons, selectedId, onSelect }) {
  const prison = prisons?.find((p) => p.prison_id === selectedId)
  const eligible = prison?.sec479_eligible_undertrials ?? 0
  const [releases, setReleases] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setReleases(Math.min(20, eligible))
    setResult(null)
  }, [prison?.prison_id, eligible])

  const simulate = async () => {
    if (!prison) return
    setLoading(true)
    try {
      setResult(await runWhatIf(prison.prison_id, releases))
    } finally {
      setLoading(false)
    }
  }

  if (!prisons || !prison) return null

  const tiles = result
    ? [
        {
          label: 'Current State',
          pop: result.current_state.population,
          occ: result.current_state.occupancy_rate,
          status: occupancyStatus(result.current_state.occupancy_rate),
        },
        {
          label: 'Baseline — 90 Days',
          pop: result.baseline_90d_projection.projected_population,
          occ: result.baseline_90d_projection.projected_occupancy_rate,
          status: result.baseline_90d_projection.status,
        },
        {
          label: `After ${releases} Releases — 90 Days`,
          pop: result.simulated_90d_outcome.projected_population,
          occ: result.simulated_90d_outcome.projected_occupancy_rate,
          status: result.simulated_90d_outcome.status,
        },
      ]
    : []

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-[#1f2d3d]">Capacity Scenario Simulation</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Estimate the effect of executing Section 479 releases on projected 90-day occupancy.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Facility</label>
            <PrisonSelect prisons={prisons} value={selectedId} onChange={onSelect} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Section 479 releases to execute
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(eligible, 1)}
              value={Math.min(releases, Math.max(eligible, 1))}
              onChange={(e) => setReleases(Number(e.target.value))}
              className="w-full accent-orange-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-gray-400">
              <span>0</span>
              <span className="rounded bg-orange-50 px-3 py-0.5 text-sm font-bold text-orange-700 ring-1 ring-orange-200 tabular-nums">
                {releases}
              </span>
              <span>{eligible} eligible</span>
            </div>
          </div>

          <button
            onClick={simulate}
            disabled={loading}
            className="w-full rounded-md bg-orange-600 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {loading ? 'Running…' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.label} className="card p-5">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t.label}</p>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${statusChipClass(t.status)}`}>
                    {t.status}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: occupancyColor(t.occ) }}>
                  {t.occ}%
                </p>
                <p className="mt-0.5 text-xs text-gray-500 tabular-nums">
                  ≈ {t.pop.toLocaleString()} / {result.capacity.toLocaleString()} beds
                </p>
              </div>
            ))}
          </div>

          <div className="card border-green-200 bg-green-50/50 p-5">
            <div className="flex items-center justify-around text-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700">Occupancy Reduction</p>
                <p className="mt-0.5 text-xl font-bold text-green-700 tabular-nums">
                  −{result.simulated_90d_outcome.occupancy_reduced_pct}%
                </p>
              </div>
              <div className="h-9 w-px bg-green-200" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700">Beds Freed</p>
                <p className="mt-0.5 text-xl font-bold text-green-700 tabular-nums">
                  {Math.round((result.simulated_90d_outcome.occupancy_reduced_pct / 100) * result.capacity * 10) / 10}
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Decision-support estimate only. The system does not grant release; judicial and administrative authority
            remains with the competent courts and prison administration.
          </p>
        </>
      )}
    </div>
  )
}
