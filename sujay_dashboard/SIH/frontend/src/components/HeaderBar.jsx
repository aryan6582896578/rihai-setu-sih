const PAGES = [
  { id: 'overview', label: 'Overview' },
  { id: 'prisons', label: 'Prisons' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'simulator', label: 'Simulator' },
]

export default function HeaderBar({ page, onNavigate }) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-8">
        <div className="flex items-center gap-3 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1f2d3d] text-sm font-bold text-white">
            479
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-[#1f2d3d]">
              Prison Overcrowding Intelligence
            </h1>
            <p className="text-[11px] leading-tight text-gray-500">
              Section 479 Undertrial Release &amp; Rehabilitation System
            </p>
          </div>
        </div>

        <nav className="flex items-center self-stretch">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => onNavigate(p.id)}
              className={`h-full border-b-2 px-5 py-4 text-[13px] font-medium transition-colors ${
                page === p.id
                  ? 'border-orange-600 text-orange-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
            600-record dataset
          </span>
          <span className="flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            ML Engine
          </span>
        </div>
      </div>
    </header>
  )
}
