import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecommendationDto } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { Spinner, EmptyState, ErrorBanner } from "../../components/ui";
import { extractApiError } from "../../lib/api";

export default function PortalJobsPage() {
  const queryClient = useQueryClient();
  const [applySuccessId, setApplySuccessId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["portal-jobs"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: RecommendationDto[] }>("/portal/recommended-jobs");
      return res.data.data;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await portalApi.post(`/portal/jobs/${jobId}/apply`, {
        note: "Submitted directly by candidate via prisoner self-service kiosk",
      });
      return res.data.data;
    },
    onSuccess: (_, jobId) => {
      setApplySuccessId(jobId);
      void queryClient.invalidateQueries({ queryKey: ["portal-jobs"] });
    },
  });

  if (query.isLoading) return <Spinner label="Finding personalized job opportunities..." />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const recommendations = query.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <span className="kicker">Vocational Placement & Rehabilitation</span>
        <h1 className="page-title">Personalized AI Job Matches</h1>
        <p className="lede">
          Recommended NGO job vacancies tailored to your Skill Passport trades, certifications, and experience.
        </p>
      </div>

      {recommendations.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon="🧭"
            title="No active job vacancies matched"
            body="No NGO job postings match your current skill profile. Complete vocational training courses to qualify for more post-release placement opportunities!"
          />
        </section>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => {
            const { job, score, matched_required_skills, missing_required_skills, appliedAlready } = rec;
            const matchPct = Math.round(score * 100);

            return (
              <div
                key={job.id}
                className="panel-tight p-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-navy px-2.5 py-0.5 text-xs font-bold text-white">
                      {job.jobCategory}
                    </span>
                    <span className="code-chip text-xs">{job.district}</span>
                    <span className="pill pill-ok text-xs font-extrabold">
                      {matchPct}% Skill Match
                    </span>
                    {appliedAlready && <span className="pill pill-neutral text-xs">Applied ✓</span>}
                  </div>

                  <h3 className="display text-lg font-bold text-navy m-0">{job.title}</h3>
                  <p className="text-xs text-bodytext line-clamp-2">{job.description}</p>

                  <div className="flex flex-wrap gap-4 text-xs font-medium text-heading">
                    <div>
                      Wage: <b className="font-mono text-terracotta">{job.wageInfo || "Competitive"}</b>
                    </div>
                    <div>
                      Openings: <b className="font-mono text-navy">{job.openings ?? 1}</b>
                    </div>
                    <div>
                      Employer: <b className="text-navy">{job.ngoName}</b>
                    </div>
                  </div>

                  {matched_required_skills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-emerald-700">Matched Skills:</span>
                      {matched_required_skills.map((s) => (
                        <span key={s} className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          ✓ {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {missing_required_skills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-amber-700">Missing Skills:</span>
                      {missing_required_skills.map((s) => (
                        <span key={s} className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          ! {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {appliedAlready || applySuccessId === job.id ? (
                    <span className="btn btn-outline btn-sm cursor-default opacity-80 bg-emerald-50 text-emerald-800 border-emerald-300 font-bold">
                      ✓ Application Submitted
                    </span>
                  ) : (
                    <button
                      onClick={() => applyMutation.mutate(job.id)}
                      disabled={applyMutation.isPending}
                      className="btn btn-primary btn-sm"
                    >
                      {applyMutation.isPending && applyMutation.variables === job.id ? "Submitting..." : "Apply for Job"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
