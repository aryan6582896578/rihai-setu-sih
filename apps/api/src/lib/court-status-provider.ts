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
    const baseDate = filedDate ?? new Date();
    const hearingDate = new Date(baseDate.getTime() + 14 * 86_400_000);
    return { hearingDate, orderOutcome: "granted" };
  }
}

// TODO(eCourts): export class EcourtsApiProvider implements CourtStatusProvider { ... }

export const courtStatusProvider: CourtStatusProvider = new MockCourtStatusProvider();
