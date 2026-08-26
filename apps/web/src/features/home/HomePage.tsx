import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang, LangToggle } from "../../lib/i18n";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4a7 7 0 100 14 7 7 0 000-14z" strokeWidth="2"/><path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
    ),
    key: "feat1",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2h9l5 5v15H6z" strokeWidth="2"/><path d="M9 12h8M9 16h8M9 8h4" strokeWidth="2" strokeLinecap="round"/></svg>
    ),
    key: "feat2",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21h8" strokeWidth="2" strokeLinecap="round"/><path d="M13 3l8 8-3 3-8-8z" strokeWidth="2"/><path d="M8 8l8 8-3 3-8-8z" strokeWidth="2"/></svg>
    ),
    key: "feat3",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 21s-7-4.5-9.5-9C.9 8.5 2.5 4 6.5 4c2 0 3.5 1.2 4.5 2.6C12 5.2 13.5 4 15.5 4c4 0 5.6 4.5 4 8-2.5 4.5-9.5 9-9.5 9z" strokeWidth="2"/></svg>
    ),
    key: "feat4",
  },
];

function HeroArt() {
  return (
    <svg viewBox="0 0 420 420" className="w-full max-w-[320px] drop-shadow-[0_18px_30px_rgba(60,20,0,0.28)] sm:max-w-[380px]" xmlns="http://www.w3.org/2000/svg">
      <circle cx="210" cy="210" r="185" fill="rgba(255,255,255,0.14)" />
      <circle cx="210" cy="210" r="150" fill="rgba(255,255,255,0.10)" />
      <g transform="translate(90,90)">
        <rect x="0" y="90" width="46" height="110" rx="6" fill="#FFF3E4" />
        <rect x="60" y="60" width="46" height="140" rx="6" fill="#FFDDB0" />
        <rect x="120" y="20" width="46" height="180" rx="6" fill="#FFFFFF" />
        <rect x="180" y="70" width="46" height="130" rx="6" fill="#FFDDB0" />
        <path d="M0 210 Q113 240 240 210" stroke="#fff" strokeWidth="3" fill="none" opacity=".6" />
        <circle cx="20" cy="80" r="9" fill="#4C7A3B" />
        <circle cx="143" cy="10" r="9" fill="#4C7A3B" />
        <circle cx="200" cy="60" r="9" fill="#4C7A3B" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks: { label: string; href: string; current?: boolean }[] = [
    { label: t("nav.home"), href: "/", current: true },
    { label: t("nav.how"), href: "#how-it-works" },
    { label: t("nav.ngo"), href: "/login" },
    { label: t("nav.admin"), href: "/login" },
    { label: t("nav.reports"), href: "/login" },
  ];

  const stats = [
    { num: t("stat1.num"), label: t("stat1.label"), src: t("stat1.src") },
    { num: t("stat2.num"), label: t("stat2.label"), src: t("stat2.src") },
    { num: t("stat3.num"), label: t("stat3.label"), src: t("stat3.src") },
    { num: t("stat4.num"), label: t("stat4.label"), src: t("stat4.src") },
  ];

  const updates = [
    {
      head: t("upd1.h"),
      items: [
        { txt: t("upd1.i1"), time: "22 Aug 2026" },
        { txt: t("upd1.i2"), time: "21 Aug 2026" },
        { txt: t("upd1.i3"), time: "19 Aug 2026" },
      ],
    },
    {
      head: t("upd2.h"),
      items: [
        { txt: t("upd2.i1"), time: "21 Aug 2026" },
        { txt: t("upd2.i2"), time: "18 Aug 2026" },
        { txt: t("upd2.i3"), time: "15 Aug 2026" },
      ],
    },
    {
      head: t("upd3.h"),
      items: [
        { txt: t("upd3.i1"), time: "20 Aug 2026" },
        { txt: t("upd3.i2"), time: "17 Aug 2026" },
        { txt: t("upd3.i3"), time: "12 Aug 2026" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-cream">
      {/* ---------- Navbar ---------- */}
      <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
        <div className="wrap-app flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="display flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-terracotta to-saffron text-[17px] font-extrabold text-white">
              RS
            </span>
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
      <section className="relative overflow-hidden bg-[linear-gradient(120deg,#D9531E_0%,#D9531E_32%,#E88A4C_55%,#F7DFC8_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="wrap-app relative z-[2] grid items-center gap-10 py-14 text-center sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:text-left">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-4 py-1.5 text-xs font-bold tracking-wide text-white">
              {t("hero.eyebrow")}
            </span>
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
              <Link to="/login" className="btn btn-primary">{t("hero.cta1")}</Link>
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
      <div className="bg-white">
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
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="wrap-app grid items-start gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
          <div>
            <div className="kicker mb-3">{t("about.kicker")}</div>
            <h2 className="display mb-4 text-3xl font-bold text-navy sm:text-[2rem]">{t("about.h2")}</h2>
            <p className="mb-5 max-w-2xl text-[15px] leading-relaxed text-bodytext">{t("about.p")}</p>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {[t("about.links.1"), t("about.links.2"), t("about.links.3"), t("about.links.4")].map((l) => (
                <li key={l}>
                  <Link to="/login" className="flex items-center gap-2 border-b border-dashed border-[#eadfcd] py-2 text-sm font-semibold text-navy hover:text-terracotta">
                    <span className="font-extrabold text-terracotta">→</span> {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-shadow rounded-card border border-[#f1e6d5] bg-white p-6">
            <h4 className="display mb-3 text-base font-bold text-navy">{t("about.card.h")}</h4>
            <p className="mb-2 text-sm text-bodytext">• {t("about.card.p1")}</p>
            <p className="mb-2 text-sm text-bodytext">• {t("about.card.p2")}</p>
            <p className="text-sm text-bodytext">• {t("about.card.p3")}</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-16 sm:py-20">
        <div className="wrap-app">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <div className="kicker mb-2.5">{t("feat.kicker")}</div>
            <h2 className="display text-3xl font-bold text-navy sm:text-[2.1rem]">{t("feat.h2")}</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.key} className="card-shadow rounded-card border-t-[3px] border-saffron bg-white p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-peach [&_svg]:h-6 [&_svg]:w-6 [&_svg]:stroke-terracotta">
                  {f.icon}
                </div>
                <h4 className="display mb-2 text-[15.5px] font-bold text-navy">{t(`${f.key}.h`)}</h4>
                <p className="mb-3 text-[13.5px] leading-relaxed text-bodytext">{t(`${f.key}.p`)}</p>
                <a href="#how-it-works" className="text-xs font-bold text-terracotta hover:underline">{t("know.more")}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gold banner */}
      <section className="pb-16 pt-2 sm:pb-20">
        <div className="wrap-app">
          <div className="overflow-hidden rounded-[18px] border-[6px] border-saffron bg-white p-0.5">
            <div className="flex flex-col gap-6 rounded-[14px] bg-[linear-gradient(115deg,#2c1a10,#5a2c14_45%,#D9531E_100%)] px-6 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:p-12">
              <div>
                <h3 className="display mb-2 max-w-lg text-2xl font-bold sm:text-[1.7rem]">{t("banner.h")}</h3>
                <p className="max-w-md text-sm text-[#ffdfc2]">{t("banner.p")}</p>
              </div>
              <Link to="/login" className="btn btn-primary shrink-0 self-start sm:self-auto">{t("banner.cta")}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Updates */}
      <section className="bg-white py-16 sm:py-20">
        <div className="wrap-app">
          <div className="kicker mb-8 text-center">{t("updates.kicker")}</div>
          <div className="grid gap-5 md:grid-cols-3">
            {updates.map((u) => (
              <div key={u.head} className="card-shadow overflow-hidden rounded-card bg-white">
                <div className="display bg-navy px-4.5 py-3.5 text-sm font-bold text-white">{u.head}</div>
                <ul className="px-4 py-3.5">
                  {u.items.map((it) => (
                    <li key={it.txt} className="border-b border-[#f2ece2] py-2.5 text-[13.5px] text-heading last:border-none">
                      {it.txt}
                      <time className="mt-0.5 block text-[11.5px] text-bodytext">{it.time}</time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <div className="border-y border-[#f0e4d3] bg-cream py-11">
        <div className="wrap-app">
          <div className="kicker mb-6 text-center">{t("partners.kicker")}</div>
          <div className="flex flex-wrap justify-center gap-6">
            {["NALSA", "DLSA", "eCourts", "NCRB", "Digital India", "Ministry of Law & Justice"].map((b) => (
              <div key={b} className="card-shadow flex h-[78px] w-[78px] items-center justify-center rounded-full bg-white p-1.5 text-center text-[10px] font-extrabold leading-tight text-navy">
                {b}
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
      <footer className="bg-navy pt-12 text-[#c3cad5]">
        <div className="wrap-app grid gap-8 border-b border-white/[0.08] pb-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="display flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-terracotta to-saffron text-[17px] font-extrabold text-white">RS</span>
              <span className="display text-lg font-extrabold text-white">{t("brand.name")}</span>
            </div>
            <p className="mb-0 mt-3.5 text-[13px] text-[#9aa4b2]">{t("hero.sub")}</p>
            <p className="mt-3 text-xs text-[#9aa4b2]">
              <strong className="text-white">{t("footer.hours.k")}</strong> {t("footer.hours.v")}
            </p>
          </div>
          {[
            { h: t("footer.about.h"), links: [t("footer.about.1"), t("footer.about.2"), t("footer.about.3"), t("footer.about.4")] },
            { h: t("footer.legal.h"), links: [t("footer.legal.1"), t("footer.legal.2"), t("footer.legal.3"), t("footer.legal.4")] },
            { h: t("footer.access.h"), links: [t("footer.access.1"), t("footer.access.2"), t("footer.access.3"), t("footer.access.4")] },
          ].map((col) => (
            <div key={col.h}>
              <h5 className="mb-3.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#8993a3]">{col.h}</h5>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l}>
                    <Link to="/login" className="hover:text-saffron">{l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="wrap-app flex flex-wrap justify-between gap-2 py-5 text-xs text-[#7c8595]">
          <span>{t("footer.copyright")}</span>
        </div>
        <div className="border-t border-white/[0.06] py-3.5 text-center text-[11.5px] text-[#7c8595]">
          {t("disclaimer")}
        </div>
      </footer>
    </div>
  );
}
