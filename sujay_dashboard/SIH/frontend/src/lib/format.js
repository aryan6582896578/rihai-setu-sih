export function occupancyColor(rate) {
  if (rate == null) return '#8494a7'
  if (rate > 200) return '#b91c1c'
  if (rate > 150) return '#c2410c'
  if (rate > 115) return '#ea580c'
  if (rate > 100) return '#d97706'
  return '#15803d'
}

export function occupancyStatus(rate) {
  if (rate == null) return 'UNKNOWN'
  if (rate > 200) return 'CRITICAL'
  if (rate > 150) return 'VERY HIGH'
  if (rate > 115) return 'HIGH'
  if (rate > 100) return 'ELEVATED'
  return 'NORMAL'
}

export function statusChipClass(status) {
  const norm = (status || '').toUpperCase().replace(/\s+/g, '_')
  switch (norm) {
    case 'CRITICAL':
      return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    case 'VERY_HIGH':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
    case 'ELEVATED':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:
      return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  }
}

export const CHART = {
  grid: '#edf0f3',
  axis: '#7a8899',
  line: '#d9480f',
  fillTop: 'rgba(217, 72, 15, 0.14)',
  fillBottom: 'rgba(217, 72, 15, 0.01)',
}
