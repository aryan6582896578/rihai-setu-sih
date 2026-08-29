import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Lightweight EN/हिंदी i18n for the public-facing surfaces (home, login, app chrome).
 * Hindi copy follows the approved translations in backend/rihai-setu-ui (1).html.
 */

export type Lang = "en" | "hi";

const T: Record<Lang, Record<string, string>> = {
  en: {
    "brand.name": "RIHAI SETU",
    "brand.tag": "Rehabilitation Bridge",

    "nav.home": "Home",
    "nav.how": "How it works",
    "nav.applicant_portal": "Citizen portal",
    "nav.admin": "Jails admin",
    "nav.reports": "Reports",
    "nav.ngo": "NGO portal",
    "cta.stafflogin": "Staff login",
    "menu.open": "Menu",

    "hero.eyebrow": "Section 479 BNSS · Undertrial release · Reintegration",
    "hero.sub": "The digital bridge from undertrial release to rehabilitation and reintegration.",
    "hero.desc":
      "Lakhs of undertrial prisoners languish in overcrowded jails even when the law already allows their release. RIHAI SETU identifies who qualifies, accelerates the paperwork, tracks every case through court, and connects skills learnt in custody to jobs outside it.",
    "hero.cta1": "Log in to your portal",
    "hero.cta2": "How it works",

    "mission.title": "Designed for District Legal Services Authorities",
    "mission.note": "Built for seamless integration with NALSA, state DLSAs and prison administrations",

    "stat1.num": "72.6%",
    "stat1.label": "of India's prison inmates are undertrials",
    "stat1.src": "NCRB Prison Statistics India 2024",
    "stat2.num": "3.71 lakh",
    "stat2.label": "undertrials behind bars awaiting trial outcomes",
    "stat2.src": "NCRB Prison Statistics India 2024",
    "stat3.num": "112.7%",
    "stat3.label": "average occupancy across Indian prisons",
    "stat3.src": "NCRB Prison Statistics India 2024",
    "stat4.num": "1/3rd",
    "stat4.label":
      "of max sentence served → first-time offenders can seek release on bond under §479 BNSS",
    "stat4.src": "BNSS, 2023",

    "about.kicker": "About the platform",
    "about.h2": "One workflow, from custody to reintegration",
    "about.p":
      "RIHAI SETU was built after the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 introduced Section 479 — a statutory right to bond for undertrials who have served a third of their maximum sentence. The law already exists; what was missing was a system that surfaces who qualifies, keeps paperwork moving, and follows a person after release.",
    "about.links.1": "About RIHAI SETU",
    "about.links.2": "Roles & access",
    "about.links.3": "How it works",
    "about.links.4": "Reports & data sources",
    "about.card.h": "At a glance",
    "about.card.p1":
      "Deterministic §479 eligibility rules — never entered manually, always recomputed from case facts.",
    "about.card.p2":
      "Every stage of a bail application tracked from flagged to released, with stalls auto-escalated.",
    "about.card.p3":
      "Skill Passport links in-custody training to verified employers after release.",

    "feat.kicker": "What the portal does",
    "feat.h2": "Four systems, one pipeline",
    "feat1.h": "Eligibility screening",
    "feat1.p":
      "Deterministic rules screen every undertrial against Section 479 BNSS criteria — custody duration, offence class, first-offender status.",
    "feat2.h": "Fast-tracked paperwork",
    "feat2.p":
      "Bail and personal-bond applications are formatted into structured grounds narratives for a DLSA lawyer's review — never auto-filed.",
    "feat3.h": "Court tracking",
    "feat3.p":
      "Every application is tracked through filing, hearings and orders. Stalled cases are flagged and escalated automatically.",
    "feat4.h": "Rehabilitation & reintegration",
    "feat4.p":
      "In-custody skill training feeds a Skill Passport that connects released individuals to employers and livelihoods.",
    "know.more": "Know more →",
    "know.back": "← Back to overview",
    "feat1.detail": "Automated Section 479 BNSS Rule Engine",
    "feat1.point1": "Nightly recomputes custody against 1/3rd (first offender) & 1/2 statutory thresholds.",
    "feat1.point2": "Excludes non-bailable offences automatically with zero manual entry errors.",
    "feat2.detail": "DLSA Lawyer Verification & Draft Pre-fill",
    "feat2.point1": "Auto-populates formal court forms with verified custody metrics.",
    "feat2.point2": "Requires explicit review & digital signoff by assigned DLSA advocate.",
    "feat3.detail": "Real-time Court Registry & Escalation Engine",
    "feat3.point1": "Tracks applications across trial court hearing calendars & bail orders.",
    "feat3.point2": "Triggers alert flags for stalled cases & escalates to DLSA Secretary.",
    "feat4.detail": "Verified Skill Passport & Employer Placement",
    "feat4.point1": "Records vocational training hours & certifications from facility workshops.",
    "feat4.point2": "Public QR-code verification connects candidates with post-release jobs.",

    "banner.h": "From an undertrial's cell to a livelihood outside it",
    "banner.p":
      "Skill Passport records vocational training completed in custody and matches it against verified employer openings once release is confirmed by the court.",
    "banner.cta": "See the Skill Passport",

    "updates.kicker": "Latest across the network",
    "upd1.h": "Recent activity",
    "upd1.i1": "Central Correctional Facility — 3 applications advanced to Drafted",
    "upd1.i2": "Special Sub-Jail, Kolar — eligibility recomputed for 12 undertrials",
    "upd1.i3": "District Holding Home, Solapur — 1 stalled case escalated to DLSA",
    "upd2.h": "Case updates",
    "upd2.i1": "Chandan Naik — bail application flagged for §479 review",
    "upd2.i2": "Meena Mirza — court order passed, release pending surety",
    "upd2.i3": "Dinesh Sahu — released, enrolled in tailoring skill program",
    "upd3.h": "Announcements",
    "upd3.i1": "New sanctioned-capacity data uploaded for 5 facilities",
    "upd3.i2": "DLSA lawyer onboarding session — 2 September 2026",
    "upd3.i3": "Skill Passport now supports 6 vocational training tracks",

    "partners.kicker": "Designed for Ecosystem Integration",

    "cta.h": "Working inside the system?",
    "cta.p":
      "Superintendents, jail staff, DLSA lawyers and auditors access the portal through secure role-based accounts.",
    "cta.btn": "Go to staff login",

    "footer.hours.k": "Working hours:",
    "footer.hours.v": "9:00am to 5:30pm (Monday to Friday)",
    "footer.about.h": "About",
    "footer.about.1": "About RIHAI SETU",
    "footer.about.2": "How it works",
    "footer.about.3": "Sources & data",
    "footer.about.4": "Contact us",
    "footer.legal.h": "Legal",
    "footer.legal.1": "Copy Right Policy",
    "footer.legal.2": "Terms & Conditions",
    "footer.legal.3": "Privacy Policy",
    "footer.legal.4": "Accessibility statement",
    "footer.access.h": "Access",
    "footer.access.1": "Staff login",
    "footer.access.2": "Jails admin",
    "footer.access.3": "Demo accounts",
    "footer.access.4": "Report an issue",
    "footer.copyright": "© Content by RIHAI SETU · All Rights Reserved",
    disclaimer: "RIHAI SETU — synthetic demonstration data only. Human decision-makers make all release calls.",
    "src.h": "Sources & references",
    "src.note":
      "RIHAI SETU displays synthetic demonstration data only. It never auto-files or auto-approves anything; all release decisions rest with courts and designated human authorities.",

    "login.back": "← Back to home",
    "login.h": "Staff login",
    "login.lede": "Access is role-based and jail-scoped. Contact your superintendent if you lack access.",
    "login.email": "Email",
    "login.pass": "Password",
    "login.signin": "Sign in",
    "login.signing": "Signing in…",
    "login.forgot": "Forgot password?",
    "login.forgot.done": "If that account exists, a reset has been initiated. The reset token appears in the API server log (no email service yet).",
    "login.mfa.h": "Two-factor verification",
    "login.mfa.lede": "This account is protected by an authenticator app (TOTP). Enter the current 6-digit code.",
    "login.mfa.code": "Authenticator code",
    "login.mfa.verify": "Verify code",
    "login.mfa.verifying": "Verifying…",
    "login.mfa.back": "Back to login",
    "demo.h": "Demo accounts",
    "demo.lede": "Seeded synthetic data for development. Password for all demo accounts:",
    "demo.super.role": "Jail superintendent — Yamuna Central Prison only",
    "demo.staff.role": "Jailor — Yamuna Central Prison only",
    "demo.admin.role": "Super admin — sees all 6 jails",
    "demo.dlsa.role": "DLSA lawyer — Yamuna & Vindhyachal jails only",
    "demo.ngo.role": "NGO partner \u2014 Seva Foundation",
    "demo.send": "Send",

    "sso.or": "or",
    "sso.button": "Login with e-Prisons SSO",
    "sso.badge": "NIC · MeriPehchaan Government Auth",
    "sso.modal.title": "Government SSO coming soon",
    "sso.modal.body":
      "Government SSO coming soon — RIHAI SETU is designed to authenticate jail staff through NIC's MeriPehchaan National Single Sign-On once integrated with e-Prisons. For now, please use your assigned staff login below.",
    "sso.use_staff": "Use staff login instead",

    "app.disclaimer":
      "RIHAI SETU — synthetic demonstration data only. Human decision-makers make all release calls.",
    "app.logout": "Logout",
    "app.mfa": "2FA",
    "app.menu": "Menu",
    "app.notifications": "Notifications",
    "sess.warn": "Your session will expire soon.",
    "sess.stay": "Stay signed in",
    "sess.out": "Sign out",

    // ---- App chrome / jail dashboard ----
    "nav.jails": "All Jails",
    "nav.dataingestion": "Data Ingestion",
    "nav.overcrowding": "Overcrowding ML",
    "role.super_admin": "Super Admin",
    "role.jail_superintendent": "Superintendent",
    "role.jail_staff": "Jail Staff",
    "role.dlsa_lawyer": "DLSA Advocate",
    "role.viewer": "Auditor",
    "role.ngo_partner": "NGO Partner",

    "back.alljails": "← All jails",
    "back.jailportal": "← Jail portal",
    "jailtab.overview": "Overview",
    "jailtab.staff": "Employee Management",
    "jailtab.stalls": "Stall List",
    "btn.prisoners": "Prisoners",
    "link.court": "Court tracking",
    "link.legalaid": "Legal aid",
    "link.overcrowding": "Overcrowding",
    "link.compliance": "Compliance",
    "btn.superportal": "Superintendent portal",
    "stalled.count": "stalled",

    "kpi.occupancy": "Occupancy",
    "kpi.sanctioned": "Sanctioned capacity",
    "kpi.pctcap": "% Capacity",
    "kpi.total": "Total prisoners",
    "kpi.undertrials": "Undertrials",
    "kpi.convicts": "Convicts",
    "kpi.staff": "Active staff",
    "kpi.ofsanctioned": "of sanctioned capacity",

    "recent.h": "Recent activity",
    "recent.sub": "Latest application stage changes and admissions",
    "recent.none": "No recent activity.",

    "emp.lede": "People with JailAccess to this facility.",
    "emp.addstaff": "+ Add staff",
    "emp.close": "Close",
    "emp.created": "Account created.",
    "emp.temp": "Temporary password (shown only once):",
    "th.name": "Name",
    "th.email": "Email",
    "th.role": "Role at jail",
    "th.status": "Status",
    "th.actions": "Actions",
    "status.active": "Active",
    "status.inactive": "Inactive",
    "action.remove": "Remove access",
    "staff.attach": "Attach existing user",
    "staff.create": "Create new user",
    "staff.name.ph": "Full name",
    "staff.email.existing": "Search by registered email",
    "staff.email.new": "New account email",
    "staff.submit.attach": "Attach & assign role",
    "staff.submit.create": "Create with temp password",
    "staff.saving": "Saving…",
    "staff.none.h": "No staff assigned yet",
    "staff.none.b": "Use “Add staff” to attach or create accounts.",
    "staff.icon": "👥",

    "stage.flagged": "Flagged",
    "stage.drafted": "Drafted",
    "stage.filed": "Filed",
    "stage.hearing": "Hearing scheduled",
    "stage.order": "Order passed",
    "stage.released": "Released",

    "stall.intro":
      "Applications exceeding stage thresholds: flagged 3d · drafted 5d · filed 10d · hearing scheduled 14d · order passed→release 3d. Sorted by days stalled.",
    "stall.th.prisoner": "Prisoner",
    "stall.th.case": "Case no.",
    "stall.th.court": "Court",
    "stall.th.stage": "Current stage",
    "stall.th.days": "Days stalled",
    "stall.th.escalation": "Escalation",
    "stall.escalate": "Escalate",
    "stall.escalated": "Escalated",
    "stall.empty.h": "No stalled applications",
    "stall.empty.p": "Cases that do not advance for >14 days in any stage will automatically appear here for Superintendent attention.",

    "portal.nav.tag": "Your portal",
    "portal.nav.profile": "My profile",
    "portal.nav.jobs": "Jobs for me",
    "portal.nav.documents": "Documents",
    "portal.footer": "RIHAI SETU speeds up paperwork only — a judge and the court always make every release decision.",

    "portal.login.back": "← Back to home",
    "portal.login.tag": "Personal account login",
    "portal.login.welcome": "Welcome back",
    "portal.login.desc": "Log in to see your progress, certificates and documents. Your account follows you — same login here at the centre and on your own phone later.",
    "portal.login.regno": "Your ID number",
    "portal.login.regno_ph": "The number on your ID card",
    "portal.login.pin": "Your PIN",
    "portal.login.btn": "Log in",
    "portal.login.nopin": "Don't have a PIN yet? Ask jail staff or Welfare Desk",
    "portal.login.demotitle": "Quick Demo Accounts",
    "portal.login.forgot": "Forgot PIN?",
    "portal.login.firsttime": "First time here? Create a PIN",
    "portal.login.stafflink": "Are you jail staff or DLSA lawyer?",
    "portal.login.stafflink_btn": "Staff & Organisation Login",
    "portal.login.checking": "Checking…",
    "portal.login.saving": "Saving…",
    "portal.login.settingup": "Setting up…",
    "portal.login.createpin": "Create my PIN",
    "portal.login.savepin": "Save my PIN and continue",
    "portal.login.tempnote": "You are using a temporary PIN from the help desk. Pick your own PIN to continue — it stays yours even after you leave.",
    "portal.login.setupnote": "First-time setup happens at the help desk with a staff member nearby. Enter your ID number and pick a 4–6 digit PIN you will remember.",
    "portal.login.backtologin": "← Back to PIN login",

    "portal.profile.kicker": "Prisoner & family portal · read-only",
    "portal.profile.custody": "Time in custody",
    "portal.profile.since": "Since",
    "portal.profile.s479": "Section 479 check",
    "portal.profile.nightly": "Checked nightly by the system",
    "portal.profile.apps": "Case applications",
    "portal.profile.dlsahint": "Handled with DLSA lawyers",
    "portal.profile.s479title": "What Section 479 means for you",
    "portal.profile.disclaimer": "This is only a screening. The court — never this system — decides every release.",
    "portal.profile.progresstitle": "Your application progress",
    "portal.profile.noapp": "No application yet",
    "portal.profile.noappbody": "When the legal team starts your release paperwork it will appear here step by step.",
    "portal.profile.lastchecked": "Last checked",

    "portal.stage.flagged": "Flagged for help",
    "portal.stage.drafted": "Papers being prepared",
    "portal.stage.filed": "Filed in court",
    "portal.stage.hearing": "Hearing date fixed",
    "portal.stage.order": "Court order passed",
    "portal.stage.released": "Released",

    "portal.jobs.kicker": "Prisoner & family portal",
    "portal.jobs.title": "Jobs for me",
    "portal.jobs.lede": "Training you finish here builds your Skill Passport, which helps match you to real work after release.",
    "portal.jobs.emptytitle": "Personalized job matches will appear here soon",
    "portal.jobs.emptybody": "Your skills are being matched with employers looking to hire. Keep completing training programs — every certificate brings the right job closer.",

    "portal.docs.kicker": "Prisoner & family portal",
    "portal.docs.title": "Certificates & documents",
    "portal.docs.lede": "Your Skill Passport certificates and copies of court paperwork that has been filed and checked by a lawyer.",
    "portal.docs.certstitle": "Skill Passport certificates",
    "portal.docs.nocerts": "No certificates yet",
    "portal.docs.nocertsbody": "Complete a training program to earn your first certificate.",
    "portal.docs.appstitle": "Application documents",
    "portal.docs.noapps": "Nothing here yet",
    "portal.docs.noappsbody": "Once your release papers are filed in court and reviewed by a lawyer, a copy appears here. Drafts stay private until then.",
    "portal.docs.certlabel": "Certificate",
    "portal.docs.doclabel": "Court document",
    "portal.docs.open": "Open ↗",
  },

  hi: {
    "brand.name": "रिहाई सेतु",
    "brand.tag": "पुनर्वास सेतु",

    "nav.home": "मुखपृष्ठ",
    "nav.how": "यह कैसे काम करता है",
    "nav.applicant_portal": "नागरिक पोर्टल",
    "nav.admin": "जेल प्रशासन",
    "nav.reports": "रिपोर्ट",
    "nav.ngo": "एनजीओ पोर्टल",
    "cta.stafflogin": "स्टाफ लॉगिन",
    "menu.open": "मेन्यू",

    "hero.eyebrow": "धारा 479 बीएनएसएस · विचाराधीन रिहाई · पुनर्एकीकरण",
    "hero.sub": "विचाराधीन कैदियों की रिहाई से पुनर्वास और पुनर्एकीकरण तक का डिजिटल सेतु।",
    "hero.desc":
      "लाखों विचाराधीन कैदी भीड़भाड़ वाली जेलों में तब भी बंद रहते हैं जब कानून पहले से ही उनकी रिहाई की अनुमति देता है। रिहाई सेतु यह पहचानता है कि कौन पात्र है, कागज़ी कार्रवाई तेज़ करता है, हर मामले को अदालत में ट्रैक करता है, और हिरासत में सीखे गए कौशल को बाहर की नौकरियों से जोड़ता है।",
    "hero.cta1": "अपने पोर्टल में लॉग इन करें",
    "hero.cta2": "यह कैसे काम करता है",

    "mission.title": "जिला कानूनी सेवा प्राधिकरणों हेतु निर्मित",
    "mission.note": "नालसा, राज्य डीएलएसए और जेल प्रशासनों के साथ एकीकरण हेतु डिज़ाइन किया गया",

    "stat1.num": "72.6%",
    "stat1.label": "भारत के जेल कैदियों में विचाराधीन कैदियों का हिस्सा",
    "stat1.src": "एनसीआरबी जेल सांख्यिकी भारत 2024",
    "stat2.num": "3.71 लाख",
    "stat2.label": "विचाराधीन कैदी सुनवाई के परिणाम की प्रतीक्षा में",
    "stat2.src": "एनसीआरबी जेल सांख्यिकी भारत 2024",
    "stat3.num": "112.7%",
    "stat3.label": "भारतीय जेलों में औसत क्षमता उपयोग",
    "stat3.src": "एनसीआरबी जेल सांख्यिकी भारत 2024",
    "stat4.num": "1/3",
    "stat4.label": "अधिकतम सजा की अवधि पूरी होने पर → प्रथम बार अपराधी धारा 479 बीएनएसएस के तहत बॉन्ड पर रिहाई मांग सकते हैं",
    "stat4.src": "बीएनएसएस, 2023",

    "about.kicker": "प्लेटफ़ॉर्म के बारे में",
    "about.h2": "हिरासत से पुनर्एकीकरण तक, एक ही वर्कफ़्लो",
    "about.p":
      "भारतीय नागरिक सुरक्षा संहिता (बीएनएसएस), 2023 द्वारा धारा 479 लागू किए जाने के बाद रिहाई सेतु बनाया गया — यह उन विचाराधीन कैदियों के लिए बॉन्ड का वैधानिक अधिकार है जिन्होंने अपनी अधिकतम सजा का एक-तिहाई हिस्सा पूरा कर लिया है। कानून पहले से मौजूद है; जो कमी थी वह एक ऐसी प्रणाली की जो यह उजागर करे कि कौन पात्र है, कागज़ी कार्रवाई को गतिशील रखे, और रिहाई के बाद व्यक्ति का अनुसरण करे।",
    "about.links.1": "रिहाई सेतु के बारे में",
    "about.links.2": "भूमिकाएँ व पहुँच",
    "about.links.3": "यह कैसे काम करता है",
    "about.links.4": "रिपोर्ट व स्रोत",
    "about.card.h": "एक नज़र में",
    "about.card.p1": "निश्चयात्मक §479 पात्रता नियम — कभी मैन्युअल रूप से दर्ज नहीं, हमेशा मामले के तथ्यों से पुनर्गणना।",
    "about.card.p2": "जमानत आवेदन के हर चरण को फ़्लैग से रिहाई तक ट्रैक किया जाता है, रुकावटों को स्वतः आगे बढ़ाया जाता है।",
    "about.card.p3": "स्किल पासपोर्ट हिरासत में मिले प्रशिक्षण को रिहाई के बाद सत्यापित नियोक्ताओं से जोड़ता है।",

    "feat.kicker": "पोर्टल क्या करता है",
    "feat.h2": "चार प्रणालियाँ, एक पाइपलाइन",
    "feat1.h": "पात्रता जांच",
    "feat1.p": "निश्चयात्मक नियम हर विचाराधीन कैदी की जांच धारा 479 बीएनएसएस मानदंडों — हिरासत अवधि, अपराध वर्ग, प्रथम-अपराधी स्थिति — के आधार पर करते हैं।",
    "feat2.h": "त्वरित कागज़ी कार्रवाई",
    "feat2.p": "जमानत व निजी-बॉन्ड आवेदन वकील की समीक्षा हेतु व्यवस्थित आधार विवरण के साथ तैयार किए जाते हैं — कभी स्वतः दाखिल नहीं होते।",
    "feat3.h": "अदालत ट्रैकिंग",
    "feat3.p": "हर आवेदन को दाखिल करने, सुनवाई और आदेशों के दौरान ट्रैक किया जाता है। रुके हुए मामलों को स्वतः चिह्नित व आगे बढ़ाया जाता है।",
    "feat4.h": "पुनर्वास व पुनर्एकीकरण",
    "feat4.p": "हिरासत में मिला कौशल प्रशिक्षण एक स्किल पासपोर्ट में दर्ज होता है जो रिहा व्यक्तियों को नियोक्ताओं व आजीविका से जोड़ता है।",
    "know.more": "अधिक जानें →",
    "know.back": "← विवरण पर वापस जाएँ",
    "feat1.detail": "स्वचालित धारा 479 बीएनएसएस नियम इंजन",
    "feat1.point1": "प्रतिरात 1/3 (प्रथम अपराधी) और 1/2 वैधानिक सीमाओं के विरुद्ध हिरासत अवधि की जांच।",
    "feat1.point2": "गैर-जमानती अपराधों को स्वचालित रूप से बाहर करता है — शून्य मैन्युअल त्रुटि।",
    "feat2.detail": "डीएलएसए वकील सत्यापन व ड्राफ्ट प्री-फिल",
    "feat2.point1": "सत्यापित हिरासत मेट्रिक्स के साथ औपचारिक अदालत फॉर्म भरता है।",
    "feat2.point2": "डीएलएसए वकील द्वारा स्पष्ट समीक्षा और डिजिटल हस्ताक्षर आवश्यक।",
    "feat3.detail": "अदालत रजिस्ट्री और एस्केलेशन इंजन",
    "feat3.point1": "ट्रायल कोर्ट की सुनवाई तिथियों व ज़मानत आदेशों में आवेदनों को ट्रैक करता है।",
    "feat3.point2": "रुके मामलों के लिए अलर्ट ट्रिगर करता है और डीएलएसए सचिव को भेजता है।",
    "feat4.detail": "सत्यापित स्किल पासपोर्ट और नियोक्ता नियुक्ति",
    "feat4.point1": "जेल कार्यशालाओं से व्यावसायिक प्रशिक्षण घंटे और प्रमाण पत्र दर्ज करता है।",
    "feat4.point2": "सार्वजनिक क्यूआर-कोड सत्यापन रिहा उम्मीदवारों को नौकरियों से जोड़ता है।",

    "banner.h": "विचाराधीन कैदी की कोठरी से बाहर आजीविका तक",
    "banner.p": "स्किल पासपोर्ट हिरासत में पूरे किए गए व्यावसायिक प्रशिक्षण को दर्ज करता है और अदालत से रिहाई की पुष्टि होते ही सत्यापित नियोक्ता रिक्तियों से मिलान करता है।",
    "banner.cta": "स्किल पासपोर्ट देखें",

    "updates.kicker": "नेटवर्क भर की ताज़ा जानकारी",
    "upd1.h": "हाल की गतिविधि",
    "upd1.i1": "केंद्रीय सुधार गृह — 3 आवेदन 'ड्राफ्टेड' चरण में आगे बढ़े",
    "upd1.i2": "विशेष उप-कारागार, कोलार — 12 विचाराधीन कैदियों की पात्रता पुनर्गणना",
    "upd1.i3": "जिला होल्डिंग होम, सोलापुर — 1 रुका हुआ मामला डीएलएसए को भेजा गया",
    "upd2.h": "केस अपडेट",
    "upd2.i1": "चंदन नाइक — जमानत आवेदन §479 समीक्षा हेतु चिह्नित",
    "upd2.i2": "मीना मिर्ज़ा — अदालत का आदेश पारित, ज़मानतदार लंबित",
    "upd2.i3": "दिनेश साहू — रिहा, दर्ज़ी प्रशिक्षण कार्यक्रम में नामांकित",
    "upd3.h": "घोषणाएँ",
    "upd3.i1": "5 सुविधाओं के लिए नई स्वीकृत-क्षमता डेटा अपलोड की गई",
    "upd3.i2": "डीएलएसए वकील ऑनबोर्डिंग सत्र — 2 सितंबर 2026",
    "upd3.i3": "स्किल पासपोर्ट अब 6 व्यावसायिक प्रशिक्षण ट्रैक का समर्थन करता है",

    "partners.kicker": "लक्षित पारिस्थितिकी तंत्र व एकीकरण",

    "cta.h": "सिस्टम के भीतर काम कर रहे हैं?",
    "cta.p": "अधीक्षक, जेल स्टाफ, डीएलएसए वकील व लेखा परीक्षक सुरक्षित भूमिका-आधारित खातों से पोर्टल तक पहुँचते हैं।",
    "cta.btn": "स्टाफ लॉगिन पर जाएँ",

    "footer.hours.k": "कार्य समय:",
    "footer.hours.v": "सुबह 9:00 से शाम 5:30 बजे तक (सोमवार से शुक्रवार)",
    "footer.about.h": "परिचय",
    "footer.about.1": "रिहाई सेतु के बारे में",
    "footer.about.2": "यह कैसे काम करता है",
    "footer.about.3": "स्रोत व डेटा",
    "footer.about.4": "संपर्क करें",
    "footer.legal.h": "कानूनी",
    "footer.legal.1": "कॉपीराइट नीति",
    "footer.legal.2": "नियम व शर्तें",
    "footer.legal.3": "गोपनीयता नीति",
    "footer.legal.4": "सुगम्यता विवरण",
    "footer.access.h": "पहुँच",
    "footer.access.1": "स्टाफ लॉगिन",
    "footer.access.2": "जेल प्रशासन",
    "footer.access.3": "डीएमो खाते",
    "footer.access.4": "समस्या दर्ज करें",
    "footer.copyright": "© सामग्री रिहाई सेतु द्वारा · सर्वाधिकार सुर्क्षित",
    disclaimer: "रिहाई सेतु — केवल सिंथेटिक प्रदर्शन डेटा। सभी रिहाई निर्णय मानव निर्णयकर्ता ही लेते हैं।",
    "src.h": "स्रोत व संदर्भ",
    "src.note":
      "रिहाई सेतु केवल सिंथेटिक प्रदर्शन डेटा दिखाता है। यह कभी भी स्वतः दाखिल या स्वतः स्वीकृत नहीं करता; सभी रिहाई निर्णय अदालतों और नामित मानव प्राधिकरणों पर निर्भर हैं।",

    "login.back": "← मुखपृष्ठ पर वापस",
    "login.h": "स्टाफ लॉगिन",
    "login.lede": "पहुँच भूमिका-आधारित और जेल-सीमित है। यदि आपके पास पहुँच नहीं है तो अपने अधीक्षक से संपर्क करें।",
    "login.email": "ईमेल",
    "login.pass": "पासवर्ड",
    "login.signin": "साइन इन करें",
    "login.signing": "साइन इन हो रहा है…",
    "login.forgot": "पासवर्ड भूल गए?",
    "login.forgot.done": "यदि वह खाता मौजूद है, तो रीसेट प्रारंभ कर दिया गया है। रीसेट टोकन API सर्वर लॉग में दिखाई देगा (अभी कोई ईमेल सेवा नहीं है)।",
    "login.mfa.h": "दो-चरणीय सत्यापन",
    "login.mfa.lede": "यह खाता एक ऑथेंटिकेटर ऐप (TOTP) से सुरक्षित है। वर्तमान 6-अंकीय कोड दर्ज करें।",
    "login.mfa.code": "ऑथेंटिकेटर कोड",
    "login.mfa.verify": "कोड सत्यापित करें",
    "login.mfa.verifying": "सत्यापित हो रहा है…",
    "login.mfa.back": "लॉगिन पर वापस",
    "demo.h": "डेमो खाते",
    "demo.lede": "विकास हेतु सिंथेटिक डेटा। सभी डेमो खातों का पासवर्ड:",
    "demo.super.role": "जेल अधीक्षक (केवल यमुना केंद्रीय कारागार)",
    "demo.staff.role": "जेलर — यमुना केंद्रीय कारागार",
    "demo.admin.role": "सुपर एडमिन — सभी 6 जेलें",
    "demo.dlsa.role": "डीएलएसए वकील — केवल यमुना और विंध्याचल जेलें",
    "demo.ngo.role": "एनजीओ साझेदार — सेवा फ़ाउंडेशन",
    "demo.send": "भेजें",

    "sso.or": "या",
    "sso.button": "e-Prisons SSO से लॉगिन करें",
    "sso.badge": "NIC · MeriPehchaan सरकारी प्रमाणीकरण",
    "sso.modal.title": "सरकारी SSO जल्द आ रहा है",
    "sso.modal.body":
      "सरकारी SSO जल्द आ रहा है — रिहाई सेतु को e-Prisons के साथ एकीकृत होने पर NIC के MeriPehchaan राष्ट्रीय सिंगल साइन-ऑन के माध्यम से जेल स्टाफ को प्रमाणित करने के लिए डिज़ाइन किया गया है। तब तक, कृपया नीचे अपना आवंटित स्टाफ लॉगिन उपयोग करें।",
    "sso.use_staff": "इसके बजाय स्टाफ लॉगिन उपयोग करें",

    "app.disclaimer": "रिहाई सेतु — केवल सिंथेटिक प्रदर्शन डेटा। सभी रिहाई निर्णय मानव निर्णयकर्ता ही लेते हैं।",
    "app.logout": "लॉगआउट",
    "app.mfa": "2FA",
    "sess.warn": "आपका सत्र जल्द समाप्त होने वाला है।",
    "sess.stay": "साइन इन रहें",
    "sess.out": "साइन आउट",
    "app.menu": "मेन्यू",
    "app.notifications": "सूचनाएँ",

    // ---- App chrome / jail dashboard ----
    "nav.jails": "जेलें",
    "nav.dataingestion": "डेटा प्रविष्टि",
    "nav.overcrowding": "अतिभीड़ एमएल",
    "role.super_admin": "सुपर एडमिन",
    "role.jail_superintendent": "जेल अधीक्षक",
    "role.jail_staff": "जेल स्टाफ",
    "role.dlsa_lawyer": "डीएलएसए अधिवक्ता",
    "role.viewer": "लेखा परीक्षक",
    "role.ngo_partner": "एनजीओ पार्टनर",

    "back.alljails": "← सभी जेलें",
    "back.jailportal": "← जेल पोर्टल",
    "jailtab.overview": "अवलोकन",
    "jailtab.staff": "कर्मचारी प्रबंधन",
    "jailtab.stalls": "रुके मामलों की सूची",
    "btn.prisoners": "कैदी",
    "link.court": "अदालत ट्रैकिंग",
    "link.legalaid": "विधिक सहायता",
    "link.overcrowding": "जेल अधिभोग",
    "link.compliance": "अनुपालन रिपोर्ट",
    "btn.superportal": "अधीक्षक पोर्टल",
    "stalled.count": "रुका हुआ",

    "kpi.occupancy": "अधिभोग",
    "kpi.sanctioned": "स्वीकृत क्षमता",
    "kpi.pctcap": "% क्षमता",
    "kpi.total": "कुल कैदी",
    "kpi.undertrials": "विचाराधीन कैदी",
    "kpi.convicts": "दोषसिद्ध कैदी",
    "kpi.staff": "सक्रिय स्टाफ",
    "kpi.ofsanctioned": "स्वीकृत क्षमता का",

    "recent.h": "हाल की गतिविधि",
    "recent.sub": "नवीनतम आवेदन चरण परिवर्तन व प्रवेश",
    "recent.none": "कोई हालिया गतिविधि नहीं।",

    "emp.lede": "इस सुविधा तक जेल-पहुँच रखने वाले लोग।",
    "emp.addstaff": "+ स्टाफ जोड़ें",
    "emp.close": "बंद करें",
    "emp.created": "खाता बनाया गया।",
    "emp.temp": "अस्थायी पासवर्ड (केवल एक बार दिखेगा):",
    "th.name": "नाम",
    "th.email": "ईमेल",
    "th.role": "जेल में भूमिका",
    "th.status": "स्थिति",
    "th.actions": "कार्रवाई",
    "status.active": "सक्रिय",
    "status.inactive": "निष्क्रिय",
    "action.remove": "पहुँच हटाएँ",
    "staff.attach": "मौजूदा उपयोगकर्ता जोड़ें",
    "staff.create": "नया उपयोगकर्ता बनाएँ",
    "staff.name.ph": "पूरा नाम",
    "staff.email.existing": "पंजीकृत ईमेल खोजें",
    "staff.email.new": "नए खाते का ईमेल",
    "staff.submit.attach": "जोड़ें और भूमिका सौंपें",
    "staff.submit.create": "अस्थायी पासवर्ड के साथ बनाएँ",
    "staff.saving": "सहेज रहे हैं…",
    "staff.none.h": "अभी कोई स्टाफ आवंटित नहीं",
    "staff.none.b": "खाते जोड़ने या बनाने के लिए “स्टाफ जोड़ें” उपयोग करें।",
    "staff.icon": "👥",

    "stage.flagged": "चिह्नित",
    "stage.drafted": "ड्राफ्टेड",
    "stage.filed": "दाखिल",
    "stage.hearing": "सुनवाई नियत",
    "stage.order": "आदेश पारित",
    "stage.released": "रिहा",

    "stall.intro":
      "चरण-सीमा पार करने वाले आवेदन: चिह्नित 3 दिन · ड्राफ्टेड 5 दिन · दाखिल 10 दिन · सुनवाई नियत 14 दिन · आदेश→रिहाई 3 दिन। रुके दिनों के अनुसार क्रम।",
    "stall.th.prisoner": "कैदी",
    "stall.th.case": "केस नं.",
    "stall.th.court": "न्यायालय",
    "stall.th.stage": "वर्तमान चरण",
    "stall.th.days": "रुके दिन",
    "stall.th.escalation": "एस्कलेशन",
    "stall.escalate": "एस्कलेट करें",
    "stall.escalated": "एस्कलेट हुआ",
    "stall.empty.h": "फ़िलहाल कुछ भी रुका नहीं है",
    "stall.empty.p": "जो मामले किसी भी चरण में 14 दिनों से अधिक समय तक नहीं बढ़ते, वे यहाँ स्वतः दिखाई देंगे।",

    // ---- Portal Translations (HI) ----
    "portal.nav.tag": "आपका पोर्टल",
    "portal.nav.profile": "मेरी प्रोफ़ाइल",
    "portal.nav.jobs": "मेरे लिए नौकरियां",
    "portal.nav.documents": "दस्तावेज़",
    "portal.footer": "रिहाई सेतु केवल कागजी कार्रवाई में तेजी लाता है — न्यायाधीश और अदालत ही हमेशा हर रिहाई का फैसला करते हैं।",

    "portal.login.back": "← मुखपृष्ठ पर वापस जाएं",
    "portal.login.tag": "व्यक्तिगत खाता लॉगिन",
    "portal.login.welcome": "स्वागत है",
    "portal.login.desc": "अपनी प्रगति, प्रमाण पत्र और दस्तावेज़ देखने के लिए लॉगिन करें। आपका खाता आपके साथ रहता है — केंद्र में और बाद में आपके अपने फोन पर भी वही लॉगिन।",
    "portal.login.regno": "आपका आईडी नंबर",
    "portal.login.regno_ph": "आपके पहचान पत्र पर दर्ज नंबर",
    "portal.login.pin": "आपका पिन (PIN)",
    "portal.login.btn": "लॉगिन करें",
    "portal.login.nopin": "अभी तक पिन नहीं मिला? जेल कर्मचारियों या कल्याण डेस्क से पूछें",
    "portal.login.demotitle": "त्वरित डेमो खाते",
    "portal.login.forgot": "पिन (PIN) भूल गए?",
    "portal.login.firsttime": "यहाँ पहली बार आए हैं? पिन बनाएँ",
    "portal.login.stafflink": "क्या आप जेल कर्मचारी या डीएलएसए वकील हैं?",
    "portal.login.stafflink_btn": "स्टाफ एवं संगठन लॉगिन",
    "portal.login.checking": "जांच हो रही है…",
    "portal.login.saving": "सहेजा जा रहा है…",
    "portal.login.settingup": "पिन सेट हो रहा है…",
    "portal.login.createpin": "अपना पिन बनाएँ",
    "portal.login.savepin": "अपना पिन सहेजें और जारी रखें",
    "portal.login.tempnote": "आप सहायता डेस्क से प्राप्त अस्थायी पिन का उपयोग कर रहे हैं। जारी रखने के लिए अपना पिन चुनें — यह आपके जाने के बाद भी आपका रहेगा।",
    "portal.login.setupnote": "पहली बार सेटअप सहायता डेस्क पर पास में एक कर्मचारी के साथ होता है। अपना आईडी नंबर दर्ज करें और याद रखने योग्य 4-6 अंकों का पिन चुनें।",
    "portal.login.backtologin": "← पिन लॉगिन पर वापस जाएँ",

    "portal.profile.kicker": "बंदी एवं परिवार पोर्टल · केवल पढ़ें",
    "portal.profile.custody": "हिरासत में बिताया समय",
    "portal.profile.since": "से",
    "portal.profile.s479": "धारा 479 जांच",
    "portal.profile.nightly": "सिस्टम द्वारा प्रतिदिन रात्रि में जांचा गया",
    "portal.profile.apps": "मामले के आवेदन",
    "portal.profile.dlsahint": "डीएलएसए वकीलों के साथ संचालित",
    "portal.profile.s479title": "धारा 479 का आपके लिए क्या अर्थ है",
    "portal.profile.disclaimer": "यह केवल एक प्रारंभिक जांच है। अदालत ही — कभी भी यह प्रणाली नहीं — हर रिहाई का फैसला करती है।",
    "portal.profile.progresstitle": "आपके आवेदन की प्रगति",
    "portal.profile.noapp": "अभी तक कोई आवेदन नहीं",
    "portal.profile.noappbody": "जब कानूनी टीम आपकी रिहाई की कागजी कार्रवाई शुरू करेगी, तो वह चरण-दर-चरण यहां दिखाई देगी।",
    "portal.profile.lastchecked": "अंतिम जांच",

    "portal.stage.flagged": "सहायता हेतु चिह्नित",
    "portal.stage.drafted": "कागजात तैयार हो रहे हैं",
    "portal.stage.filed": "अदालत में दायर",
    "portal.stage.hearing": "सुनवाई की तारीख तय",
    "portal.stage.order": "अदालत आदेश पारित",
    "portal.stage.released": "रिहा कर दिया गया",

    "portal.jobs.kicker": "बंदी एवं परिवार पोर्टल",
    "portal.jobs.title": "मेरे लिए नौकरियां",
    "portal.jobs.lede": "यहां पूरी की गई ट्रेनिंग आपका स्किल पासपोर्ट बनाती है, जो रिहाई के बाद आपको वास्तविक काम से जोड़ने में मदद करती है।",
    "portal.jobs.emptytitle": "व्यक्तिगत नौकरी के अवसर जल्द ही यहां दिखाई देंगे",
    "portal.jobs.emptybody": "आपके कौशलों का मिलान रोजगार देने वाले नियोक्ताओं से किया जा रहा है। प्रशिक्षण कार्यक्रम पूरे करते रहें — हर प्रमाण पत्र सही नौकरी के करीब लाता है।",

    "portal.docs.kicker": "बंदी एवं परिवार पोर्टल",
    "portal.docs.title": "प्रमाण पत्र और दस्तावेज़",
    "portal.docs.lede": "आपके स्किल पासपोर्ट प्रमाण पत्र और अदालत के कागजात की प्रतियां जो वकील द्वारा दायर और जांची गई हैं।",
    "portal.docs.certstitle": "स्किल पासपोर्ट प्रमाण पत्र",
    "portal.docs.nocerts": "अभी तक कोई प्रमाण पत्र नहीं",
    "portal.docs.nocertsbody": "अपना पहला प्रमाण पत्र अर्जित करने के लिए प्रशिक्षण कार्यक्रम पूरा करें।",
    "portal.docs.appstitle": "आवेदन दस्तावेज़",
    "portal.docs.noapps": "यहां अभी तक कुछ नहीं है",
    "portal.docs.noappsbody": "एक बार जब आपके रिहाई के कागजात अदालत में दायर और वकील द्वारा समीक्षा किए जाते हैं, तो प्रति यहां दिखाई देती है। तब तक ड्राफ्ट निजी रहते हैं।",
    "portal.docs.certlabel": "प्रमाण पत्र",
    "portal.docs.doclabel": "अदालती दस्तावेज़",
    "portal.docs.open": "खोलें ↗",
  },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "rs_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return saved === "hi" ? "hi" : "en";
  });

  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
    document.documentElement.style.setProperty(
      "--font-display",
      lang === "hi" ? "'Noto Serif Devanagari','Fraunces',Georgia,serif" : "'Fraunces','Noto Serif Devanagari',Georgia,serif",
    );
    document.documentElement.style.setProperty(
      "--font-body",
      lang === "hi" ? "'Noto Sans Devanagari','Manrope',system-ui,sans-serif" : "'Manrope','Noto Sans Devanagari',system-ui,sans-serif",
    );
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // private mode etc. — in-memory language still works
    }
  }, []);

  const t = useCallback((key: string) => T[lang][key] ?? T.en[key] ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx;
}

/** EN / हिंदी pill toggle matching the design mock's util-bar control. */
export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const base = dark
    ? "border border-white/35 bg-white/15"
    : "border-[1.5px] border-[#e9e0d1] bg-white";
  const activeCls = dark ? "bg-saffron text-navy" : "bg-terracotta text-white";
  const idleCls = dark ? "text-white/80" : "text-navy/70";
  return (
    <div className={`flex gap-0.5 rounded-full p-0.5 ${base}`} role="group" aria-label="Language">
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold tracking-wide transition ${
            lang === l ? activeCls : `${idleCls} hover:text-terracotta`
          }`}
        >
          {l === "en" ? "EN" : "हिंदी"}
        </button>
      ))}
    </div>
  );
}
