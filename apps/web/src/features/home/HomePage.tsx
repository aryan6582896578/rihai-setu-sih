import { Link } from "react-router-dom";

const STATS = [
  { value: "75.8%", label: "of India's prison inmates are undertrials", source: "NCRB Prison Statistics India 2022" },
  { value: "5.73 lakh", label: "undertrials behind bars awaiting trial outcomes", source: "NCRB Prison Statistics India 2022" },
  { value: "131%", label: "average occupancy across Indian prisons", source: "NCRB Prison Statistics India 2022" },
  { value: "1/3rd", label: "of max sentence served → first-time offenders can seek release on bond under §479 BNSS", source: "BNSS, 2023" },
];

const STEPS = [
  {
    n: "1",
    title: "Eligibility screening",
    body: "Deterministic rules screen every undertrial against Section 479 BNSS criteria — custody duration, offence class, first-offender status.",
  },
  {
    n: "2",
    title: "Fast-tracked paperwork",
    body: "Bail and personal-bond applications are drafted with AI-assisted grounds narratives for a lawyer's review — never auto-filed.",
  },
  {
    n: "3",
    title: "Court tracking",
    body: "Every application is tracked through filing, hearings and orders. Stalled cases are flagged and escalated automatically.",
  },
  {
    n: "4",
    title: "Rehabilitation & reintegration",
    body: "In-custody skill training feeds a Skill Passport that connects released individuals to employers and livelihoods.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">RS</span>
            <div className="leading-tight">
              <p className="font-semibold tracking-tight text-slate-900">RIHAI SETU</p>
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Rehabilitation Bridge</p>
            </div>
          </div>
          <Link
            to="/login"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            Staff login
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-b from-blue-50 via-white to-white">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <p className="mx-auto mb-4 w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
              Section 479 BNSS · Undertrial release · Reintegration
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              RIHAI SETU
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-lg font-medium text-blue-900">
              The digital bridge from undertrial release to rehabilitation and reintegration.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
              Lakhs of undertrial prisoners languish in overcrowded jails even when the law already allows their release.
              RIHAI SETU identifies who qualifies, accelerates the paperwork, tracks every case through court, and connects
              skills learnt in custody to jobs outside it.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-800"
              >
                Log in to your portal
              </Link>
              <a
                href="#how-it-works"
                className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-4 py-10 sm:px-6 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 py-2 text-center lg:text-left">
                <p className="text-3xl font-bold text-blue-800">{s.value}</p>
                <p className="mt-1 text-sm text-slate-600">{s.label}</p>
                <p className="mt-1 text-[11px] text-slate-400">{s.source}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            How it works
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-600">
            A transparent pipeline that keeps a human decision-maker — judge, DLSA lawyer, superintendent — at every gate.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">
                  {step.n}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-blue-900">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-12 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-white">Working inside the system?</h2>
            <p className="max-w-xl text-sm text-blue-100">
              Superintendents, jail staff, DLSA lawyers and auditors access the portal through secure role-based accounts.
            </p>
            <Link
              to="/login"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-900 shadow hover:bg-blue-50"
            >
              Go to staff login
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-slate-500 sm:px-6">
          <p className="mb-2 font-medium text-slate-600">Sources & references</p>
          <ul className="list-inside list-disc space-y-1">
            <li>National Crime Records Bureau — Prison Statistics India 2022 (undertrial share, occupancy, counts)</li>
            <li>Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 479 (maximum period for detention of undertrial prisoners)</li>
            <li>Department of Justice — eCourts Mission Mode Project</li>
          </ul>
          <p className="mt-4">
            RIHAI SETU displays synthetic demonstration data only. It never auto-files or auto-approves anything;
            all release decisions rest with courts and designated human authorities.
          </p>
        </div>
      </footer>
    </div>
  );
}
