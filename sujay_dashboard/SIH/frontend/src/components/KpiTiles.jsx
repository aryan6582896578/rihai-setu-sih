import { occupancyColor } from '../lib/format'

export default function KpiTiles({ summary }) {
  if (!summary) return null
  const tiles = [
    { label: 'Prisons Monitored', value: summary.total_prisons },
    {
      label: 'Statewide Occupancy',
      value: `${summary.statewide_occupancy_rate}%`,
      accent: occupancyColor(summary.statewide_occupancy_rate),
    },
    { label: 'Critical Prisons', value: summary.critical_prisons_count, accent: summary.critical_prisons_count > 0 ? '#c0392b' : undefined },
    { label: 'Sec 479 Eligible', value: summary.total_sec479_eligible_undertrials, accent: '#d9480f' },
    { label: 'Surety Bottlenecks', value: summary.total_stuck_at_surety },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={t.accent ? { color: t.accent } : undefined}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  )
}
