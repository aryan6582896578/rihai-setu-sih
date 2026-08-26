import { EmptyState } from "../../components/ui";

/**
 * Job Board (/portal/jobs) — deliberately a shell for this session (Prompt 10).
 * The personalized recommendation engine is a separate team's work.
 *
 * TODO(RECOMMENDER): render the other team's recommendation results here once
 * that engine exists — do NOT fetch/filter/display raw postings from
 * GET /api/v1/job-postings; even an unsorted list would look like "matching",
 * which is explicitly not this component's job.
 */
export default function PortalJobsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Prisoner portal</p>
        <h1 className="page-title">Jobs for me</h1>
        <p className="lede">
          Training you finish here builds your Skill Passport, which helps match you to real work
          after release.
        </p>
      </div>

      <section className="panel">
        <EmptyState
          icon="🧭"
          title="Personalized job matches will appear here soon"
          body="Your skills are being matched with employers looking to hire. Keep completing training programs — every certificate brings the right job closer."
        />
      </section>
    </div>
  );
}
