const BASE = '/api/v1/overcrowding'

async function handle(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body || res.statusText}`)
  }
  return res.json()
}

export async function fetchHealth() {
  return fetch(`${BASE}/health`).then(handle)
}

export async function fetchStateSummary() {
  return fetch(`${BASE}/state-summary`).then(handle)
}

export async function fetchPrisons() {
  return fetch(`${BASE}/prisons`).then(handle)
}

export async function fetchForecast(prisonId) {
  return fetch(`${BASE}/forecast/${encodeURIComponent(prisonId)}`).then(handle)
}

export async function runWhatIf(prisonId, releasesSimulated) {
  return fetch(`${BASE}/simulator/what-if`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prison_id: prisonId,
      releases_simulated: releasesSimulated,
      horizon_days: 90,
    }),
  }).then(handle)
}
