import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requirePrisoner, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errors.js";
import { askChatbot } from "../services/chatbot.service.js";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(800),
});

function chatbotLimiter() {
  return rateLimit({
    windowMs: 10 * 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many chatbot questions — please try again shortly.",
      },
    },
  });
}

async function handleAsk(req: AuthedRequest, res: import("express").Response) {
  const { message } = requestSchema.parse(req.body);
  res.json({ data: await askChatbot(message) });
}

/** Available to every authenticated staff role. */
export const chatbotRouter = Router();
chatbotRouter.use(requireAuth, chatbotLimiter());
chatbotRouter.post("/ask", asyncHandler(handleAsk));

/** Separate citizen/prisoner auth domain; staff tokens cannot enter this route. */
export const portalChatbotRouter = Router();
portalChatbotRouter.use(requirePrisoner, chatbotLimiter());
portalChatbotRouter.post("/ask", asyncHandler(handleAsk));
