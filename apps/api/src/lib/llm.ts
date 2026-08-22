export interface GroundsFacts {
  prisonerName: string;
  prisonerRegNo: string;
  jailName: string;
  caseNumber: string;
  courtName: string;
  offence: string;
  maxSentenceYears: number;
  custodyDays: number;
  eligibilityReason: string;
  applicationType: "bail" | "personal_bond";
}

export interface NarrativeResult {
  text: string;
  source: "openai" | "template";
}

function templateNarrative(f: GroundsFacts): string {
  const months = Math.floor(f.custodyDays / 30.4375);
  const days = Math.floor(f.custodyDays - months * 30.4375);
  return [
    `The applicant, ${f.prisonerName} (Reg. No. ${f.prisonerRegNo}), is presently detained at ${f.jailName} in connection with Case No. ${f.caseNumber} pending before the ${f.courtName}, for the offence of ${f.offence} carrying a maximum sentence of ${f.maxSentenceYears} year(s). The applicant has already undergone ${months} month(s) and ${days} day(s) of custody.`,
    `As per Section 479 of the Bharatiya Nagarik Suraksha Sanhita, 2023, the period of detention undergone by the applicant satisfies the statutory threshold — ${f.eligibilityReason}. The applicant undertakes to abide by all conditions imposed by this Hon'ble Court and to appear on each and every date of trial. It is therefore most respectfully prayed that the applicant be released on ${f.applicationType === "personal_bond" ? "personal bond" : "bail"} in the interest of justice.`,
  ].join("\n\n");
}

async function openaiNarrative(f: GroundsFacts): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a legal aid assistant drafting the 'grounds for release' section of an application under Section 479 BNSS for an undertrial prisoner in India. Write 1-2 formal paragraphs using ONLY the facts provided. Never invent facts. Do not add a title or signature.",
        },
        {
          role: "user",
          content: JSON.stringify(f),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

/**
 * Server-side only. Uses OpenAI when OPENAI_API_KEY is configured; otherwise a
 * deterministic template fallback so the workflow never blocks. Either way the
 * output is always marked "AI-drafted - pending lawyer review".
 */
export async function draftGroundsNarrative(facts: GroundsFacts): Promise<NarrativeResult> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return { text: await openaiNarrative(facts), source: "openai" };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[llm] falling back to template narrative:", err);
    }
  }
  return { text: templateNarrative(facts), source: "template" };
}
