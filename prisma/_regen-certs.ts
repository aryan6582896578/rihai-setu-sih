import { prisma } from "../apps/api/src/lib/prisma.js";
import { buildCertificateHtml } from "../apps/api/src/services/certificates.service.js";
import { storage } from "../apps/api/src/lib/storage.js";

async function main(): Promise<void> {
  const completed = await prisma.enrollment.findMany({
    where: { status: "completed" },
    select: { id: true },
  });

  let ok = 0;
  let failed = 0;
  for (const e of completed) {
    try {
      const html = await buildCertificateHtml(e.id);
      await storage.save(`certificates/certificate-${e.id}.html`, html);
      ok++;
    } catch (err) {
      failed++;
      console.error(`failed ${e.id}`, err);
    }
  }
  console.log(`regenerated ${ok} certificates, ${failed} failures`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
