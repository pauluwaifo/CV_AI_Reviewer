"use client";

import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { PpapBandLabel, PpapCandidateSubmissionRecord, PpapBrand } from "@/types/ppap";

type PpapDashboardPageProps = {
  submissions: PpapCandidateSubmissionRecord[];
  selectedSubmissionId?: string;
  workspaceId: string;
};

export default function PpapDashboardPage({
  submissions,
  selectedSubmissionId,
  workspaceId,
}: PpapDashboardPageProps) {
  const [searchText, setSearchText] = useState("");
  const [bandFilter, setBandFilter] = useState<PpapBandLabel | "all">("all");
  const [brandFilter, setBrandFilter] = useState<PpapBrand | "all">("all");
  const [uniformOnly, setUniformOnly] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied">("idle");

  const filteredSubmissions = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return submissions.filter((submission) => {
      if (bandFilter !== "all" && submission.band !== bandFilter) {
        return false;
      }

      if (brandFilter !== "all" && submission.brand !== brandFilter) {
        return false;
      }

      if (uniformOnly && !submission.socialDesirabilityFlag) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        submission.fullName,
        submission.roleApplied,
        submission.brand,
        submission.band,
        submission.aiProvider,
        submission.email || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bandFilter, brandFilter, searchText, submissions, uniformOnly]);

  const openSubmissionId =
    filteredSubmissions.some((submission) => submission.id === selectedSubmissionId)
      ? selectedSubmissionId || ""
      : filteredSubmissions[0]?.id || "";
  const metrics = buildMetrics(filteredSubmissions);
  const publicUrl = `/ppap?workspace=${encodeURIComponent(workspaceId)}`;

  return (
    <main className="space-y-6 py-6 sm:py-8 md:py-10">
      <section className="border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              PPAP dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Review candidate tendencies, AI narratives, and hire notes
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              This page keeps PPAP submissions in one place for the hiring team. Open any card to
              review the per-tendency scores, narrative analysis, social desirability warning, and
              the supporting hiring note.
            </p>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <SectionLabel title="Public access link" />
            <div className="space-y-3 border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">
                Share this link with candidates so they can open the PPAP assessment without
                signing in.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={publicUrl}
                  className="flex-1 border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  style={{ borderRadius: 2 }}
                />
                <button
                  type="button"
                  onClick={() => void handleCopyPublicLink(publicUrl, setCopyState)}
                  className="border px-4 py-3 text-sm font-medium transition hover:opacity-95"
                  style={{
                    backgroundColor: "#111827",
                    borderColor: "#111827",
                    color: "#ffffff",
                    borderRadius: 2,
                  }}
                >
                  {copyState === "copying"
                    ? "Copying..."
                    : copyState === "copied"
                      ? "Copied"
                      : "Copy link"}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Public link format: `/ppap?workspace={workspaceId}`.
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Search">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Name, role, brand..."
                  className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                  style={{ borderRadius: 2 }}
                />
              </FilterField>
              <FilterField label="Band">
                <select
                  value={bandFilter}
                  onChange={(event) => setBandFilter(event.target.value as PpapBandLabel | "all")}
                  className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                  style={{ borderRadius: 2 }}
                >
                  <option value="all">All bands</option>
                  <option value="STRONG SIGNAL">Strong signal</option>
                  <option value="POSITIVE SIGNAL">Positive signal</option>
                  <option value="MIXED SIGNAL">Mixed signal</option>
                  <option value="WEAK SIGNAL">Weak signal</option>
                </select>
              </FilterField>
              <FilterField label="Brand">
                <select
                  value={brandFilter}
                  onChange={(event) => setBrandFilter(event.target.value as PpapBrand | "all")}
                  className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                  style={{ borderRadius: 2 }}
                >
                  <option value="all">All brands</option>
                  <option value="ICF">ICF</option>
                  <option value="YYE">YYE</option>
                  <option value="Back Office">Back Office</option>
                  <option value="Multiple">Multiple</option>
                </select>
              </FilterField>
              <div className="flex items-end">
                <label className="flex w-full items-center gap-3 border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200" style={{ borderRadius: 2 }}>
                  <input
                    type="checkbox"
                    checked={uniformOnly}
                    onChange={(event) => setUniformOnly(event.target.checked)}
                    className="h-4 w-4 border-slate-300 text-slate-900 dark:border-slate-600 dark:text-slate-100"
                  />
                  Uniform pattern only
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-950/60">
                Showing {filteredSubmissions.length} of {submissions.length}
              </span>
              {searchText.trim() ? <Badge label={`Search: ${searchText.trim()}`} /> : null}
              {bandFilter !== "all" ? <Badge label={bandFilter} /> : null}
              {brandFilter !== "all" ? <Badge label={brandFilter} /> : null}
              {uniformOnly ? <Badge label="Uniform only" /> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Submissions" value={String(metrics.total)} helper="All saved records" />
            <MetricCard label="Strong signal" value={String(metrics.strong)} helper="85-100%" />
            <MetricCard label="Positive signal" value={String(metrics.positive)} helper="70-84%" />
            <MetricCard label="Uniform pattern" value={String(metrics.uniform)} helper="Interpret with care" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredSubmissions.length > 0 ? (
          filteredSubmissions.map((submission, index) => (
            <details
              key={submission.id}
              className="border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              style={{ borderRadius: 2 }}
              open={submission.id === openSubmissionId || (index === 0 && !selectedSubmissionId)}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {submission.fullName}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {submission.roleApplied} - {submission.brand}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(submission.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <Pill label={`${submission.overallScore}%`} />
                    <Pill label={submission.band} />
                    {submission.socialDesirabilityFlag ? <Pill label="Uniform pattern" /> : null}
                  </div>
                </div>
              </summary>

              <div className="mt-6 space-y-5">
                <section className="space-y-3">
                  <SectionLabel title="Tendency scores" />
                  <div className="space-y-3">
                    {submission.scores.tendencyScores.map((tendency) => (
                      <div key={tendency.id} className="space-y-2 border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tendency.label}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Q{tendency.questionIds.join(", Q")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tendency.percentage}%</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{tendency.band}</p>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <div
                            className="h-full"
                            style={{
                              width: `${tendency.percentage}%`,
                              backgroundColor: bandColor(tendency.band),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel title="Hiring note" />
                  <div className="border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                    {buildHiringNote(submission)}
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel title="Admin report" />
                  <div className="border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                    {submission.adminReport}
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel title="Candidate summary" />
                  <div className="border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                    {submission.candidateSummary}
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel title="Raw response pattern" />
                  <div className="space-y-3">
                    {submission.scores.tendencyScores.map((tendency) => {
                      const items = submission.scores.questionScores.filter(
                        (item) => item.tendencyId === tendency.id
                      );
                      const highItems = items.filter((item) => item.response >= 4).map((item) => item.id);
                      const lowItems = items.filter((item) => item.response <= 2).map((item) => item.id);
                      const reverseItems = items.filter((item) => item.reverseScored).map((item) => item.id);

                      return (
                        <div
                          key={tendency.id}
                          className="border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300"
                        >
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{tendency.label}</p>
                          <p>High items: {highItems.length > 0 ? formatQuestionList(highItems) : "None"}</p>
                          <p>Low items: {lowItems.length > 0 ? formatQuestionList(lowItems) : "None"}</p>
                          <p>
                            Reverse-scored items: {reverseItems.length > 0 ? formatQuestionList(reverseItems) : "None"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel title="Record details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InlineRecord label="AI provider" value={submission.aiProvider} />
                    <InlineRecord
                      label="Social desirability flag"
                      value={submission.socialDesirabilityFlag ? "Yes" : "No"}
                    />
                    <InlineRecord label="Email" value={submission.email || "Not provided"} />
                    <InlineRecord
                      label="Submission ID"
                      value={submission.id}
                    />
                  </div>
                </section>
              </div>
            </details>
          ))
        ) : (
          <section className="border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6">
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
              {submissions.length > 0
                ? "No PPAP submissions match the current filters."
                : "No PPAP submissions have been saved for this workspace yet."}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

function buildMetrics(submissions: PpapCandidateSubmissionRecord[]) {
  return submissions.reduce(
    (accumulator, submission) => {
      accumulator.total += 1;

      if (submission.band === "STRONG SIGNAL") {
        accumulator.strong += 1;
      }

      if (submission.band === "POSITIVE SIGNAL") {
        accumulator.positive += 1;
      }

      if (submission.socialDesirabilityFlag) {
        accumulator.uniform += 1;
      }

      return accumulator;
    },
    {
      total: 0,
      strong: 0,
      positive: 0,
      uniform: 0,
    }
  );
}

function buildHiringNote(submission: PpapCandidateSubmissionRecord) {
  const sorted = [...submission.scores.tendencyScores].sort(
    (left, right) => right.percentage - left.percentage
  );
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  if (!strongest || !weakest) {
    return "Use this record as a discussion prompt and corroborate with interview evidence.";
  }

  if (strongest.id === weakest.id) {
    return `The pattern is fairly even across the five tendencies, so the main conversation is whether that balance matches the needs of ${submission.roleApplied}. Use interviews and work samples to probe the candidate's real behaviour under pressure.`;
  }

  return `The clearest signal is ${strongest.label}, while ${weakest.label} is the main area to probe further for ${submission.roleApplied}. The safest interpretation is to use the stronger tendency as a working strength and test the weaker area with follow-up examples before making any decision.`;
}

function bandColor(band: string) {
  if (band === "STRONG SIGNAL") {
    return "#166534";
  }

  if (band === "POSITIVE SIGNAL") {
    return "#2563eb";
  }

  if (band === "MIXED SIGNAL") {
    return "#b45309";
  }

  return "#b91c1c";
}

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return <span className="border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100">{label}</span>;
}

function InlineRecord({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
  }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="border border-slate-200 bg-white px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100">{label}</span>;
}

function formatQuestionList(items: number[]) {
  return items.map((item) => `Q${item}`).join(", ");
}

async function handleCopyPublicLink(
  publicUrl: string,
  setCopyState: Dispatch<SetStateAction<"idle" | "copying" | "copied">>
) {
  if (typeof window === "undefined") {
    return;
  }

  if (navigator.clipboard) {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
      return;
    } catch {
      // fall through to prompt-style fallback below
    }
  }

  const value = `${window.location.origin}${publicUrl}`;
  window.prompt("Copy the PPAP public link", value);
  setCopyState("idle");
}
