import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";

const faqPreviewSchema = z.object({
  question: z.string(),
  category: z.string(),
});

const knowledgeSourceSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  issuer: z.string(),
  page: z.number().int().nullable().optional(),
  url: z.string().default(""),
});

const chatbotResponseSchema = z.object({
  answer: z.string(),
  matched_question: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["rag", "faq", "fallback", "safety", "out_of_scope"]),
  provider: z.enum(["groq", "ollama"]).nullable().optional(),
  sources: z.array(knowledgeSourceSchema).default([]),
  escalation_required: z.boolean().default(false),
  suggested_questions: z.array(faqPreviewSchema).default([]),
});

export type ChatbotResponse = z.infer<typeof chatbotResponseSchema>;

/**
 * Server-to-server bridge to the scoped Python RAG chatbot. Authentication is
 * enforced by the Express routes; no staff/prisoner identity or case data is
 * forwarded to the model.
 */
export async function askChatbot(message: string): Promise<ChatbotResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.CHATBOT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.CHATBOT_URL}/api/v1/chat/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Chatbot returned HTTP ${response.status}`);
    }

    return chatbotResponseSchema.parse(await response.json());
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw ApiError.conflict(
        "The support assistant took too long to respond. Please try again.",
        "CHATBOT_UNAVAILABLE",
      );
    }

    logger.error("Chatbot call failed", error);
    throw ApiError.conflict(
      "The support assistant is temporarily unavailable. Please try again shortly.",
      "CHATBOT_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}
