"use client";

import { useEffect, useMemo, useState } from "react";

import {
  describeHiringInterviewRecommendation,
  HIRING_INTERVIEW_RECOMMENDATION_OPTIONS,
} from "@/lib/hiring-application-workflow";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import type {
  HiringApplicationRecord,
  HiringInterviewScorecardCriterion,
  HiringInterviewScorecardRecommendation,
} from "@/types/hiring-funnel";

export default function CandidateInterviewScorecardPanel({
  application,
  onUpdated,
  workspaceId,
}: {
  application: HiringApplicationRecord;
  onUpdated: (application: HiringApplicationRecord) => void;
  workspaceId: string;
}) {
  const [criteria, setCriteria] = useState(application.workflow.interviewScorecard.criteria);
  const [recommendation, setRecommendation] = useState<HiringInterviewScorecardRecommendation>(
    application.workflow.interviewScorecard.recommendation
  );
  const [overallNotes, setOverallNotes] = useState(
    application.workflow.interviewScorecard.overallNotes
  );
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCriteria(application.workflow.interviewScorecard.criteria);
    setRecommendation(application.workflow.interviewScorecard.recommendation);
    setOverallNotes(application.workflow.interviewScorecard.overallNotes);
    setFeedback("");
  }, [application.id, application.workflow.interviewScorecard]);

  const scoredCount = useMemo(
    () => criteria.filter((item) => typeof item.score === "number").length,
    [criteria]
  );
  const averageScore = useMemo(() => {
    const scored = criteria.filter((item) => typeof item.score === "number");

    if (scored.length === 0) {
      return null;
    }

    return (scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length).toFixed(1);
  }, [criteria]);

  async function handleSave() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      const response = await fetch(
        appendWorkspaceQuery(`/api/applications/${application.id}`, workspaceId),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interviewScorecard: {
              ...application.workflow.interviewScorecard,
              criteria,
              overallNotes,
              recommendation,
              updatedAt: new Date().toISOString(),
            },
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { application?: HiringApplicationRecord; error?: string }
        | null;

      if (!response.ok || !payload?.application) {
        throw new Error(payload?.error || "I couldn't save that interview scorecard.");
      }

      onUpdated(payload.application);
      setFeedback("Interview scorecard saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "I couldn't save that interview scorecard."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
            Interview scorecard
          </p>
          <p className="max-w-3xl text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
            Run a structured interview, capture evidence consistently, and let the workflow pick up the next best follow-up step.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
          <Metric label="Criteria scored" value={`${scoredCount}/${criteria.length}`} />
          <Metric label="Average" value={averageScore ? `${averageScore}/5` : "Not scored"} />
          <Metric
            label="Recommendation"
            value={describeHiringInterviewRecommendation(recommendation)}
          />
        </div>
      </div>

      {application.workflow.interviewKit.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Suggested interview kit
            </p>
            <span className="text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
              Reused by workflow automations
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {application.workflow.interviewKit.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[var(--workspace-form-border-soft)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--workspace-form-title)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {application.analysis.result.interviewQuestions.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
            AI interview prompts
          </p>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {application.analysis.result.interviewQuestions.map((question) => (
              <div
                key={question}
                className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-title)] dark:border-gray-800 dark:bg-gray-900 dark:text-white"
              >
                {question}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {criteria.map((criterion, index) => (
          <article
            key={criterion.id}
            className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  {index + 1}. {criterion.label}
                </p>
                <p className="text-xs leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  {criterion.prompt}
                </p>
              </div>
              <select
                value={criterion.score ?? ""}
                onChange={(event) =>
                  updateCriterion(index, {
                    score: event.target.value ? Number.parseInt(event.target.value, 10) : null,
                  })
                }
                className="w-full rounded-lg border border-[var(--workspace-form-border)] bg-white px-3 py-2 text-sm text-[var(--workspace-form-title)] outline-hidden transition focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 sm:w-36"
              >
                <option value="">Score</option>
                <option value="1">1 - Weak</option>
                <option value="2">2 - Limited</option>
                <option value="3">3 - Mixed</option>
                <option value="4">4 - Strong</option>
                <option value="5">5 - Excellent</option>
              </select>
            </div>

            <textarea
              value={criterion.notes}
              onChange={(event) => updateCriterion(index, { notes: event.target.value })}
              className="mt-4 min-h-24 w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              placeholder="What evidence did the interview surface here?"
            />
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
            Interview recommendation
          </span>
          <select
            value={recommendation}
            onChange={(event) =>
              setRecommendation(event.target.value as HiringInterviewScorecardRecommendation)
            }
            className="w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
          >
            {HIRING_INTERVIEW_RECOMMENDATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-[var(--workspace-form-muted)] dark:text-gray-400">
            {
              HIRING_INTERVIEW_RECOMMENDATION_OPTIONS.find(
                (option) => option.value === recommendation
              )?.description
            }
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
            Overall interview notes
          </span>
          <textarea
            value={overallNotes}
            onChange={(event) => setOverallNotes(event.target.value)}
            className="min-h-28 w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
            placeholder="Summarize the strongest evidence, open questions, and whether the team should move forward."
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--workspace-form-muted)] dark:text-gray-400">
          {feedback || "Saving here keeps the scorecard attached to the candidate record, analytics, and audit trail."}
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving scorecard..." : "Save interview scorecard"}
        </button>
      </div>
    </section>
  );

  function updateCriterion(
    index: number,
    patch: Partial<Pick<HiringInterviewScorecardCriterion, "notes" | "score">>
  ) {
    setCriteria((current) =>
      current.map((criterion, criterionIndex) =>
        criterionIndex === index ? { ...criterion, ...patch } : criterion
      )
    );
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 break-words text-base font-semibold text-[var(--workspace-form-title)] dark:text-white">
        {value}
      </p>
    </div>
  );
}
