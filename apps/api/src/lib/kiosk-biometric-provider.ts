/**
 * Auth Layer 2 (Prompt 10) — Aadhaar-linked biometric verification at a jail kiosk.
 *
 * REAL-WORLD SEAM: NIC's Aadhaar-linked biometric authentication for inmates is
 * already operational across the large majority of Indian prisons (MHA advisory +
 * e-Prisons rollout). A production build would capture a live fingerprint at the
 * kiosk and verify it through UIDAI as a registered AUA/KUA — a serious compliance
 * undertaking that is deliberately NOT built here.
 *
 * TODO(UIDAI): swap in a `UidaiAuaKuaBiometricProvider` behind this same interface
 * once the jail has AUA/KUA registration and licensed biometric capture hardware.
 * Only ever persist UIDAI's reference token in Prisoner.aadhaar_ref_token — never
 * a raw Aadhaar number (Aadhaar Act, 2016).
 */

export interface KioskBiometricVerifyInput {
  prisonerRegNo: string;
}

export interface KioskBiometricVerifyResult {
  matched: boolean;
  /** Which modality/provider produced the match (for audit trails). */
  method: string;
}

export interface KioskBiometricAuthProvider {
  verifyFingerprint(input: KioskBiometricVerifyInput): Promise<KioskBiometricVerifyResult>;
}

/**
 * Functional mock for demos: simulates the kiosk "Simulate Fingerprint Scan"
 * button. Any existing registration number matches; a small delay makes the
 * interaction feel like a real scan. Same mock-but-working pattern as
 * MockCourtStatusProvider in Prompt 4.
 */
export class MockKioskBiometricAuthProvider implements KioskBiometricAuthProvider {
  async verifyFingerprint(input: KioskBiometricVerifyInput): Promise<KioskBiometricVerifyResult> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { matched: Boolean(input.prisonerRegNo?.trim()), method: "mock_fingerprint" };
  }
}

export const kioskBiometricProvider: KioskBiometricAuthProvider =
  new MockKioskBiometricAuthProvider();
