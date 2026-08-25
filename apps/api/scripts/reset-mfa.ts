import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/** Dev harness only: clears MFA enrollment for an account (used by smoke tests). */
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: tsx reset-mfa.ts <email>");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no user ${email}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecretEnc: null },
  });
  await prisma.refreshSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(`MFA cleared for ${email}`);
  await prisma.$disconnect();
}

void main();
