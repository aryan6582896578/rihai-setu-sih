/**
 * Court status adapter seam.
 *
 * RIHAI SETU never decides bail — this adapter only pulls the court's OWN hearing
 * date / order outcome and mirrors it onto the jail's Application record faster than
 * the manual process.
 *
 * TODO(eCourts): implement `EcourtsApiProvider` against the real eCourts API once
 * access is granted. It must satisfy the same interface; swap it in via config.
 */
export interface CourtStatusResult {
  hearingDate?: Date;
  orderOutcome?: "granted" | "denied" | "pending";
}

export interface CourtStatusProvider {
  getStatus(cnrNumber: string, filedDate?: Date): Promise<CourtStatusResult>;
}

export class MockCourtStatusProvider implements CourtStatusProvider {
  async getStatus(cnrNumber: string, filedDate?: Date): Promise<CourtStatusResult> {
    if (!filedDate) return {};

    // Demo accelerator: 1 real second ~= 12 court days, so the mock pipeline visibly
    // progresses during a demo/session without waiting real weeks.
    const daysPerSecond = Number(process.env.MOCK_COURT_DAYS_PER_SECOND ?? "12");
    const elapsedDays = Math.floor(
      ((Date.now() - filedDate.getTime()) / 1000) * daysPerSecond,
    );

    let hash = 0;
    for (const ch of cnrNumber) hash = (hash * 31 + ch.charCodeAt(0)) % 997;

    if (elapsedDays < 7) {
      return { orderOutcome: "pending" };
    }
    const hearingDate = new Date(filedDate.getTime() + 14 * 86_400_000);
    if (elapsedDays < 21) {
      return { hearingDate, orderOutcome: "pending" };
    }
    // Applications created inside RIHAI SETU (mock CNRs) grant reliably so the
    // surety-checklist demo path always works; keep pseudo-random for others.
    const granted = cnrNumber.startsWith("MOCK") ? true : hash % 10 < 7;
    return { hearingDate, orderOutcome: granted ? "granted" : "denied" };
  }
}

// TODO(eCourts): export class EcourtsApiProvider implements CourtStatusProvider { ... }

export const courtStatusProvider: CourtStatusProvider = new MockCourtStatusProvider();
