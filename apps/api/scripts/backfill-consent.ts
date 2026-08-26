import "dotenv/config";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

/**
 * One-shot backfill: reads consent_to_share_profile from the skill-passport
 * workbook and stamps it onto matching prisoners (reg no = prisoner_id).
 * Honest recovery — the flag was never written into notes by the original seed.
 */
interface PassportConsentRow {
  prisoner_id: string;
  consent_to_share_profile: boolean;
}

async function main() {
  const buf = readFileSync(new URL("../../../dataset/prisoner_skill_passport_rehab_600_ncrb.xlsx", import.meta.url));
  const wb = XLSX.read(buf, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as unknown as PassportConsentRow[];

  let granted = 0;
  let denied = 0;
  let missing = 0;
  for (const r of rows) {
    const regNo = String(r.prisoner_id ?? "").trim();
    if (!regNo) continue;
    const prisoner = await prisma.prisoner.findUnique({
      where: { prisonerRegNo: regNo },
      select: { id: true, consentToShareProfile: true },
    });
    if (!prisoner) {
      missing++;
      continue;
    }
    // Only stamp the dataset value; never downgrade a staff-granted true.
    const consent = !!r.consent_to_share_profile;
    if (prisoner.consentToShareProfile !== consent && (consent || !prisoner.consentToShareProfile)) {
      await prisma.prisoner.update({
        where: { id: prisoner.id },
        data: { consentToShareProfile: consent },
      });
    }
    if (consent) granted++;
    else denied++;
  }

  const total = await prisma.prisoner.count();
  const withConsent = await prisma.prisoner.count({ where: { consentToShareProfile: true } });
  console.log(
    `consent-backfill: rows=${rows.length} granted=${granted} denied=${denied} not-in-db=${missing}; ` +
      `prisoners with consent on file: ${withConsent}/${total}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
