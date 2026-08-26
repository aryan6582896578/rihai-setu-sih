"""FAQ chatbot HTTP endpoints."""

from fastapi import APIRouter

from app.schemas import (
    ChatRequest,
    ChatResponse,
    FAQCatalogResponse,
    FAQPreview,
    KnowledgeSource,
    KnowledgeStatusResponse,
)
from app.services.faq_matcher import all_faqs, answer_question
from app.services.rag import knowledge_status


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

    (
        answer,
        match,
        confidence,
        source,
        escalation,
        suggestions,
        retrieved_sources,
        provider,
    ) = answer_question(request.message)
    unique_sources: list[KnowledgeSource] = []
    seen: set[tuple[str, int | None]] = set()
    for item in retrieved_sources:
        key = (item.source_id, item.page)
        if key in seen:
            continue
        seen.add(key)
        unique_sources.append(
            KnowledgeSource(
                source_id=item.source_id,
                title=item.title,
                issuer=item.issuer,
                page=item.page,
                url=item.url,
            )
        )
    return ChatResponse(
        answer=answer,
        matched_question=match.question if match else None,
        category=match.category if match else None,
        confidence=confidence,
        source=source,
        provider=provider,
        sources=unique_sources,
        escalation_required=escalation,
        suggested_questions=[
            _preview(faq.question, faq.category) for faq in suggestions
        ],
    )


@router.get("/knowledge", response_model=KnowledgeStatusResponse)
def get_knowledge_status() -> KnowledgeStatusResponse:
    """Report whether the approved local RAG index is ready."""

    return KnowledgeStatusResponse.model_validate(knowledge_status())
