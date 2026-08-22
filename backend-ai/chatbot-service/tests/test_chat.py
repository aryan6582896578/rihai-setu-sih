from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


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


def test_unknown_question_uses_safe_caseworker_fallback() -> None:
    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "What is the weather on Mars today?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["escalation_required"] is True
    assert body["source"] == "fallback"
    assert "caseworker" in body["answer"].lower()


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


def test_ollama_is_optional_for_unmatched_questions(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_ollama",
        lambda _message: "A local Ollama answer.",
    )

    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How do I write a professional email?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "ollama"
    assert response.json()["answer"] == "A local Ollama answer."


def test_ollama_is_preferred_for_known_normal_questions(monkeypatch) -> None:
    monkeypatch.setattr("app.services.faq_matcher.ollama_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.faq_matcher.ask_ollama",
        lambda _message: "A local Ollama answer.",
    )

    response = client.post(
        "/api/v1/chat/ask",
        json={"message": "How do I apply to a job opening?"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "ollama"
