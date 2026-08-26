import { useEffect, useState } from 'react'
import StatusDonut from '../components/StatusDonut'
import { occupancyColor } from '../lib/format'

export default function OverviewPage({ summary, prisons }) {
  const attention = prisons
    ? [...prisons].sort((a, b) => b.occupancy_rate - a.occupancy_rate)
    : []

  return (
    <div className="space-y-5">
      <Kpis summary={summary} />
      <div className="grid gap-5 lg:grid-cols-5">
        <StatusDonut prisons={prisons} />
        <div className="card p-6 lg:col-span-3">
          <h2 className="text-sm font-semibold text-[#1f2d3d]">Facilities Requiring Attention</h2>
          <p className="mt-0.5 text-xs text-gray-500">highest occupancy · Section 479 relief potential shown</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                <th className="pb-2 font-medium">Prison</th>
                <th className="pb-2 text-right font-medium">Occupancy</th>
                <th className="pb-2 text-right font-medium">Eligible</th>
                <th className="pb-2 text-right font-medium">Surety Stuck</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((p) => (
                <tr key={p.prison_id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5">
                    <p className="font-medium text-[#1f2d3d]">{p.prison_name}</p>
                    <p className="text-[11px] text-gray-500">{p.prison_id}</p>
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums" style={{ color: occupancyColor(p.occupancy_rate) }}>
                    {p.occupancy_rate}%
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-gray-700">{p.sec479_eligible_undertrials}</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-700">{p.stuck_at_surety}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <RehabilitationSection />
    </div>
  )
}

function Kpis({ summary }) {
  if (!summary) return null
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {[
        { label: 'Prisons Monitored', value: summary.total_prisons },
        {
          label: 'Statewide Occupancy',
          value: `${summary.statewide_occupancy_rate}%`,
          color: '#c0392b',
        },
        { label: 'Critical Facilities', value: summary.critical_prisons_count, color: '#c0392b' },
        { label: 'Sec 479 Eligible', value: summary.total_sec479_eligible_undertrials, color: '#d9480f' },
        { label: 'Surety Bottlenecks', value: summary.total_stuck_at_surety },
      ].map((t) => (
        <div key={t.label} className="card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={t.color ? { color: t.color } : undefined}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function RehabilitationSection() {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/v1/rehabilitation/summary')
      .then((r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((res) => {
        if (res && !res.detail) setData(res)
      })
      .catch(() => {})
  }, [])

  if (!data || !data.status_counts) return null

  const counts = data.status_counts || {}
  const certified = counts.Certified ?? counts['Certified'] ?? 0
  const inTraining = counts.In_Training ?? counts['In Training'] ?? 0
  const assessmentPending = counts.Assessment_Pending ?? counts['Assessment Pending'] ?? 0

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-[#1f2d3d]">Rehabilitation &amp; Skill Passports</h2>
      <p className="mt-0.5 text-xs text-gray-500">
        {data.total_passports ?? 0} inmate skill passports · {data.consent_rate ?? 0}% consent to share profile
      </p>
      <div className="mt-4 grid grid-cols-3 gap-4 md:max-w-md">
        {[
          ['Certified', certified],
          ['In Training', inTraining],
          ['Assessment Pending', assessmentPending],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-gray-50 px-3 py-2.5 ring-1 ring-gray-100">
            <p className="text-xl font-bold tabular-nums text-[#1f2d3d]">{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

