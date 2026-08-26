import "dotenv/config";

/**
 * End-to-end feature check for RIHAI SETU.
 * Run with the API up:  npx tsx apps/api/scripts/e2e-check.ts
 * Env: BASE_URL (default http://localhost:4000)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:4000";
const API = `${BASE}/api/v1`;
const PASSWORD = "Passw0rd!23";

type Result = { group: string; name: string; ok: boolean; detail: string };

const results: Result[] = [];

function record(group: string, name: string, ok: boolean, detail = "") {
  results.push({ group, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${group}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function login(email: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { status, json } = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (status === 200 && json?.accessToken) return json.accessToken;
    if (status === 429) {
      console.log(`      … rate-limited on ${email}, waiting 20s (attempt ${attempt + 1}/4)`);
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    throw new Error(`login failed for ${email}: ${status}`);
  }
  throw new Error(`login kept failing (rate limit) for ${email}`);
}

async function main() {
  console.log(`\n=== RIHAI SETU E2E CHECK — ${BASE} ===\n`);

  // ---------- 0. health ----------
  const health = await fetch(`${BASE}/healthz`).then((r) => r.status);
  record("infra", "GET /healthz", health === 200, `status=${health}`);

  // ---------- 1. staff logins ----------
  const tokens: Record<string, string> = {};
  for (const [key, email] of Object.entries({
    superadmin: "superadmin@rihai.gov.in",
    sup1: "superintendent1@rihai.gov.in",
    sup2: "superintendent2@rihai.gov.in",
    staff: "staff1a@rihai.gov.in",
    dlsa: "dlsa@rihai.gov.in",
    viewer: "viewer@rihai.gov.in",
    ngo: "ngo1@rihai.gov.in",
  })) {
    try {
      tokens[key] = await login(email);
      record("auth", `login ${email}`, true);
    } catch (e) {
      record("auth", `login ${email}`, false, String(e));
    }
  }

  // ---------- 2. superadmin sees ALL jails ----------
  const saJails = await req("/jails?pageSize=50", { token: tokens.superadmin });
  const saList: any[] = saJails.json?.data ?? [];
  record(
    "rbac-superadmin",
    "sees all 6 jails",
    saJails.status === 200 && saList.length === 6,
    `total=${saJails.json?.total}`,
  );
  const expectedOccupancy: Record<string, number> = {
    "PRIS-DL-07": 194.5,
    "PRIS-MP-05": 147.2,
    "PRIS-MH-04": 143.9,
    "PRIS-JK-03": 148.2,
    "PRIS-ML-01": 164,
    "PRIS-MH-W01": 146.2,
  };
  for (const j of saList) {
    const want = expectedOccupancy[j.code];
    record(
      "psi2024-data",
      `${j.code} occupancy ${j.occupancyPct}%`,
      want !== undefined && Math.abs(j.occupancyPct - want) < 0.15,
      `${j.name}: ${j.currentCount}/${j.sanctionedCapacity}`,
    );
  }

  // ---------- 3. rollups ----------
  const rollup = await req("/overcrowding/rollup", { token: tokens.superadmin });
  record(
    "overcrowding",
    "rollup lists 6 jails",
    rollup.status === 200 && rollup.json?.data?.jails?.length === 6,
    `capacityPct total=${rollup.json?.data?.totals?.capacityPct}`,
  );
  const proj = rollup.json?.data?.projection30;
  record("overcrowding", "30-day projection present", !!proj && typeof proj.projectedSum === "number");

  const RANGE = "from=2024-01-01&to=2026-12-31";
  const complianceRollup = await req(`/compliance-report?${RANGE}`, { token: tokens.superadmin });
  record(
    "compliance",
    "§479 rollup report",
    complianceRollup.status === 200 && typeof complianceRollup.json?.data?.eligibleIdentified === "number",
    `eligible=${complianceRollup.json?.data?.eligibleIdentified}, filed=${complianceRollup.json?.data?.applicationsFiled}`,
  );
  const compExport = await req(`/compliance-report/export?${RANGE}&format=csv`, { token: tokens.superadmin });
  record("compliance", "rollup CSV export", compExport.status === 200 && String(compExport.json ?? "").includes("Compliance") === false ? compExport.status === 200 : false, `status=${compExport.status}`);

  // ---------- 4. catalogs ----------
  const tp = await req("/training-programs", { token: tokens.superadmin });
  record("programs", "training programs listed", tp.status === 200 && (tp.json?.data?.length ?? 0) >= 10, `count=${tp.json?.data?.length}`);
  const skills = await req("/skills/catalog", { token: tokens.superadmin });
  record("skills", "skills catalog", skills.status === 200);
  const templates = await req("/admin/notification-templates", { token: tokens.superadmin });
  record("notifications-admin", "notification templates", templates.status === 200);
  const auditLog = await req("/admin/audit-log", { token: tokens.superadmin });
  record("audit", "audit-log queryable", auditLog.status === 200);
  const notif = await req("/notifications/", { token: tokens.superadmin });
  record("notifications", "user notification inbox", notif.status === 200);

  // ---------- 5. superintendent scoping ----------
  const sup1Jails = await req("/jails", { token: tokens.sup1 });
  const sup1List: any[] = sup1Jails.json?.data ?? [];
  record(
    "rbac-superintendent",
    "superintendent1 sees exactly 1 jail (Yamuna)",
    sup1List.length === 1 && sup1List[0]?.code === "PRIS-DL-07",
    sup1List.map((j) => j.code).join(","),
  );
  const sup2Jails = await req("/jails", { token: tokens.sup2 });
  const sup2List: any[] = sup2Jails.json?.data ?? [];
  record(
    "rbac-superintendent",
    "superintendent2 sees exactly 1 jail (Vindhyachal)",
    sup2List.length === 1 && sup2List[0]?.code === "PRIS-MP-05",
    sup2List.map((j) => j.code).join(","),
  );

  const yamuna = sup1List[0];
  const vid = sup2List[0];

  if (yamuna) {
    const jid = yamuna.id;
    const stats = await req(`/jails/${jid}/stats`, { token: tokens.sup1 });
    record("jail-detail", "jail stats", stats.status === 200 && stats.json?.data?.currentOccupancy === 1951, `occupancy=${stats.json?.data?.currentOccupancy}`);
    const pris = await req(`/jails/${jid}/prisoners?pageSize=5`, { token: tokens.sup1 });
    record("prisoners", "prisoner list (paged)", pris.status === 200 && (pris.json?.data?.length ?? 0) === 5, `total=${pris.json?.total}`);
    const stalls = await req(`/jails/${jid}/stall-list`, { token: tokens.sup1 });
    record("stalls", "stall alerts", stalls.status === 200);
    const staff = await req(`/jails/${jid}/staff`, { token: tokens.sup1 });
    record("staff", "staff roster", staff.status === 200 && (staff.json?.data?.length ?? 0) >= 3);
    const court = await req(`/jails/${jid}/court-tracking`, { token: tokens.sup1 });
    record("court", "court tracking board", court.status === 200);
    const unassigned = await req(`/jails/${jid}/legal-aid/unassigned`, { token: tokens.sup1 });
    record("legal-aid", "unassigned legal aid", unassigned.status === 200);
    const granted = await req(`/jails/${jid}/legal-aid/granted`, { token: tokens.sup1 });
    record("legal-aid", "granted surety list", granted.status === 200);
    const occCur = await req(`/jails/${jid}/overcrowding/current`, { token: tokens.sup1 });
    record(
      "overcrowding",
      "current state matches PSI ratio",
      occCur.status === 200 && Math.abs(occCur.json?.data?.capacityPct - 194.5) < 0.15,
      `capacityPct=${occCur.json?.data?.capacityPct}`,
    );
    const occProj = await req(`/jails/${jid}/overcrowding/projection?days=30`, { token: tokens.sup1 });
    record("overcrowding", "release projection", occProj.status === 200 && occProj.json?.data?.points?.length === 31);
    const backlog = await req(`/jails/${jid}/overcrowding/backlog-breakdown`, { token: tokens.sup1 });
    record("overcrowding", "backlog breakdown", backlog.status === 200);
    const elig = await req(`/jails/${jid}/superintendent/eligible-prisoners`, { token: tokens.sup1 });
    record("superintendent", "eligible §479 queue", elig.status === 200);
    const comp = await req(`/jails/${jid}/compliance-report?${RANGE}`, { token: tokens.sup1 });
    record(
      "compliance",
      "jail compliance report",
      comp.status === 200 && typeof comp.json?.data?.eligibleIdentified === "number",
      `eligible=${comp.json?.data?.eligibleIdentified}`,
    );
    // cross-jail access must be denied
    if (vid) {
      const cross = await req(`/jails/${vid.id}/stats`, { token: tokens.sup1 });
      record("rbac-guard", "superintendent1 blocked from Vindhyachal", cross.status === 403 || cross.status === 404, `status=${cross.status}`);
    }
  }

  // ---------- 6. DLSA sees exactly its 2 assigned jails ----------
  const dlsaJails = await req("/jails?pageSize=50", { token: tokens.dlsa });
  const dlsaList: any[] = dlsaJails.json?.data ?? [];
  record(
    "rbac-dlsa",
    "DLSA lawyer sees exactly 2 jails",
    dlsaList.length === 2,
    dlsaList.map((j) => j.code).join(","),
  );

  // ---------- 7. viewer read-only ----------
  const viewerJails = await req("/jails", { token: tokens.viewer });
  record("rbac-viewer", "viewer scoped to assigned jail", viewerJails.status === 200 && viewerJails.json?.data?.length === 1);

  // ---------- 8. NGO pipeline ----------
  const jobs = await req("/ngo/jobs", { token: tokens.ngo });
  record("ngo", "NGO job postings (own)", jobs.status === 200 && jobs.json?.data?.length === 6, `count=${jobs.json?.data?.length}`);
  const ngoStats = await req("/ngo/stats", { token: tokens.ngo });
  record("ngo", "NGO dashboard stats", ngoStats.status === 200);
  if (saList.length) {
    const anyPris = await req(`/prisoners/${(await req(`/jails/${saList[0].id}/prisoners?pageSize=1`, { token: tokens.superadmin })).json?.data?.[0]?.id}/recommended-jobs`, { token: tokens.superadmin });
    record(
      "recommender",
      "recommended jobs for prisoner (AI svc optional)",
      anyPris.status === 200 || anyPris.status === 502 || anyPris.status === 503,
      `status=${anyPris.status}${anyPris.status !== 200 ? " (recommender offline is acceptable)" : ""}`,
    );
  }

  // ---------- 9. prisoner portal ----------
  const demos = await req("/portal/auth/demo-accounts");
  const demoList: any[] = demos.json?.data ?? [];
  record("portal", "demo accounts advertised", demoList.length >= 3, `count=${demoList.length}`);

  for (const acct of demoList.slice(0, 3)) {
    const loginRes = await req("/portal/auth/login-pin", {
      method: "POST",
      body: JSON.stringify({ prisonerRegNo: acct.prisonerRegNo, pin: "2468" }),
    });
    const ok = loginRes.status === 200 && !!loginRes.json?.accessToken;
    record("portal", `PIN login ${acct.prisonerRegNo}`, ok, acct.jailName);
    if (ok) {
      const tok = loginRes.json.accessToken;
      const profile = await req("/portal/profile", { token: tok });
      record("portal", `profile ${acct.prisonerRegNo}`, profile.status === 200);
      const docs = await req("/portal/documents", { token: tok });
      record("portal", `documents ${acct.prisonerRegNo}`, docs.status === 200, `docs=${docs.json?.data?.length}`);
    }
  }
  const badPin = await req("/portal/auth/login-pin", {
    method: "POST",
    body: JSON.stringify({ prisonerRegNo: demoList[0]?.prisonerRegNo ?? "X", pin: "9999" }),
  });
  record("portal-security", "wrong PIN rejected", badPin.status === 401 || badPin.status === 400 || badPin.status === 423, `status=${badPin.status}`);

  // ---------- summary ----------
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n=== RESULT: ${pass}/${results.length} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E fatal:", e);
  process.exit(1);
});
