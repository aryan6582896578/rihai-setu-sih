import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { blindIndex, decryptField, encryptField } from "../src/lib/pii.js";

/**
 * One-shot backfill: encrypts any remaining Tier-1 plaintext on Prisoner rows
 * into the *_enc columns and NULLs the plaintext. Idempotent.
 */
async function main() {
  const prisoners = await prisma.prisoner.findMany();
  let migrated = 0;
  for (const p of prisoners) {
    const needsName = !p.fullNameEnc && p.fullName;
    const needsDob = !p.dateOfBirthEnc && p.dateOfBirth;
    if (!needsName && !needsDob) continue;

    await prisma.prisoner.update({
      where: { id: p.id },
      data: {
        ...(needsName
          ? {
              fullNameEnc: encryptField(p.fullName),
              nameIdx: blindIndex(p.fullName),
              fullName: null,
            }
          : {}),
        ...(needsDob
          ? {
              dateOfBirthEnc: encryptField(p.dateOfBirth!.toISOString().slice(0, 10)),
              dateOfBirth: null,
            }
          : {}),
      },
    });
    migrated++;
  }

  // Sanity: nothing readable may remain.
  const leftover = await prisma.$queryRaw<{ n: bigint }[]>(
    Prisma.sql`SELECT COUNT(*) AS n FROM "Prisoner" WHERE full_name IS NOT NULL OR next_of_kin_name IS NOT NULL OR next_of_kin_phone IS NOT NULL OR photo_url IS NOT NULL`,
  );
  console.log(
    `pii-backfill: encrypted ${migrated} prisoner row(s); plaintext leftovers: ${leftover[0]?.n ?? 0n}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
