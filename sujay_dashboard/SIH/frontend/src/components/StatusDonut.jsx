import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { occupancyStatus } from '../lib/format'

const STATUS_COLORS = {
  CRITICAL: '#b91c1c',
  'VERY HIGH': '#c2410c',
  HIGH: '#ea580c',
  ELEVATED: '#d97706',
  NORMAL: '#15803d',
}

export default function StatusDonut({ prisons }) {
  if (!prisons) return null
  const counts = { CRITICAL: 0, 'VERY HIGH': 0, HIGH: 0, ELEVATED: 0, NORMAL: 0 }
  prisons.forEach((p) => {
    const st = occupancyStatus(p.occupancy_rate)
    if (counts[st] !== undefined) counts[st] += 1
  })
  const data = Object.entries(counts)
    .filter(([_, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-[#1f2d3d]">Facility Status Distribution</h2>
      <p className="mt-0.5 text-xs text-gray-500">{prisons.length} monitored correctional facilities</p>

      <div className="relative mx-auto mt-4 h-[180px] w-full max-w-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e3e7ec',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={2} strokeWidth={1} stroke="#fff">
              {data.map((d) => (
                <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold text-[#1f2d3d]">{prisons.length}</p>
          <p className="text-[11px] text-gray-500">facilities</p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between px-1 py-1 text-xs">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS[d.name] }} />
              {d.name.charAt(0) + d.name.slice(1).toLowerCase()}
            </span>
            <span className="font-semibold tabular-nums text-[#1f2d3d]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
