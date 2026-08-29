import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang, LangToggle } from "../../lib/i18n";
import logoImg from "../../public/rihai_setu_logo.png";
import l1Logo from "../../public/l1.png";
import l2Logo from "../../public/l2.png";
import l3Logo from "../../public/l3.png";
import l5Logo from "../../public/l5.png";
import l6Logo from "../../public/l6.png";
import legalGavelImg from "../../public/legal_books_gavel.png";

const FEATURES = [
  {
    step: "01",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4a7 7 0 100 14 7 7 0 000-14z" strokeWidth="2"/><path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
    ),
    key: "feat1",
  },
  {
    step: "02",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2h9l5 5v15H6z" strokeWidth="2"/><path d="M9 12h8M9 16h8M9 8h4" strokeWidth="2" strokeLinecap="round"/></svg>
    ),
    key: "feat2",
  },
  {
    step: "03",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21h8" strokeWidth="2" strokeLinecap="round"/><path d="M13 3l8 8-3 3-8-8z" strokeWidth="2"/><path d="M8 8l8 8-3 3-8-8z" strokeWidth="2"/></svg>
    ),
    key: "feat3",
  },
  {
    step: "04",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 21s-7-4.5-9.5-9C.9 8.5 2.5 4 6.5 4c2 0 3.5 1.2 4.5 2.6C12 5.2 13.5 4 15.5 4c4 0 5.6 4.5 4 8-2.5 4.5-9.5 9-9.5 9z" strokeWidth="2"/></svg>
    ),
    key: "feat4",
  },
];

function FlipFeatureCard(props: {
  f: typeof FEATURES[0];
  t: (key: string) => string;
}) {
  const [flipped, setFlipped] = useState(false);
  const { f, t } = props;

  return (
    <div
      onClick={() => setFlipped((v) => !v)}
      className="perspective-1000 h-[410px] sm:h-[430px] w-full cursor-pointer"
    >
      <div
        className={`relative h-full w-full transform-style-3d transition-transform duration-500 ${
          flipped ? "rotate-y-180" : ""
        }`}
      >
        {/* ---- FRONT SIDE ---- */}
        <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-[22px] border-[3px] border-terracotta/40 bg-white p-8 sm:p-9 shadow-md transition-all duration-200 hover:-translate-y-1.5 hover:border-[3.5px] hover:border-terracotta hover:shadow-[0_16px_36px_rgba(217,83,30,0.25)]">
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta text-white [&_svg]:h-7 [&_svg]:w-7 [&_svg]:stroke-white shadow-lg">
                {f.icon}
              </div>
              <span className="font-mono text-lg font-black text-terracotta">{f.step}</span>
            </div>
            <h4 className="display mb-3 text-xl font-extrabold text-navy sm:text-[1.35rem] leading-snug">{t(`${f.key}.h`)}</h4>
            <p className="text-[15.5px] sm:text-[16px] font-medium leading-relaxed text-slate-700">{t(`${f.key}.p`)}</p>
          </div>
          <div className="mt-5 border-t border-[#f7efe4] pt-4">
            <span className="inline-flex items-center gap-2 text-base font-black text-terracotta hover:underline">
              {t("know.more")}
            </span>
          </div>
        </div>

        {/* ---- BACK SIDE ---- */}
        <div className="rotate-y-180 backface-hidden absolute inset-0 flex flex-col justify-between rounded-[22px] border-[3.5px] border-terracotta bg-[#FFF9F2] p-8 sm:p-9 shadow-[0_16px_36px_rgba(217,83,30,0.25)]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-sm font-black tracking-wider text-terracotta">{f.step} · DETAILS</span>
            </div>
            <h4 className="display mb-4 text-lg font-extrabold text-navy sm:text-[1.25rem]">{t(`${f.key}.detail`)}</h4>
            <ul className="space-y-3 text-[15px] font-medium leading-relaxed text-slate-700">
              <li className="flex gap-2.5">
                <span className="font-bold text-terracotta">•</span>
                <span>{t(`${f.key}.point1`)}</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-terracotta">•</span>
                <span>{t(`${f.key}.point2`)}</span>
              </li>
            </ul>
          </div>
          <div className="mt-5 border-t border-[#f2e6d6] pt-4">
            <span className="inline-flex items-center gap-2 text-base font-black text-navy hover:text-terracotta">
              {t("know.back")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformWorkflowDiagram() {
  const steps = [
    {
      num: "01",
      title: "Statutory Eligibility Engine",
      desc: "Deterministic rule engine evaluates custody days against BNSS §479 thresholds (1/3rd or 1/2 max sentence).",
      tag: "Section 479 Gate",
      color: "bg-terracotta",
    },
    {
      num: "02",
      title: "DLSA Advocate Verification",
      desc: "Legal aid counsel reviews pre-filled bail narratives and digitally signs petitions — never auto-filed.",
      tag: "Lawyer Guarded",
      color: "bg-navy",
    },
    {
      num: "03",
      title: "Court Registry & Escalation",
      desc: "Tracked across trial court hearing calendars; delayed matters (>14 days) auto-escalate to DLSA Secretary.",
      tag: "Court Monitoring",
      color: "bg-terracotta",
    },
    {
      num: "04",
      title: "Skill Passport & Livelihood",
      desc: "In-custody trade training certificates issue a digital Skill Passport with employer match post-release.",
      tag: "Vocational Match",
      color: "bg-emerald-700",
    },
  ];

  return (
    <div className="rounded-2xl border-[2px] border-terracotta/35 bg-white p-6 sm:p-7 shadow-md">
      <div className="mb-5 flex items-center justify-between border-b border-[#f4ece1] pb-3.5">
        <div>
          <h4 className="display text-base font-extrabold text-navy">Platform Workflow Pipeline</h4>
          <p className="text-xs font-semibold text-terracotta">End-to-End Legal & Rehabilitation Process</p>
        </div>
        <span className="rounded-full border border-peach bg-[#FFF3E4] px-2.5 py-0.5 text-[10.5px] font-extrabold text-terracotta">
          4 Stages
        </span>
      </div>

      {/* Workflow Step Nodes */}
      <div className="relative space-y-3.5">
        {/* Connecting Vertical Line */}
        <div className="absolute left-[19px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-terracotta via-navy to-emerald-600 opacity-30" />

        {steps.map((step) => (
          <div
            key={step.num}
            className="group relative flex items-start gap-4 rounded-xl border border-[#F0E6D8] bg-[#FAF7F2] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-terracotta/60 hover:bg-white hover:shadow-sm"
          >
            {/* Step Node Circle */}
            <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.color} font-mono text-xs font-extrabold text-white shadow-sm`}>
              {step.num}
            </div>

            {/* Step Content */}
            <div className="flex-1 text-left">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                <h5 className="display text-[14px] font-bold text-navy transition-colors group-hover:text-terracotta">
                  {step.title}
                </h5>
                <span className="rounded-md border border-[#E9DFD1] bg-white px-2 py-0.5 text-[10px] font-extrabold text-bodytext">
                  {step.tag}
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-bodytext">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroArt() {
  return (
    <svg viewBox="0 0 420 420" className="w-full max-w-[320px] drop-shadow-[0_18px_30px_rgba(60,20,0,0.28)] sm:max-w-[380px]" xmlns="http://www.w3.org/2000/svg">
      <circle cx="210" cy="210" r="185" fill="rgba(255,255,255,0.14)" />
      <circle cx="210" cy="210" r="150" fill="rgba(255,255,255,0.10)" />
      <circle cx="210" cy="210" r="115" fill="rgba(255,255,255,0.08)" />
      <g transform="translate(90,90)">
        <rect x="0" y="90" width="46" height="110" rx="8" fill="#FFF3E4" />
        <rect x="60" y="60" width="46" height="140" rx="8" fill="#FFDDB0" />
        <rect x="120" y="20" width="46" height="180" rx="8" fill="#FFFFFF" />
        <rect x="180" y="70" width="46" height="130" rx="8" fill="#FFDDB0" />
        <path d="M-10 215 Q120 250 250 215" stroke="#FFFFFF" strokeWidth="4" fill="none" opacity=".85" strokeLinecap="round" />
        <circle cx="23" cy="80" r="9" fill="#2E7D32" />
        <circle cx="83" cy="50" r="9" fill="#2E7D32" />
        <circle cx="143" cy="10" r="9" fill="#2E7D32" />
        <circle cx="203" cy="60" r="9" fill="#2E7D32" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<{ title: string; subtitle: string; body: React.ReactNode } | null>(null);

  const navLinks: { label: string; href: string; current?: boolean }[] = [
    { label: t("nav.home"), href: "#top", current: true },
    { label: t("nav.how"), href: "#how-it-works" },
    { label: t("nav.applicant_portal"), href: "/portal/login" },
    { label: t("nav.ngo"), href: "/login" },
    // { label: t("nav.admin"), href: "/login" },
    { label: t("nav.reports"), href: "/login" },
  ];

  const stats = [
    { num: t("stat1.num"), label: t("stat1.label"), src: t("stat1.src") },
    { num: t("stat2.num"), label: t("stat2.label"), src: t("stat2.src") },
    { num: t("stat3.num"), label: t("stat3.label"), src: t("stat3.src") },
    { num: t("stat4.num"), label: t("stat4.label"), src: t("stat4.src") },
  ];

  return (
    <div className="min-h-screen bg-cream">
      {/* ---------- Navbar ---------- */}
      <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
        <div className="wrap-app flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="RIHAI SETU"
              className="h-11 w-11 rounded-[10px] object-cover shadow-sm"
            />
            <span className="leading-tight">
              <span className="display block text-[19px] font-extrabold tracking-tight text-navy">
                {t("brand.name")}
              </span>
              <span className="block text-[10.5px] uppercase tracking-[0.11em] text-bodytext">
                {t("brand.tag")}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-navy lg:flex">
            {navLinks.map((l) =>
              l.href.startsWith("#") ? (
                <a
                  key={l.label}
                  href={l.href}
                  className={`border-b-2 px-0.5 py-1.5 ${
                    l.current
                      ? "border-terracotta text-terracotta"
                      : "border-transparent hover:border-terracotta hover:text-terracotta"
                  }`}
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.label}
                  to={l.href}
                  className={`border-b-2 px-0.5 py-1.5 ${
                    l.current
                      ? "border-terracotta text-terracotta"
                      : "border-transparent hover:border-terracotta hover:text-terracotta"
                  }`}
                >
                  {l.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-4">
            <LangToggle />
            <Link to="/login" className="btn btn-primary btn-sm hidden sm:inline-flex">
              {t("cta.stafflogin")}
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-navy lg:hidden"
              aria-label={t("menu.open")}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-[#eee4d6] bg-white px-4 pb-4 pt-2 lg:hidden">
            {navLinks.map((l) =>
              l.href.startsWith("#") ? (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-bold text-navy hover:bg-cream"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.label}
                  to={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-bold ${
                    l.current ? "bg-peach/50 text-terracotta" : "text-navy hover:bg-cream"
                  }`}
                >
                  {l.label}
                </Link>
              ),
            )}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="btn btn-primary mt-2 w-full justify-center sm:hidden"
            >
              {t("cta.stafflogin")}
            </Link>
          </nav>
        )}
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#B71C1C_0%,#D9531E_40%,#F57C00_80%,#FFE0B2_100%)]" id="top">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="wrap-app relative z-[2] grid items-center gap-10 py-14 text-center sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:text-left">
          <div>

            <h1
              className="display mb-4 text-6xl font-extrabold leading-[0.98] text-white drop-shadow-[0_6px_30px_rgba(90,30,0,0.25)] sm:text-7xl lg:text-[6rem]"
              style={{ letterSpacing: "0.01em" }}
            >
              {t("brand.name")}
            </h1>
            <p className="display mb-4 max-w-xl text-xl font-semibold text-[#FFF3E4] sm:text-[1.5rem] lg:mx-0 mx-auto">
              {t("hero.sub")}
            </p>
            <p className="mx-auto mb-7 max-w-xl text-[15px] leading-relaxed text-[#FFE9D4] lg:mx-0">
              {t("hero.desc")}
            </p>
            <div className="flex flex-wrap justify-center gap-3.5 lg:justify-start">
              <a href="#how-it-works" className="btn btn-white">{t("hero.cta2")}</a>
            </div>
          </div>
          <div className="order-first flex items-center justify-center lg:order-none">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* Mission strip */}
      <div className="border-b border-[#f0e4d3] bg-cream">
        <div className="wrap-app flex flex-wrap items-center justify-center gap-3 py-4 text-center">
          <span className="h-2 w-2 rounded-full bg-saffron" />
          <strong className="display text-[15px] font-bold text-navy">{t("mission.title")}</strong>
          <span className="text-[13.5px] text-bodytext">{t("mission.note")}</span>
        </div>
      </div>

      {/* Stats */}
      <div id="reports" className="bg-white">
        <div className="wrap-app grid grid-cols-1 gap-y-8 py-10 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4 lg:py-13">
          {stats.map((s, i) => (
            <div key={s.label} className={`sm:px-5 ${i % 2 === 1 ? "sm:border-l sm:border-[#eee4d6]" : ""} ${i > 0 ? "lg:border-l lg:border-[#eee4d6]" : ""}`}>
              <p className="display text-4xl font-extrabold leading-none text-terracotta">{s.num}</p>
              <p className="mt-2.5 text-sm font-semibold text-heading">{s.label}</p>
              <p className="mt-1.5 text-[11px] text-[#a7adb6]">{s.src}</p>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <section id="about" className="py-16 sm:py-20">
        <div className="wrap-app grid items-start gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
          <div>
            <div className="kicker mb-3">{t("about.kicker")}</div>
            <h2 className="display mb-4 text-3xl font-bold text-navy sm:text-[2rem]">{t("about.h2")}</h2>
            {/* Section 479 Legal Illustration Banner Card */}
            <div className="relative mb-6 overflow-hidden rounded-2xl border-[2px] border-terracotta/30 bg-gradient-to-br from-[#FFF8F4] via-white to-[#FAF4EC] p-5 shadow-md">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <img
                  src={legalGavelImg}
                  alt="Legal Books, Scales of Justice & Gavel"
                  className="h-32 w-32 sm:h-40 sm:w-40 shrink-0 object-contain drop-shadow-[0_10px_18px_rgba(217,83,30,0.15)] transition-transform duration-300 hover:scale-105"
                />
                <div>
                  <span className="rounded-full bg-peach/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-terracotta">
                    BNSS §479 Statutory Relief
                  </span>
                  <h4 className="display mt-1.5 text-lg font-extrabold text-navy">
                    Statutory Rule Engine & Legal Aid Workflow
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-bodytext">
                    Under Section 479 BNSS, first-time undertrial offenders serving ≥1/3rd maximum sentence and general undertrials serving ≥1/2 maximum sentence are statutorily entitled to release on bail or personal bond.
                  </p>
                </div>
              </div>
            </div>

            <ul className="grid gap-2.5 sm:grid-cols-2">
              {[
                { label: t("about.links.1"), href: "#about" },
                { label: t("about.links.2"), href: "#roles" },
                { label: t("about.links.3"), href: "#how-it-works" },
                { label: t("about.links.4"), href: "#reports" },
              ].map((item) => (
                <li key={item.label}>
                  <a href={item.href} className="flex items-center gap-2 border-b border-dashed border-[#eadfcd] py-2 text-sm font-semibold text-navy hover:text-terracotta transition-colors">
                    <span className="font-extrabold text-terracotta">→</span> {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PlatformWorkflowDiagram />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="border-y border-[#EBE3D7] bg-[#FAF7F2] py-16 sm:py-20">
        <div className="wrap-app">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <div className="kicker mb-2.5">{t("feat.kicker")}</div>
            <h2 className="display text-3xl font-bold text-navy sm:text-[2.1rem]">{t("feat.h2")}</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((f) => (
              <FlipFeatureCard key={f.key} f={f} t={t} />
            ))}
          </div>
        </div>
      </section>

      {/* Rehabilitation Banner */}
      <section className="py-12 sm:py-16">
        <div className="wrap-app">
          <div className="relative overflow-hidden rounded-[24px] border-[2px] border-terracotta/40 bg-gradient-to-br from-navy via-[#232D3B] to-[#121820] p-8 shadow-xl sm:p-12 text-white">
            {/* Background Ambient Glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-terracotta/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-saffron/15 blur-3xl" />

            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                {/* Official RIHAI SETU Logo Icon */}
                <div className="flex h-22 w-22 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md p-2.5 shadow-lg">
                  <img src={logoImg} alt="RIHAI SETU Logo" className="h-full w-full rounded-xl object-cover" />
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2.5">
                    <span className="rounded-full bg-terracotta px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-white">
                      Vocational Rehabilitation
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-[#ffc696]">Skill Passport System</span>
                  </div>
                  <h3 className="display max-w-xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-[2.1rem] leading-snug">
                    {t("banner.h")}
                  </h3>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start lg:items-center gap-6 border-t border-white/15 lg:border-t-0 pt-6 lg:pt-0">
                <p className="max-w-md text-sm sm:text-[15px] font-medium leading-relaxed text-slate-200">
                  {t("banner.p")}
                </p>
                <Link
                  to="/portal/login"
                  className="btn btn-primary shrink-0 justify-center px-7 py-3.5 text-base font-bold shadow-[0_8px_22px_rgba(217,83,30,0.45)]"
                >
                  {t("banner.cta")} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stakeholders & Partners */}
      <div id="roles" className="border-y border-[#f0e4d3] bg-[#FAF7F2] py-14 sm:py-16">
        <div className="wrap-app">
          <div className="kicker mb-8 text-center">{t("partners.kicker")}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 justify-items-center sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
            {[
              {
                title: "Legal Experts",
                image: l1Logo,
              },
              {
                title: "Justice System Stakeholders",
                image: l2Logo,
              },
              {
                title: "Rehabilitation Partners",
                image: l3Logo,
              },
              {
                title: "Technology & Research",
                icon: (
                  <svg className="h-9 w-9 stroke-terracotta" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="5" width="14" height="14" rx="3" />
                    <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
                    <text x="12" y="14" textAnchor="middle" fill="#D9531E" stroke="none" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">AI</text>
                  </svg>
                ),
              },
              {
                title: "Civil Society & NGOs",
                image: l5Logo,
              },
              {
                title: "Government Departments",
                image: l6Logo,
              },
            ].map((item) => (
              <div key={item.title} className="group flex cursor-pointer flex-col items-center text-center">
                <div className="mb-3.5 flex h-24 w-24 items-center justify-center rounded-full border border-[#EBE3D7] bg-white p-3.5 shadow-md transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-terracotta/60 group-hover:shadow-xl group-hover:shadow-terracotta/15">
                  {item.image ? (
                    <img src={item.image} alt={item.title} className="h-full w-full object-contain" />
                  ) : (
                    item.icon
                  )}
                </div>
                <p className="max-w-[125px] text-xs font-bold leading-snug text-navy transition-colors group-hover:text-terracotta">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA strip */}
      <div className="bg-navy py-16 text-center text-white">
        <div className="wrap-app">
          <h3 className="display mb-2.5 text-3xl font-bold">{t("cta.h")}</h3>
          <p className="mx-auto mb-6 max-w-xl text-sm text-[#c3cad5]">{t("cta.p")}</p>
          <Link to="/login" className="btn btn-primary">{t("cta.btn")}</Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy pt-14 text-[#c3cad5]">
        <div className="wrap-app grid gap-10 border-b border-white/[0.1] pb-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-3.5">
              <img src={logoImg} alt="RIHAI SETU Logo" className="h-12 w-12 rounded-2xl bg-white p-1.5 object-cover shadow-md border border-white/30" />
              <div>
                <span className="display block text-xl font-extrabold tracking-tight text-white">{t("brand.name")}</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-terracotta">{t("brand.tag")}</span>
              </div>
            </div>
            <p className="mb-4 text-[13.5px] leading-relaxed text-[#a0abbd] max-w-sm">{t("hero.sub")}</p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-[#a0abbd]">
              <strong className="text-white font-semibold">{t("footer.hours.k")}</strong> {t("footer.hours.v")}
            </div>
          </div>

          {/* About Column */}
          <div>
            <h5 className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-saffron">{t("footer.about.h")}</h5>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#about" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.about.1")}
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.about.2")}
                </a>
              </li>
              <li>
                <a href="#roles" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.about.3")}
                </a>
              </li>
              <li>
                <a href="#reports" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.about.4")}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h5 className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-saffron">{t("footer.legal.h")}</h5>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() =>
                    setActiveModal({
                      title: "Section 479 BNSS Statutory Framework",
                      subtitle: "Bharatiya Nagarik Suraksha Sanhita, 2023",
                      body: (
                        <div className="space-y-4 text-sm leading-relaxed text-bodytext">
                          <div className="rounded-xl border border-terracotta/25 bg-[#FFF8F5] p-3.5">
                            <span className="font-extrabold text-terracotta">Section 479 BNSS Core Mandate:</span>
                            <p className="mt-1 text-xs text-navy">
                              Replaces legacy Section 436A CrPC with mandatory statutory relief timelines for undertrial prisoners.
                            </p>
                          </div>
                          <ul className="space-y-2.5">
                            <li className="flex items-start gap-2">
                              <span className="font-extrabold text-terracotta">1. First-Time Offenders (1/3rd Rule):</span>
                              <span>Undertrials with no prior convictions who complete <strong>one-third (1/3)</strong> of the maximum sentence specified for their offense are statutorily entitled to release on bail or personal bond.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="font-extrabold text-navy">2. General Undertrials (1/2 Rule):</span>
                              <span>Undertrials who complete <strong>one-half (1/2)</strong> of the maximum sentence specified for their offense must be released on bail/bond.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="font-extrabold text-red-600">3. Statutory Exclusions:</span>
                              <span>Offenses punishable by death, life imprisonment, or specified special statutes are excluded from mandatory 479 release.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="font-extrabold text-emerald-700">4. Legal Aid Obligation:</span>
                              <span>Section 479(2) obligates the Jail Superintendent and DLSA Legal Aid Counsel to submit release applications directly to the competent Court.</span>
                            </li>
                          </ul>
                        </div>
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-left hover:text-saffron transition-colors group cursor-pointer"
                >
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.legal.1")}
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    setActiveModal({
                      title: "Terms of Service & Operational Governance",
                      subtitle: "Human-in-the-Loop Judicial Safeguard",
                      body: (
                        <div className="space-y-4 text-sm leading-relaxed text-bodytext">
                          <p>
                            <strong>RIHAI SETU</strong> is a workflow automation and decision-support infrastructure operating under strict judicial safeguards:
                          </p>
                          <ul className="space-y-2 list-disc pl-5">
                            <li><strong>No Automated Bail:</strong> System rule engines calculate custody days, draft legal petitions, and track hearing schedules, but <strong>all release orders rest strictly with Judicial Magistrates</strong>.</li>
                            <li><strong>Role Isolation:</strong> Staff access is facility-scoped (`JailAccess`). Users can only view records belonging to their assigned jail unit.</li>
                            <li><strong>Audit Logging:</strong> Every document review, stage transition, and record export is permanently recorded in immutable `AuditLog` records.</li>
                          </ul>
                        </div>
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-left hover:text-saffron transition-colors group cursor-pointer"
                >
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.legal.2")}
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    setActiveModal({
                      title: "Data Protection & Encryption Policy",
                      subtitle: "AES-256-GCM Envelope Security & HMAC Blind Indexing",
                      body: (
                        <div className="space-y-4 text-sm leading-relaxed text-bodytext">
                          <div className="rounded-xl border border-navy/20 bg-slate-50 p-3.5">
                            <span className="font-extrabold text-navy">Government Grade Data Privacy:</span>
                            <p className="mt-1 text-xs text-bodytext">
                              Designed in compliance with the Digital Personal Data Protection (DPDP) Act and NALSA privacy standards.
                            </p>
                          </div>
                          <ul className="space-y-2.5">
                            <li><strong>AES-256-GCM Envelope Encryption:</strong> All Personally Identifiable Information (PII) including full names, Aadhaar numbers, and next-of-kin contacts are encrypted at rest.</li>
                            <li><strong>HMAC-SHA256 Blind Indexing:</strong> Exact database lookups operate on zero-knowledge HMAC hashes, ensuring plaintext names never exist in database indexes.</li>
                            <li><strong>Session Protection:</strong> Short-lived JWT access tokens (15m), httpOnly refresh cookies, and TOTP Multi-Factor Authentication (MFA).</li>
                          </ul>
                        </div>
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-left hover:text-saffron transition-colors group cursor-pointer"
                >
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.legal.3")}
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    setActiveModal({
                      title: "Accessibility & Multi-Lingual Standards",
                      subtitle: "WCAG 2.1 AA & Multi-Lingual Platform",
                      body: (
                        <div className="space-y-4 text-sm leading-relaxed text-bodytext">
                          <ul className="space-y-2 list-disc pl-5">
                            <li><strong>Multi-Lingual Engine (i18n):</strong> Complete English and Hindi localization across all dashboards, prisoner kiosks, and petition draft previews.</li>
                            <li><strong>High-Contrast Color System:</strong> Curated high-contrast visual tokens (`Terracotta #D9531E`, `Navy #1E293B`) ensuring maximum clarity on mobile devices and prison kiosk terminals.</li>
                            <li><strong>Prisoner Self-Service Kiosk:</strong> Simplified 4-digit PIN / Biometric self-service portal tailored for undertrial prisoners inside correctional facilities.</li>
                          </ul>
                        </div>
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-left hover:text-saffron transition-colors group cursor-pointer"
                >
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.legal.4")}
                </button>
              </li>
            </ul>
          </div>

          {/* Access Column */}
          <div>
            <h5 className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-saffron">{t("footer.access.h")}</h5>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/login" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.access.1")}
                </Link>
              </li>
              <li>
                <Link to="/portal/login" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.access.2")}
                </Link>
              </li>
              <li>
                <Link to="/overcrowding" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.access.3")}
                </Link>
              </li>
              <li>
                <Link to="/verify/certificate/demo" className="inline-flex items-center gap-1.5 hover:text-saffron transition-colors group">
                  <span className="text-terracotta text-xs group-hover:translate-x-0.5 transition-transform">›</span>
                  {t("footer.access.4")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Institutional Tech Badges Strip */}
        <div className="wrap-app border-b border-white/[0.08] py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs font-semibold text-[#808c9e] uppercase tracking-wider">Ecosystem Interoperability Standards</span>
            <div className="flex flex-wrap gap-2.5">
              {["NALSA Data Schema", "eCourts API v2", "NCRB Prison Stats", "Digital India Identity", "BNSS §479 Engine"].map((badge) => (
                <span key={badge} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300 transition-colors hover:border-terracotta/50 hover:bg-terracotta/10 hover:text-white">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="wrap-app flex flex-wrap justify-between gap-2 py-5 text-xs text-[#7c8595]">
          <span>{t("footer.copyright")}</span>
        </div>
        <div className="border-t border-white/[0.06] py-3.5 text-center text-[11.5px] text-[#7c8595]">
          {t("disclaimer")}
        </div>
      </footer>

      {/* Legal & Policy Interactive Modal Overlay */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-terracotta/30 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="rounded-full bg-peach/70 px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-terracotta">
                  {activeModal.subtitle}
                </span>
                <h3 className="display mt-1 text-xl font-extrabold text-navy">{activeModal.title}</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mb-6">{activeModal.body}</div>
            <div className="flex justify-end border-t border-slate-100 pt-3.5">
              <button
                onClick={() => setActiveModal(null)}
                className="btn btn-primary px-6 py-2 text-sm font-bold"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
