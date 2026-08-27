import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, extractApiError } from "../lib/api";
import { portalApi } from "../lib/portalApi";

type ChatbotMode = "staff" | "portal";

interface KnowledgeSource {
  source_id: string;
  title: string;
  issuer: string;
  page?: number | null;
  url: string;
}

interface SuggestedQuestion {
  question: string;
  category: string;
}

interface ChatbotResponse {
  answer: string;
  sources: KnowledgeSource[];
  escalation_required: boolean;
  suggested_questions: SuggestedQuestion[];
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: KnowledgeSource[];
  isSafety?: boolean;
}

const INITIAL_QUESTIONS = [
  "What is Section 479 of the BNSS?",
  "How can an undertrial get legal aid?",
  "How does RIHAI SETU help with undertrial cases?",
];

export default function ChatbotWidget({ mode }: { mode: ChatbotMode }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [suggestions, setSuggestions] = useState(INITIAL_QUESTIONS);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Namaste. I can explain RIHAI SETU, undertrial review, Section 479, legal-aid access and support services. How can I help?",
    },
  ]);
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, open]);

  const sendMessage = async (suggestedMessage?: string) => {
    const message = (suggestedMessage ?? input).trim();
    if (!message || isSending) return;

    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: message },
    ]);
    setInput("");
    setIsSending(true);

    try {
      const client = mode === "portal" ? portalApi : api;
      const endpoint = mode === "portal" ? "/portal/chat/ask" : "/chat/ask";
      const response = await client.post<{ data: ChatbotResponse }>(endpoint, { message });
      const answer = response.data.data;

      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text: answer.answer,
          sources: answer.sources,
          isSafety: answer.escalation_required,
        },
      ]);
      const nextSuggestions = answer.suggested_questions
        .map((item) => item.question)
        .filter((question, index, all) => all.indexOf(question) === index)
        .slice(0, 3);
      if (nextSuggestions.length) setSuggestions(nextSuggestions);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text: extractApiError(error).message,
          isSafety: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <div className="fixed bottom-5 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && (
        <section
          className="mb-3 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#e8ddce] bg-white shadow-[0_18px_55px_rgba(27,36,48,0.22)] sm:w-[390px]"
          aria-label="RIHAI SETU support assistant"
        >
          <header className="flex items-center justify-between bg-navy px-4 py-3.5 text-white">
            <div>
              <p className="display text-base font-bold">RIHAI SETU Assistant</p>
              <p className="mt-0.5 text-[11px] text-white/70">Document-grounded general guidance</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#fdfaf6] p-4" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-md bg-terracotta text-white"
                      : message.isSafety
                        ? "rounded-bl-md border border-amber-200 bg-amber-50 text-navy"
                        : "rounded-bl-md border border-[#eadfce] bg-white text-navy"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {!!message.sources?.length && (
                    <div className="mt-2 border-t border-[#eee4d6] pt-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-bodytext">Sources</p>
                      <ul className="space-y-1">
                        {message.sources.map((source) => (
                          <li key={`${source.source_id}-${source.page ?? "all"}`} className="text-[11px] text-bodytext">
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-terracotta hover:underline"
                              >
                                {source.title}
                              </a>
                            ) : (
                              <span className="font-semibold text-navy">{source.title}</span>
                            )}
                            {source.page ? `, page ${source.page}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-[#eadfce] bg-white px-4 py-3 text-xs text-bodytext">
                  Finding a verified answer…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-[#eee4d6] bg-white p-3">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  disabled={isSending}
                  className="shrink-0 rounded-full border border-[#e7d8c5] bg-cream px-3 py-1.5 text-[10.5px] font-semibold text-navy hover:border-terracotta hover:text-terracotta disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-end gap-2">
              <label htmlFor={`chatbot-message-${mode}`} className="sr-only">Ask the support assistant</label>
              <textarea
                id={`chatbot-message-${mode}`}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 800))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={2}
                placeholder="Ask a general question…"
                className="min-h-11 flex-1 resize-none rounded-xl border border-[#dfd5c7] px-3 py-2 text-[13px] text-navy outline-none focus:border-terracotta"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta text-white hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send question"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
                </svg>
              </button>
            </form>
            <p className="mt-2 text-center text-[9.5px] text-bodytext">
              General information only. Legal decisions require authorised review.
            </p>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-white shadow-[0_10px_28px_rgba(217,83,30,0.35)] transition-transform hover:scale-105 hover:bg-terracotta-dark"
        aria-label={open ? "Close RIHAI SETU assistant" : "Open RIHAI SETU assistant"}
        aria-expanded={open}
      >
        {open ? (
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
        )}
      </button>
    </div>
  );
}
