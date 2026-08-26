import { occupancyColor, statusChipClass, occupancyStatus } from '../lib/format'

export default function PrisonsPage({ prisons, selectedId, onSelect }) {
  if (!prisons) return null
  const sorted = [...prisons].sort((a, b) => b.occupancy_rate - a.occupancy_rate)

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-[#1f2d3d]">Correctional Facilities</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            capacity, population and Section 479 relief pipeline · select a row for forecasting and simulation
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Facility</th>
                <th className="px-3 py-3 text-right font-medium">Capacity</th>
                <th className="px-3 py-3 text-right font-medium">Population</th>
                <th className="px-3 py-3 text-right font-medium">Available Beds</th>
                <th className="px-3 py-3 font-medium">Occupancy</th>
                <th className="px-3 py-3 text-right font-medium">Eligible</th>
                <th className="px-3 py-3 text-right font-medium">Approaching</th>
                <th className="px-3 py-3 text-right font-medium">Surety</th>
                <th className="px-3 py-3 text-right font-medium">Court</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.prison_id}
                  onClick={() => onSelect(p.prison_id)}
                  className={`cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50 ${
                    selectedId === p.prison_id ? 'bg-orange-50/70' : ''
                  }`}
                >
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-[#1f2d3d]">{p.prison_name}</p>
                    <p className="text-[11px] text-gray-500">{p.prison_id}</p>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">{p.capacity.toLocaleString()}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                    {p.current_population.toLocaleString()}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                    {p.available_beds >= 0 ? p.available_beds : `−${Math.abs(p.available_beds)}`}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.occupancy_rate / 2, 100)}%`,
                            backgroundColor: occupancyColor(p.occupancy_rate),
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: occupancyColor(p.occupancy_rate) }}>
                        {p.occupancy_rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums" style={{ color: '#d9480f' }}>
                    {p.sec479_eligible_undertrials}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                    {p.sec479_approaching_undertrials}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">{p.stuck_at_surety}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">{p.stuck_at_court}</td>
                  <td className="px-6 py-3.5">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${statusChipClass(occupancyStatus(p.occupancy_rate))}`}>
                      {occupancyStatus(p.occupancy_rate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Occupancy thresholds — Normal ≤ 100% · Elevated 100–115% · High 115–150% · Very High 150–200% · Critical &gt; 200% of sanctioned capacity.
      </p>
    </div>
  )
}
