"""Validated HTTP models for the FAQ chatbot."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ChatRequest(APIModel):
    message: str = Field(min_length=1, max_length=800)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must contain visible text")
        return value


class FAQPreview(APIModel):
    question: str
    category: str


class KnowledgeSource(APIModel):
    source_id: str
    title: str
    issuer: str
    page: int | None = None
    url: str = ""


class ChatResponse(APIModel):
    answer: str
    matched_question: str | None = None
    category: str | None = None
    confidence: float = Field(ge=0, le=1)
    source: str = Field(
        description="rag, faq, fallback, safety or out_of_scope"
    )
    provider: str | None = Field(
        default=None,
        description="groq or ollama when source is rag",
    )
    sources: list[KnowledgeSource] = Field(default_factory=list)
    escalation_required: bool = False
    suggested_questions: list[FAQPreview] = Field(default_factory=list)


class FAQCatalogResponse(APIModel):
    count: int = Field(ge=0)
    faqs: list[FAQPreview]


class HealthResponse(APIModel):
    status: str = "ok"
    service: str = "rihai-setu-faq-chatbot"


class KnowledgeStatusResponse(APIModel):
    ready: bool
    document_count: int = Field(ge=0)
    chunk_count: int = Field(ge=0)
