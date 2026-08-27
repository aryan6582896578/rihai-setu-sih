import { occupancyColor, statusChipClass, occupancyStatus } from '../lib/format'

export function HorizonCards({ forecast }) {
  if (!forecast || !forecast.forecasts) return null
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Object.values(forecast.forecasts).map((f) => (
        <div key={f.horizon_days} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {f.horizon_days}-Day Projection
            </p>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusChipClass(f.status)}`}>
              {f.status}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: occupancyColor(f.projected_occupancy_rate) }}>
            {f.projected_occupancy_rate}%
          </p>
          <p className="mt-0.5 text-xs text-gray-500 tabular-nums">
            ≈ {f.projected_population.toLocaleString()} inmates projected
          </p>
        </div>
      ))}
    </div>
  )
}

const LABELS = {
  capacity: 'Sanctioned Capacity',
  current_population: 'Current Population',
  undertrial_population: 'Undertrial Population',
  convict_population: 'Convict Population',
  occupancy_rate: 'Current Occupancy Rate',
  overcrowding_gap: 'Overcrowding Gap',
  sec479_eligible_undertrials: 'Sec 479 Eligible Count',
  sec479_approaching_undertrials: 'Approaching Threshold',
  stuck_at_surety: 'Stuck at Surety Stage',
}

export default function DriversPanel({ importance }) {
  if (!importance || Object.keys(importance).length === 0) return null
  const rows = Object.entries(importance)
    .map(([k, v]) => ({ name: LABELS[k] ?? k, value: Math.abs(v) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-[#1f2d3d]">Forecast Drivers</h2>
      <p className="mt-0.5 text-xs text-gray-500">relative influence of each factor in the 90-day model</p>

      <table className="mt-4 w-full text-left text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-4 text-gray-600">{r.name}</td>
              <td className="w-40 py-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.value / rows[0].value) * 100}%`, backgroundColor: '#d9480f' }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
