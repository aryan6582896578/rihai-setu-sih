import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/middleware/errors.js";

// The service reads the normal application config. These fallbacks keep this
// isolated test independent of a developer's local .env values.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("chatbot service bridge", () => {
  it("forwards only the typed message and validates the chatbot response", async () => {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { message: "What is Section 479?" });
      return new Response(
        JSON.stringify({
          answer: "A grounded answer [1].",
          matched_question: null,
          category: null,
          confidence: 0.8,
          source: "rag",
          provider: "groq",
          sources: [
            {
              source_id: "bnss-2023",
              title: "Bharatiya Nagarik Suraksha Sanhita, 2023",
              issuer: "Government of India",
              page: 191,
              url: "https://example.test/bnss.pdf",
            },
          ],
          escalation_required: false,
          suggested_questions: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const { askChatbot } = await import("../src/services/chatbot.service.js");
    const result = await askChatbot("What is Section 479?");

    assert.equal(result.source, "rag");
    assert.equal(result.provider, "groq");
    assert.equal(result.sources[0]?.source_id, "bnss-2023");
  });

  it("returns a controlled API error when the chatbot is unavailable", async () => {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });

    const { askChatbot } = await import("../src/services/chatbot.service.js");

    await assert.rejects(
      () => askChatbot("How can I get legal aid?"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === "CHATBOT_UNAVAILABLE",
    );
  });
});
