import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

/**
 * Acceptance proof for Prompt 8: Tier-1 fields must be unreadable from a raw
 * DB dump without the master key. Prints actual raw column values.
 */
async function main() {
  const rows = await prisma.$queryRaw<{
    full_name: string | null;
    full_name_enc: string | null;
    next_of_kin_phone: string | null;
    date_of_birth: Date | null;
  }[]>(Prisma.sql`
    SELECT full_name, full_name_enc, next_of_kin_phone, date_of_birth
    FROM "Prisoner" ORDER BY created_at DESC LIMIT 3
  `);

  console.log("=== RAW DB DUMP (no decryption) ===");
  let allEncrypted = true;
  for (const r of rows) {
    const encLooksRight = !!r.full_name_enc && r.full_name_enc.startsWith("v1:");
    if (!encLooksRight || r.full_name !== null) allEncrypted = false;
    console.log({
      full_name_plaintext: r.full_name,
      full_name_enc_prefix: r.full_name_enc?.slice(0, 40) ?? null,
      enc_format_ok: encLooksRight,
      dob_plaintext_null: r.date_of_birth === null,
    });
  }
  console.log(allEncrypted ? "ENCRYPTION CHECK: PASS" : "ENCRYPTION CHECK: FAIL");

  await prisma.$disconnect();
  process.exit(allEncrypted ? 0 : 1);
}

void main();
