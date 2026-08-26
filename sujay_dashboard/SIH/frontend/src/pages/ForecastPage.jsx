import DriversPanel, { HorizonCards } from '../components/DriversPanel'
import ForecastChart from '../components/ForecastChart'

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

export default function ForecastPage({ prisons, selectedId, onSelect, forecast }) {
  if (!prisons) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#1f2d3d]">Overcrowding Forecast</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Machine-learning projection of population and occupancy at 30, 60 and 90-day horizons.
          </p>
        </div>
        <PrisonSelect prisons={prisons} value={selectedId} onChange={onSelect} />
      </div>

      <HorizonCards forecast={forecast} />
      <ForecastChart forecast={forecast} />
      <DriversPanel importance={forecast?.feature_importance} />

      <p className="text-xs text-gray-400">
        Projections are decision-support estimates generated from current facility data. They do not constitute a
        determination of eligibility or release; judicial authority remains with the courts.
      </p>
    </div>
  )
}
