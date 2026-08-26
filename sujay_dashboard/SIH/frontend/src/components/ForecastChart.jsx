import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { CHART } from '../lib/format'

export default function ForecastChart({ forecast }) {
  if (!forecast || !forecast.forecasts) return null

  const data = [
    { label: 'Current', occ: forecast.current_occupancy_rate, pop: forecast.current_population },
    ...Object.values(forecast.forecasts).map((v) => ({
      label: `${v.horizon_days} Days`,
      occ: v.projected_occupancy_rate,
      pop: v.projected_population,
    })),
  ]

  return (
    <div className="card p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#1f2d3d]">Projected Occupancy Trend</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {forecast.prison_name} · capacity {forecast.capacity.toLocaleString()} beds
          </p>
        </div>
        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
          Model: Ridge Regression
        </span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.fillTop} />
              <stop offset="100%" stopColor={CHART.fillBottom} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 12 }} stroke={CHART.grid} tickMargin={8} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 12 }} stroke={CHART.grid} unit="%" />
          <Tooltip
            cursor={{ stroke: '#c9d1d9', strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e3e7ec',
              borderRadius: 8,
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
            formatter={(value, name) =>
              name === 'occupancy' ? [`${value}%`, 'Projected occupancy'] : [value.toLocaleString(), 'Population']
            }
          />
          <ReferenceLine y={100} stroke="#27ae60" strokeDasharray="4 4" />
          <ReferenceLine y={115} stroke="#c0392b" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="occ"
            name="occupancy"
            stroke={CHART.line}
            strokeWidth={2}
            fill="url(#occFill)"
            dot={{ r: 3.5, fill: '#fff', stroke: CHART.line, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: CHART.line }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 flex items-center gap-5 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4" style={{ background: '#27ae60' }} /> Capacity limit (100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4" style={{ background: '#c0392b' }} /> Critical threshold (115%)
        </span>
      </div>
    </div>
  )
}
