import { FormEvent, useState } from "react";

type Recommendation = {
  job_id: string;
  score: number;
  eligible_for_recommendation: boolean;
  cosine_similarity: number;
  explanation: string;
  matched_required_skills: string[];
  missing_required_skills: string[];
  ineligibility_reasons: string[];
};

type ChatReply = {
  answer: string;
  source: "rag" | "faq" | "fallback" | "safety" | "out_of_scope";
  escalation_required: boolean;
  sources: Array<{
    source_id: string;
    title: string;
    issuer: string;
    page: number | null;
    url: string;
  }>;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  source?: ChatReply["source"];
  sources?: ChatReply["sources"];
};

const jobs = [
  {
    job_id: "JOB-BAKERY-01",
    title: "Bakery Assistant",
    description: "Assist with bread preparation, baking and kitchen hygiene.",
    required_skills: ["baking", "food_preparation"],
    preferred_skills: ["kitchen_hygiene"],
    required_certificates: ["Food Safety"],
    minimum_experience_months: 6,
    job_category: "bakery",
    district: "Thane",
    status: "active",
  },
  {
    job_id: "JOB-LOGISTICS-02",
    title: "Warehouse Support Associate",
    description: "Support stock handling, packing and dispatch operations.",
    required_skills: ["packing", "inventory_management"],
    preferred_skills: ["workplace_safety"],
    required_certificates: [],
    minimum_experience_months: 0,
    job_category: "logistics",
    district: "Mumbai",
    status: "active",
  },
  {
    job_id: "JOB-CARPENTRY-03",
    title: "Carpentry Workshop Helper",
    description: "Assist with woodworking, measuring and workshop safety.",
    required_skills: ["woodworking", "measuring"],
    preferred_skills: ["workplace_safety"],
    required_certificates: [],
    minimum_experience_months: 3,
    job_category: "carpentry",
    district: "Thane",
    status: "active",
  },
];

const jobTitles = Object.fromEntries(jobs.map((job) => [job.job_id, job.title]));
const splitValues = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const readable = (value: string) => value.replaceAll("_", " ");

function friendlyReason(result: Recommendation) {
  const job = jobs.find((item) => item.job_id === result.job_id);
  const matched = result.matched_required_skills.map(readable);
  const missing = result.missing_required_skills.map(readable);

  if (missing.length === 0) {
    const skillSentence = matched.length
      ? `Your verified ${matched.join(" and ")} skills match the core requirements.`
      : "Your profile meets the core requirements for this opportunity.";
    return `${skillSentence} Your experience, certificate and work preferences also make this a strong fit.`;
  }

  const placeSentence = job ? ` The role is based in ${job.district}.` : "";
  return `This role could be a future option, but it needs some preparation first. You would need to build or verify ${missing.join(" and ")} skills before applying.${placeSentence}`;
}

function App() {
  const [page, setPage] = useState<"jobs" | "chatbot">("jobs");
  const [candidateId, setCandidateId] = useState("DEMO-001");
  const [skills, setSkills] = useState("baking, food_preparation, kitchen_hygiene");
  const [certificates, setCertificates] = useState("Food Safety");
  const [experience, setExperience] = useState("8");
  const [district, setDistrict] = useState("Thane");
  const [category, setCategory] = useState("bakery");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [ranking, setRanking] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hello! I can help with jobs, skills, training and the RIHAI SETU portal." },
  ]);

  async function rankJobs(event: FormEvent) {
    event.preventDefault();
    setRanking(true);
    setRecommendationError("");
    try {
      const response = await fetch("/recommender/api/v1/recommendations/rank-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: {
            candidate_id: candidateId,
            verified_skills: splitValues(skills),
            certificates: splitValues(certificates),
            experience_months: Math.max(0, Number(experience) || 0),
            preferred_job_categories: splitValues(category),
            preferred_districts: splitValues(district),
            available_from: null,
            consent: true,
          },
          jobs,
          top_k: 3,
          minimum_score: 0,
          include_ineligible: true,
        }),
      });
      if (!response.ok) throw new Error("The recommender service did not accept this profile.");
      const data = await response.json() as { recommendations: Recommendation[] };
      setRecommendations(data.recommendations);
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "Unable to contact the recommender service.");
    } finally {
      setRanking(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || chatting) return;
    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setChatText("");
    setChatting(true);
    try {
      const response = await fetch("/chatbot/api/v1/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error("The chatbot service did not respond.");
      const data = await response.json() as ChatReply;
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.answer,
          source: data.source,
          sources: data.sources,
        },
      ]);
    } catch (error) {
      setChatMessages((current) => [...current, { role: "assistant", text: "I cannot reach the chatbot right now. Please make sure it is running on port 8001." }]);
    } finally {
      setChatting(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">RIHAI SETU</p>
          <h1>Skills into a fresh start.</h1>
          <p className="hero-copy">Explore explainable job matches and get immediate, respectful support in one simple interface.</p>
        </div>
        <div className="status"><span /> AI services on your computer</div>
      </header>

      <nav className="page-nav" aria-label="AI feature pages">
        <button className={page === "jobs" ? "active" : ""} onClick={() => setPage("jobs")}>Job recommender</button>
        <button className={page === "chatbot" ? "active" : ""} onClick={() => setPage("chatbot")}>Support chatbot</button>
      </nav>

      <section className="feature-page">
        {page === "jobs" &&
        <article className="panel recommender-panel">
          <div className="panel-heading">
            <div className="icon">↗</div>
            <div><h2>Job recommender</h2></div>
          </div>
          <p className="muted">Enter a candidate profile to compare it with three sample jobs. Scores are explainable—not a black box.</p>
          <form onSubmit={rankJobs} className="profile-form">
            <label>Candidate ID<input value={candidateId} onChange={(event) => setCandidateId(event.target.value)} required /></label>
            <label>Verified skills <span>comma-separated</span><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="baking, food_preparation" /></label>
            <label>Certificates <span>comma-separated</span><input value={certificates} onChange={(event) => setCertificates(event.target.value)} placeholder="Food Safety" /></label>
            <div className="row-fields">
              <label>Experience (months)<input type="number" min="0" value={experience} onChange={(event) => setExperience(event.target.value)} /></label>
              <label>Preferred district<input value={district} onChange={(event) => setDistrict(event.target.value)} /></label>
            </div>
            <label>Preferred category<input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
            <button className="primary" disabled={ranking}>{ranking ? "Finding matches…" : "Find matching jobs"}</button>
          </form>
          {recommendationError && <p className="error">{recommendationError} Is the recommender running on port 8000?</p>}
          {recommendations.length > 0 && <div className="results">{recommendations.map((result) => <div className="job-card" key={result.job_id}>
            <div><p className="job-title">{jobTitles[result.job_id] ?? result.job_id}</p><p className="eligibility">{result.eligible_for_recommendation ? "Eligible to recommend" : "Needs attention"}</p></div>
            <strong>{result.score.toFixed(1)}<small>/100</small></strong>
            <p className="explanation">{friendlyReason(result)}</p>
            {result.matched_required_skills.length > 0 && <p className="tags">Your matching skills: {result.matched_required_skills.map(readable).join(", ")}</p>}
            {result.missing_required_skills.length > 0 && <p className="missing">Skills to build: {result.missing_required_skills.map(readable).join(", ")}</p>}
          </div>)}</div>}
        </article>}

        {page === "chatbot" &&
        <article className="panel chat-panel">
          <div className="panel-heading">
            <div className="icon">✦</div>
            <div><h2>Support assistant</h2></div>
          </div>
          <p className="muted">General guidance powered by your local Ollama model, with safety routing for sensitive questions.</p>
          <div className="chat-window" aria-live="polite">
            {chatMessages.map((message, index) => <div className={`message ${message.role}`} key={index}>
              <p>{message.text}</p>
              {message.sources && message.sources.length > 0 && <div className="message-sources">
                <strong>Sources</strong>
                {message.sources.map((source) => source.url ?
                  <a key={`${source.source_id}-${source.page ?? "document"}`} href={source.url} target="_blank" rel="noreferrer">
                    {source.title}{source.page ? ` · page ${source.page}` : ""}
                  </a> :
                  <span key={`${source.source_id}-${source.page ?? "document"}`}>
                    {source.title}{source.page ? ` · page ${source.page}` : ""}
                  </span>
                )}
              </div>}
            </div>)}
            {chatting && <div className="message assistant"><p>Thinking…</p></div>}
          </div>
          <form className="chat-form" onSubmit={sendMessage}>
            <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Ask about jobs, skills or training…" maxLength={800} />
            <button className="send" type="submit" disabled={chatting || !chatText.trim()}>Send</button>
          </form>
          <div className="quick-actions">
            {["How do I apply for a job?", "How can I improve my job match?", "What skills should I learn for bakery work?"].map((question) => <button key={question} onClick={() => setChatText(question)}>{question}</button>)}
          </div>
        </article>}
      </section>
    </main>
  );
}

export default App;
