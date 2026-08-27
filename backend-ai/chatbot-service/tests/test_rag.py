from app.services.rag import question_is_in_scope, retrieve_context


def test_scope_accepts_project_and_employment_questions() -> None:
    assert question_is_in_scope("How does the RIHAI SETU job recommender work?")
    assert question_is_in_scope("Where can I get skill training?")
    assert question_is_in_scope("What is Section 479 of the BNSS?")


def test_scope_rejects_unrelated_questions() -> None:
    assert not question_is_in_scope("Who won the cricket match yesterday?")
    assert not question_is_in_scope("Write a poem about the moon")


def test_retrieval_finds_website_knowledge() -> None:
    results = retrieve_context("How does the RIHAI SETU job recommender score jobs?")

    assert results
    assert results[0].source_id == "rihai-setu-website"
    assert "recommender" in results[0].text.casefold()


def test_retrieval_finds_skill_training_guidance() -> None:
    results = retrieve_context("What is PMKVY skill training?")

    assert results
    assert any(result.source_id == "msde-pmkvy-4" for result in results)


def test_retrieval_finds_section_479_source() -> None:
    results = retrieve_context("What is Section 479 for undertrial prisoners?")

    assert results
    assert any(result.source_id == "bnss-2023" for result in results)
