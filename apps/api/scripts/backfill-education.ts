import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/**
 * One-shot backfill: promotes Education baseline / Machinery skills / Target
 * domain out of the seeded "SKILL PASSPORT" notes into structured Prisoner
 * columns so the NGO portal can surface them. Idempotent — only fills NULLs.
 */
async function main() {
  const notes = await prisma.note.findMany({
    where: { body: { startsWith: "SKILL PASSPORT " } },
    select: { prisonerId: true, body: true },
  });

  let updated = 0;
  for (const n of notes) {
    const grab = (label: string): string | null => {
      const m = n.body.match(new RegExp(`${label}:\\s*(.+)`, "i"));
      const v = m?.[1]?.trim();
      return v && v.toLowerCase() !== "undefined" ? v : null;
    };
    const education = grab("Education baseline");
    const machinery = grab("Machinery skills");
    const target = grab("Target domain")?.split("(")[0]?.trim() ?? null;
    if (!education && !machinery && !target) continue;

    const prisoner = await prisma.prisoner.findUnique({
      where: { id: n.prisonerId },
      select: { educationBaseline: true, machinerySkills: true, targetDomain: true },
    });
    if (!prisoner) continue;

    await prisma.prisoner.update({
      where: { id: n.prisonerId },
      data: {
        ...(prisoner.educationBaseline === null && education ? { educationBaseline: education } : {}),
        ...(prisoner.machinerySkills === null && machinery ? { machinerySkills: machinery } : {}),
        ...(prisoner.targetDomain === null && target ? { targetDomain: target } : {}),
      },
    });
    updated++;
  }

  const withEdu = await prisma.prisoner.count({ where: { educationBaseline: { not: null } } });
  console.log(`education-backfill: scanned ${notes.length} passport note(s), updated ${updated} prisoner(s); prisoners with education on file: ${withEdu}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
