"""FAQ chatbot HTTP endpoints."""

from fastapi import APIRouter

from app.schemas import ChatRequest, ChatResponse, FAQCatalogResponse, FAQPreview
from app.services.faq_matcher import all_faqs, answer_question


router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


def _preview(question: str, category: str) -> FAQPreview:
    return FAQPreview(question=question, category=category)


@router.get("/faqs", response_model=FAQCatalogResponse)
def list_faqs() -> FAQCatalogResponse:
    """List approved FAQ prompts for UI quick-action buttons."""

    faqs = all_faqs()
    return FAQCatalogResponse(
        count=len(faqs),
        faqs=[_preview(faq.question, faq.category) for faq in faqs],
    )


@router.post("/ask", response_model=ChatResponse)
def ask_question(request: ChatRequest) -> ChatResponse:
    """Answer only from approved FAQ entries or a safe escalation message."""

    answer, match, confidence, source, escalation, suggestions = answer_question(
        request.message
    )
    return ChatResponse(
        answer=answer,
        matched_question=match.question if match else None,
        category=match.category if match else None,
        confidence=confidence,
        source=source,
        escalation_required=escalation,
        suggested_questions=[
            _preview(faq.question, faq.category) for faq in suggestions
        ],
    )
