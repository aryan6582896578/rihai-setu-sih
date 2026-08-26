from fastapi.testclient import TestClient
import pytest

from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def disable_ollama_by_default(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: False)
    monkeypatch.setattr("app.services.faq_matcher.groq_enabled", lambda: False)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "rihai-setu-faq-chatbot"


def test_faq_catalog_lists_approved_questions() -> None:
    response = client.get("/api/v1/chat/faqs")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 10
    assert any("apply" in item["question"].lower() for item in body["faqs"])


def test_known_question_returns_approved_answer() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How do I apply to a job opening?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["escalation_required"] is False
    assert body["source"] == "faq"
    assert body["category"] == "Jobs"
    assert "caseworker" in body["answer"].lower()


def test_unrelated_question_is_declined() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "What is the weather on Mars today?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["escalation_required"] is False
    assert body["source"] == "out_of_scope"
    assert "only help" in body["answer"].lower()


def test_sensitive_question_is_not_answered_as_general_advice() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "Can you give me legal advice about my court case?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["escalation_required"] is True
    assert "cannot provide legal" in body["answer"].lower()


def test_self_harm_phrase_uses_safety_escalation() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "I need help with self harm thoughts"},
    )

    assert response.status_code == 200
    assert response.json()["escalation_required"] is True


def test_rag_answers_in_scope_questions_with_sources(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_ollama_grounded",
        lambda _message, _contexts: "A grounded local answer [1].",
    )

    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How do I write an email to an employer?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "rag"
    assert response.json()["provider"] == "ollama"
    assert response.json()["answer"] == "A grounded local answer [1]."
    assert response.json()["sources"]


def test_rag_is_preferred_for_known_normal_questions(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_ollama_grounded",
        lambda _message, _contexts: "A grounded local answer [1].",
    )

    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How do I apply to a job opening?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "rag"
    assert response.json()["provider"] == "ollama"


def test_groq_is_preferred_when_configured(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.groq_enabled", lambda: True)
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_groq_grounded",
        lambda _message, _contexts: "A fast grounded Groq answer [1].",
    )
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_ollama_grounded",
        lambda _message, _contexts: (_ for _ in ()).throw(
            AssertionError("Ollama should not be called after Groq succeeds")
        ),
    )

    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How does the RIHAI SETU recommender work?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "rag"
    assert response.json()["provider"] == "groq"
    assert response.json()["sources"]


def test_knowledge_status_reports_built_index() -> None:
    response = client.get("/api/v1/chat/knowledge")

    assert response.status_code == 200
    assert response.json()["ready"] is True
    assert response.json()["document_count"] == 7
    assert response.json()["chunk_count"] > 100


def test_personal_bail_question_is_escalated() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "Am I eligible for bail in my case?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "safety"
    assert response.json()["escalation_required"] is True
