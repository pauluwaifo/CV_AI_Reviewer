"use client";

import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useTheme } from "@/context/ThemeContext";
import type { StoredAnalysisSession } from "@/types/analysis-session";
import type {
  AnalysisMeta,
  EvidencePoint,
  HiringRecommendation,
  RecruiterStatus,
  RiskSignal,
  RoleCriterionMatch,
  SkillAssessment,
} from "@/types/document-intelligence";
import { recruiterStatuses } from "@/types/document-intelligence";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const chartFontFamily = "Aptos, Segoe UI, Helvetica Neue, Arial, sans-serif";

type LoadState = "loading" | "ready";
type ResultsTab = "overview" | "match" | "skills" | "evidence" | "workflow" | "compare";

const resultsTabs: Array<{ id: ResultsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "match", label: "Role Match" },
  { id: "skills", label: "Skills" },
  { id: "evidence", label: "Evidence" },
  { id: "workflow", label: "Workflow" },
  { id: "compare", label: "Compare" },
];

export default function AnalysisResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<ResultsTab>("overview");
  const [comparisonTargetId, setComparisonTargetId] = useState("");
  const [history, setHistory] = useState<StoredAnalysisSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState("");
  const requestedScreeningId = searchParams.get("screening") ?? "";

  const loadScreenings = useCallback(async () => {
    setLoadState("loading");
    setError(null);

    try {
      const response = await fetch("/api/screenings", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { screenings?: StoredAnalysisSession[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "I couldn't load workspace screenings.");
      }

      setHistory(payload?.screenings ?? []);
      setLoadState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "I couldn't load workspace screenings."
      );
      setHistory([]);
      setLoadState("ready");
    }
  }, []);

  useEffect(() => {
    void loadScreenings();
  }, [loadScreenings]);

  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    if (history.length === 0) {
      if (requestedScreeningId) {
        router.replace("/results", { scroll: false });
      }
      return;
    }

    if (!requestedScreeningId || !history.some((item) => item.id === requestedScreeningId)) {
      router.replace(`/results?screening=${encodeURIComponent(history[0].id)}`, {
        scroll: false,
      });
    }
  }, [history, loadState, requestedScreeningId, router]);

  const session = useMemo(
    () =>
      history.find((item) => item.id === requestedScreeningId) ??
      history[0] ??
      null,
    [history, requestedScreeningId]
  );

  if (loadState === "loading") {
    return (
      <div className="w-full py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading workspace screenings...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-full py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            Results
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            No saved result yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Run a CV screening first and the latest candidate review will appear here.
          </p>
          <div className="mt-6">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
            >
              Go to upload
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { response, roleSetup } = session;
  const recommendation = response.result.recommendation;
  const scoreValue = response.result.score.value;
  const analyzedAt = new Date(session.createdAt).toLocaleString();
  const providerLabel = formatProviderLabel(
    response.meta.provider,
    response.meta.providerDetail
  );
  const displayName = response.result.candidateProfile.name || response.meta.fileName;
  const recommendationTone = recommendationToneFromDecision(recommendation.decision);
  const scoreTone = scoreToneFromValue(scoreValue);
  const roleMatchCounts = summarizeRoleCriteria(response.result.roleMatch.criteria);
  const riskLevelCounts = summarizeRiskLevels(response.result.riskSignals);
  const riskSignalCount = response.result.riskSignals.length;
  const evidencePointCount = response.result.evidencePoints.length;
  const chartOptions = buildScoreChartOptions(
    response.result.score.label,
    scoreTone.color,
    isDark
  );
  const comparisonCandidates = history.filter((item) => item.id !== session.id);
  const comparisonTarget =
    comparisonCandidates.find((item) => item.id === comparisonTargetId) ??
    comparisonCandidates[0] ??
    null;
  const latestSession = history[0] ?? null;

  function openScreening(screeningId: string) {
    router.replace(`/results?screening=${encodeURIComponent(screeningId)}`, {
      scroll: false,
    });
  }

  async function handleDeleteScreening(screeningId: string) {
    if (deletingSessionId) {
      return;
    }

    setDeletingSessionId(screeningId);
    setError(null);

    try {
      const response = await fetch(`/api/screenings/${screeningId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "I couldn't delete that screening.");
      }

      const nextHistory = history.filter((item) => item.id !== screeningId);
      setHistory(nextHistory);

      if (comparisonTargetId === screeningId) {
        setComparisonTargetId("");
      }

      if (session.id === screeningId) {
        if (nextHistory[0]) {
          openScreening(nextHistory[0].id);
        } else {
          router.replace("/results", { scroll: false });
        }
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "I couldn't delete that screening."
      );
    } finally {
      setDeletingSessionId("");
    }
  }

  async function handleSaveWorkflow(
    sessionId: string,
    updates: Pick<StoredAnalysisSession, "recruiterNotes" | "recruiterStatus">
  ) {
    const response = await fetch(`/api/screenings/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });
    const payload = (await response.json().catch(() => null)) as
      | { screening?: StoredAnalysisSession; error?: string }
      | null;

    if (!response.ok || !payload?.screening) {
      throw new Error(payload?.error || "I couldn't save those workflow notes.");
    }

    setHistory((current) =>
      current.map((item) => (item.id === payload.screening?.id ? payload.screening : item))
    );
  }

  return (
    <div className="w-full space-y-6 py-6 sm:py-8 md:py-10">
      {error ? (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-2.5 bg-brand-500" />
        <div className="grid gap-6 p-5 sm:p-6 md:p-7 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Hiring intelligence workspace
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                  {displayName}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${recommendationTone.badgeClass}`}
                >
                  {recommendation.decision}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {session.recruiterStatus}
                </span>
              </div>
              <p className="text-sm leading-7 text-gray-600 dark:text-gray-300">
                {response.result.summary}
              </p>
            </div>

            {(hasRoleSetup(roleSetup) || session.analysisGoal) ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    Role benchmark
                  </p>
                  {roleSetup.title ? <MetaPill label={roleSetup.title} /> : null}
                  {roleSetup.seniority ? <MetaPill label={roleSetup.seniority} /> : null}
                  {roleSetup.location ? <MetaPill label={roleSetup.location} /> : null}
                </div>
                {roleSetup.summary ? (
                  <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    {roleSetup.summary}
                  </p>
                ) : null}
                {session.analysisGoal ? (
                  <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-900 dark:text-white">Hiring brief:</span>{" "}
                    {session.analysisGoal}
                  </p>
                ) : null}
              </div>
            ) : null}

            {response.meta.provider === "local" ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200">
                <p>Screening completed with the fallback analysis engine.</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  The report below is still based on the extracted CV and role benchmark. A backup
                  engine handled this run because the primary remote AI services were unavailable.
                </p>
                {response.meta.providerWarnings && response.meta.providerWarnings.length > 0 ? (
                  <details className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/70">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                      Technical note
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {response.meta.providerWarnings.slice(0, 2).map((warning) => (
                        <MetaPill key={warning} label={formatProviderWarning(warning)} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <MetaPill label={formatDocumentTypeLabel(response.result.documentType)} />
              <MetaPill label={formatInputMetaLabel(response.meta)} />
              <MetaPill label={providerLabel} />
              <MetaPill label={analyzedAt} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Score"
                value={String(scoreValue)}
                caption={response.result.score.label}
              />
              <MetricCard
                label="Decision"
                value={recommendation.decision}
                caption={`${recommendation.confidence} confidence`}
              />
              <MetricCard
                label="Matched criteria"
                value={String(roleMatchCounts.matched)}
                caption={`${roleMatchCounts.total} reviewed`}
              />
              <MetricCard
                label="Risk signals"
                value={String(riskSignalCount)}
                caption={`${evidencePointCount} evidence points`}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/upload"
                className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 sm:w-auto"
              >
                New screening
              </Link>
              {latestSession && latestSession.id !== session.id ? (
                <button
                  type="button"
                  onClick={() => openScreening(latestSession.id)}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
                >
                  View latest
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="grid gap-5 2xl:grid-cols-[320px_minmax(0,1.18fr)]">
          <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              Screening score
            </p>
            <div className="mx-auto mt-3 max-w-[210px]">
              <ReactApexChart
                options={chartOptions}
                series={[scoreValue]}
                type="radialBar"
                height={210}
              />
            </div>
            <div className="text-center">
              <p className={`text-sm font-medium ${scoreTone.textClass}`}>
                {response.result.score.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {response.result.score.rationale}
              </p>
            </div>
          </article>

          <article className="grid gap-4 2xl:grid-cols-[minmax(0,1.08fr)_380px]">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Candidate profile
              </p>
              <h2 className="mt-3 break-words text-2xl font-semibold text-gray-900 dark:text-white">
                {response.result.candidateProfile.name}
              </h2>
              <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {response.result.candidateProfile.headline}
              </p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">
                {response.result.candidateProfile.summary}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {response.result.candidateProfile.fields.length > 0 ? (
                  response.result.candidateProfile.fields.map((field) => (
                    <MetaPill
                      key={`${field.label}-${field.value}`}
                      label={`${field.label}: ${field.value}`}
                    />
                  ))
                ) : (
                  <MetaPill label="Limited structured profile fields" />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard
                label="Decision"
                value={recommendation.decision}
                caption={`${recommendation.confidence} confidence`}
              />
              <MetricCard
                label="Matched criteria"
                value={String(roleMatchCounts.matched)}
                caption={`${roleMatchCounts.total} reviewed`}
              />
              <MetricCard
                label="Resume size"
                value={formatFileSize(response.meta.fileSize)}
                caption="Original upload"
              />
              <MetricCard
                label="Parsed text"
                value={formatCompactNumber(response.meta.extractedCharacters)}
                caption="Characters parsed"
              />
            </div>
          </article>
        </div>

        <article className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:p-5">
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1">
              {resultsTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-brand-500 text-white"
                      : "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-brand-500/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            {activeTab === "overview" ? (
              <OverviewTab
                isDark={isDark}
                session={session}
                roleMatchCounts={roleMatchCounts}
                riskLevelCounts={riskLevelCounts}
              />
            ) : null}

            {activeTab === "match" ? (
              <RoleMatchTab
                isDark={isDark}
                session={session}
                roleMatchCounts={roleMatchCounts}
              />
            ) : null}

            {activeTab === "skills" ? (
              <SkillsTab
                isDark={isDark}
                skillAssessments={response.result.skillAssessments}
                riskSignals={response.result.riskSignals}
              />
            ) : null}

            {activeTab === "evidence" ? (
              <EvidenceTab
                evidencePoints={response.result.evidencePoints}
                extractedFacts={response.result.extractedFacts}
              />
            ) : null}

            {activeTab === "workflow" ? (
              <WorkflowTab
                key={session.id}
                roleSetup={roleSetup}
                sessionId={session.id}
                initialRecruiterNotes={session.recruiterNotes}
                initialRecruiterStatus={session.recruiterStatus}
                interviewQuestions={response.result.interviewQuestions}
                recommendedActions={response.result.recommendedActions}
                onSaveWorkflow={handleSaveWorkflow}
              />
            ) : null}

            {activeTab === "compare" ? (
              <CompareTab
                isDark={isDark}
                currentSession={session}
                history={history}
                comparisonTarget={comparisonTarget}
                comparisonTargetId={comparisonTargetId}
                deletingSessionId={deletingSessionId}
                onDeleteScreening={handleDeleteScreening}
                onChangeComparisonTarget={setComparisonTargetId}
                onOpenScreening={openScreening}
                onRefreshHistory={() => void loadScreenings()}
              />
            ) : null}
          </div>
        </article>
      </section>

      <details className="group rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-white dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10 dark:hover:text-brand-200">
          <span>Resume text preview</span>
          <span className="text-xs font-medium text-gray-500 group-open:hidden dark:text-gray-400">
            Open
          </span>
          <span className="hidden text-xs font-medium text-brand-600 group-open:inline dark:text-brand-200">
            Close
          </span>
        </summary>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:bg-gray-900/70 dark:text-gray-300">
          {response.excerpt}
        </pre>
      </details>
    </div>
  );
}

function OverviewTab({
  isDark,
  session,
  roleMatchCounts,
  riskLevelCounts,
}: {
  isDark: boolean;
  session: StoredAnalysisSession;
  roleMatchCounts: ReturnType<typeof summarizeRoleCriteria>;
  riskLevelCounts: ReturnType<typeof summarizeRiskLevels>;
}) {
  const { response } = session;
  const breakdown = response.result.score.breakdown;
  const radarOptions = buildRadarChartOptions(
    breakdown.map((item) => item.category),
    isDark
  );
  const roleDonutOptions = buildDonutChartOptions(
    ["Matched", "Partial", "Missing"],
    ["#12B76A", "#F79009", "#F04438"],
    isDark
  );
  const riskDonutOptions = buildDonutChartOptions(
    ["Low", "Medium", "High"],
    ["#12B76A", "#F79009", "#F04438"],
    isDark
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Risk signals"
          value={String(response.result.riskSignals.length)}
          caption="Structured concerns"
        />
        <MetricCard
          label="Evidence points"
          value={String(response.result.evidencePoints.length)}
          caption="Grounded signals"
        />
        <MetricCard
          label="Interview prompts"
          value={String(response.result.interviewQuestions.length)}
          caption="Follow-up questions"
        />
        <MetricCard
          label="Provider"
          value={formatProviderLabel(response.meta.provider, response.meta.providerDetail)}
          caption={formatInputMetaLabel(response.meta)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Score radar">
          <ReactApexChart
            options={radarOptions}
            series={[
              {
                name: "Score",
                data: breakdown.map((item) => item.score),
              },
            ]}
            type="radar"
            height={280}
          />
        </ChartCard>

        <ChartCard title="Requirement coverage">
          <ReactApexChart
            options={roleDonutOptions}
            series={[roleMatchCounts.matched, roleMatchCounts.partial, roleMatchCounts.missing]}
            type="donut"
            height={280}
          />
        </ChartCard>

        <ChartCard title="Risk mix">
          <ReactApexChart
            options={riskDonutOptions}
            series={[riskLevelCounts.low, riskLevelCounts.medium, riskLevelCounts.high]}
            type="donut"
            height={280}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ListCard
          title="Candidate strengths"
          subtitle="The clearest signals supporting further consideration."
          items={response.result.keyHighlights}
          tone="success"
          emptyMessage="No strengths were returned."
        />
        <ListCard
          title="Hiring concerns"
          subtitle="The issues that deserve closer human review."
          items={response.result.redFlags}
          tone="danger"
          emptyMessage="No concerns were returned."
        />
      </div>
    </div>
  );
}

function RoleMatchTab({
  isDark,
  session,
  roleMatchCounts,
}: {
  isDark: boolean;
  session: StoredAnalysisSession;
  roleMatchCounts: ReturnType<typeof summarizeRoleCriteria>;
}) {
  const { response, roleSetup } = session;
  const roleCoverageOptions = buildHorizontalBarChartOptions(
    ["Matched", "Partial", "Missing"],
    isDark
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <RoleBriefCard roleSetup={roleSetup} analysisGoal={session.analysisGoal} />

        <ChartCard title="Requirement coverage breakdown">
          <ReactApexChart
            options={roleCoverageOptions}
            series={[
              {
                name: "Requirements",
                data: [
                  roleMatchCounts.matched,
                  roleMatchCounts.partial,
                  roleMatchCounts.missing,
                ],
              },
            ]}
            type="bar"
            height={280}
          />
        </ChartCard>
      </div>

      <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          Role match summary
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {response.result.roleMatch.summary}
        </p>
      </article>

      <div className="grid gap-4 xl:grid-cols-3">
        <CriteriaColumn
          title="Matched"
          items={response.result.roleMatch.criteria.filter((item) => item.status === "matched")}
          tone="matched"
          emptyMessage="No clearly matched requirements yet."
        />
        <CriteriaColumn
          title="Partial"
          items={response.result.roleMatch.criteria.filter((item) => item.status === "partial")}
          tone="partial"
          emptyMessage="No partial requirements were detected."
        />
        <CriteriaColumn
          title="Missing"
          items={response.result.roleMatch.criteria.filter((item) => item.status === "missing")}
          tone="missing"
          emptyMessage="No obvious missing requirements were surfaced."
        />
      </div>
    </div>
  );
}

function SkillsTab({
  isDark,
  skillAssessments,
  riskSignals,
}: {
  isDark: boolean;
  skillAssessments: SkillAssessment[];
  riskSignals: RiskSignal[];
}) {
  const skillsChartOptions = buildSkillsBarChartOptions(
    skillAssessments.map((item) => item.skill),
    isDark
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <ChartCard title="Skills fit">
          <ReactApexChart
            options={skillsChartOptions}
            series={[
              {
                name: "Skill score",
                data: skillAssessments.map((item) => item.score),
              },
            ]}
            type="bar"
            height={320}
          />
        </ChartCard>

        <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Risk signals
            </p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-950 dark:text-gray-300">
              {riskSignals.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {riskSignals.map((risk) => (
              <RiskCard key={`${risk.category}-${risk.summary}`} risk={risk} />
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {skillAssessments.map((skill) => (
          <SkillCard key={`${skill.skill}-${skill.category}`} skill={skill} />
        ))}
      </div>
    </div>
  );
}

function EvidenceTab({
  evidencePoints,
  extractedFacts,
}: {
  evidencePoints: EvidencePoint[];
  extractedFacts: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        {evidencePoints.length > 0 ? (
          evidencePoints.map((point) => (
            <EvidenceCard key={`${point.title}-${point.rationale}`} point={point} />
          ))
        ) : (
          <EmptyCard message="No structured evidence points were returned for this screening run." />
        )}
      </div>

      <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Candidate facts
          </p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-950 dark:text-gray-300">
            {extractedFacts.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {extractedFacts.length > 0 ? (
            extractedFacts.map((fact) => (
              <div key={`${fact.label}-${fact.value}`} className="rounded-lg bg-white p-4 dark:bg-gray-950/70">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  {fact.label}
                </p>
                <p className="mt-2 break-words text-sm font-medium text-gray-900 dark:text-white">
                  {fact.value}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              No structured candidate facts were returned from this CV.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

function WorkflowTab({
  roleSetup,
  sessionId,
  initialRecruiterNotes,
  initialRecruiterStatus,
  interviewQuestions,
  recommendedActions,
  onSaveWorkflow,
}: {
  roleSetup: StoredAnalysisSession["roleSetup"];
  sessionId: string;
  initialRecruiterNotes: string;
  initialRecruiterStatus: RecruiterStatus;
  interviewQuestions: string[];
  recommendedActions: string[];
  onSaveWorkflow: (
    sessionId: string,
    updates: Pick<StoredAnalysisSession, "recruiterNotes" | "recruiterStatus">
  ) => Promise<void>;
}) {
  const [recruiterNotes, setRecruiterNotes] = useState(initialRecruiterNotes);
  const [recruiterStatus, setRecruiterStatus] = useState<RecruiterStatus>(initialRecruiterStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSaveWorkflow() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    setSaveError(null);

    try {
      await onSaveWorkflow(sessionId, {
        recruiterNotes,
        recruiterStatus,
      });
      setFeedback("Workflow notes saved to the shared workspace history.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "I couldn't save those workflow notes."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <ListCard
          title="Interview pack"
          subtitle="Use these questions to validate fit, clarify weak evidence, and pressure-test the strongest claims."
          items={interviewQuestions}
          tone="brand"
          emptyMessage="No interview questions were generated."
        />

        <ListCard
          title="Next hiring steps"
          subtitle="Practical actions to take before making a move-forward decision."
          items={recommendedActions}
          tone="neutral"
          emptyMessage="No next-step actions were generated."
        />
      </div>

      <div className="space-y-4">
        <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Recruiter workflow
          </p>

          <div className="mt-4 space-y-4">
            <Field label="Candidate status">
              <select
                value={recruiterStatus}
                onChange={(event) => setRecruiterStatus(event.target.value as RecruiterStatus)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
              >
                {recruiterStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Recruiter notes">
              <textarea
                value={recruiterNotes}
                onChange={(event) => setRecruiterNotes(event.target.value)}
                placeholder="Write your own interview notes, recruiter comments, or decision rationale here."
                className="min-h-32 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>

            <button
              type="button"
              onClick={() => void handleSaveWorkflow()}
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 dark:disabled:bg-brand-500/50"
            >
              {isSaving ? "Saving..." : "Save workflow notes"}
            </button>

            {feedback ? (
              <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200">
                {feedback}
              </div>
            ) : null}

            {saveError ? (
              <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
                {saveError}
              </div>
            ) : null}
          </div>
        </article>

        {roleSetup.interviewFocus.length > 0 ? (
          <ListCard
            title="Role interview focus"
            subtitle="The priorities defined during role setup."
            items={roleSetup.interviewFocus}
            tone="brand"
            emptyMessage="No role interview priorities were added."
          />
        ) : null}
      </div>
    </div>
  );
}

function CompareTab({
  isDark,
  currentSession,
  history,
  comparisonTarget,
  comparisonTargetId,
  deletingSessionId,
  onChangeComparisonTarget,
  onDeleteScreening,
  onOpenScreening,
  onRefreshHistory,
}: {
  isDark: boolean;
  currentSession: StoredAnalysisSession;
  history: StoredAnalysisSession[];
  comparisonTarget: StoredAnalysisSession | null;
  comparisonTargetId: string;
  deletingSessionId: string;
  onChangeComparisonTarget: (value: string) => void;
  onDeleteScreening: (sessionId: string) => Promise<void>;
  onOpenScreening: (sessionId: string) => void;
  onRefreshHistory: () => void;
}) {
  const compareChartOptions = buildComparisonBarChartOptions(
    history.slice(0, 6).map((item) => item.response.result.candidateProfile.name || item.response.meta.fileName),
    isDark
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ChartCard title="Candidate score comparison">
          <ReactApexChart
            options={compareChartOptions}
            series={[
              {
                name: "Score",
                data: history.slice(0, 6).map((item) => item.response.result.score.value),
              },
            ]}
            type="bar"
            height={300}
          />
        </ChartCard>

        <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Candidate history
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Shared workspace history lets your team reopen candidates, compare fit, and keep
            workflow statuses in one place.
          </p>
          <button
            type="button"
            onClick={onRefreshHistory}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
          >
            Refresh history
          </button>
        </article>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-white/[0.03]">
            <thead className="bg-gray-50 dark:bg-gray-900/70">
              <tr>
                <HeaderCell>Candidate</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Decision</HeaderCell>
                <HeaderCell>Score</HeaderCell>
                <HeaderCell>Actions</HeaderCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {history.map((item) => (
                <tr key={item.id}>
                  <BodyCell>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.response.result.candidateProfile.name || item.response.meta.fileName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.response.result.candidateProfile.headline}
                      </p>
                    </div>
                  </BodyCell>
                  <BodyCell>{item.recruiterStatus}</BodyCell>
                  <BodyCell>{item.response.result.recommendation.decision}</BodyCell>
                  <BodyCell>{item.response.result.score.value}</BodyCell>
                  <BodyCell>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenScreening(item.id)}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        Open
                      </button>
                      {item.id !== currentSession.id ? (
                        <button
                          type="button"
                          onClick={() => onChangeComparisonTarget(item.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            comparisonTargetId === item.id
                              ? "bg-brand-500 text-white"
                              : "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-brand-500/10"
                          }`}
                        >
                          Compare
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void onDeleteScreening(item.id)}
                        disabled={deletingSessionId === item.id}
                        className="rounded-full border border-error-300 px-3 py-1 text-xs font-medium text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
                      >
                        {deletingSessionId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {history.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {item.response.result.candidateProfile.name || item.response.meta.fileName}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {item.response.result.candidateProfile.headline}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                {item.response.result.score.value}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{item.recruiterStatus}</span>
              <span>/</span>
              <span>{item.response.result.recommendation.decision}</span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => onOpenScreening(item.id)}
                className="inline-flex w-full items-center justify-center rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 sm:w-auto"
              >
                Open
              </button>
              {item.id !== currentSession.id ? (
                <button
                  type="button"
                  onClick={() => onChangeComparisonTarget(item.id)}
                  className={`inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-medium transition sm:w-auto ${
                    comparisonTargetId === item.id
                      ? "bg-brand-500 text-white"
                      : "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-brand-500/10"
                  }`}
                >
                  Compare
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onDeleteScreening(item.id)}
                disabled={deletingSessionId === item.id}
                className="inline-flex w-full items-center justify-center rounded-lg border border-error-300 px-3 py-2 text-xs font-medium text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10 sm:w-auto"
              >
                {deletingSessionId === item.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {comparisonTarget ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ComparisonCard title="Current candidate" session={currentSession} />
          <ComparisonCard title="Comparison candidate" session={comparisonTarget} />
        </div>
      ) : history.length > 1 ? null : (
        <EmptyCard message="Run more candidate screenings to unlock side-by-side comparison." />
      )}
    </div>
  );
}

function RoleBriefCard({
  roleSetup,
  analysisGoal,
}: {
  roleSetup: StoredAnalysisSession["roleSetup"];
  analysisGoal: string;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        Role benchmark
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {roleSetup.title ? <MetaPill label={roleSetup.title} /> : null}
        {roleSetup.seniority ? <MetaPill label={roleSetup.seniority} /> : null}
        {roleSetup.location ? <MetaPill label={roleSetup.location} /> : null}
      </div>
      {roleSetup.summary ? (
        <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {roleSetup.summary}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TagList
          title="Must-have skills"
          items={roleSetup.mustHaveSkills}
          emptyMessage="No must-have skills were added."
        />
        <TagList
          title="Nice-to-have"
          items={roleSetup.niceToHaveSkills}
          emptyMessage="No nice-to-have skills were added."
        />
      </div>

      {analysisGoal ? (
        <div className="mt-4 rounded-lg bg-white p-4 dark:bg-gray-950/70">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            Free-form brief
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{analysisGoal}</p>
        </div>
      ) : null}
    </article>
  );
}

function CriteriaColumn({
  title,
  items,
  tone,
  emptyMessage,
}: {
  title: string;
  items: RoleCriterionMatch[];
  tone: "matched" | "partial" | "missing";
  emptyMessage: string;
}) {
  const toneStyles = {
    matched: {
      badge: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
      dot: "bg-success-500",
    },
    partial: {
      badge: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-200",
      dot: "bg-warning-500",
    },
    missing: {
      badge: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
      dot: "bg-error-500",
    },
  }[tone];

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          {title}
        </p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${toneStyles.badge}`}>
          {items.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.criterion} className="rounded-lg bg-white p-4 dark:bg-gray-950/70">
              <div className="flex gap-3">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${toneStyles.dot}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {item.criterion}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {item.evidence}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{emptyMessage}</p>
        )}
      </div>
    </article>
  );
}

function SkillCard({ skill }: { skill: SkillAssessment }) {
  const toneStyles = {
    strong: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
    partial: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-200",
    unclear: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
    missing: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
  }[skill.status];

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">{skill.skill}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            {skill.category}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${toneStyles}`}>
          {skill.status}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${skill.score}%`,
            backgroundColor: skillBarColor(skill.status),
          }}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{skill.evidence}</p>
    </article>
  );
}

function RiskCard({ risk }: { risk: RiskSignal }) {
  const toneStyles = {
    low: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
    medium: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-200",
    high: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
  }[risk.level];

  return (
    <div className="rounded-lg bg-white p-4 dark:bg-gray-950/70">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{risk.category}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${toneStyles}`}>
          {risk.level}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{risk.summary}</p>
    </div>
  );
}

function EvidenceCard({ point }: { point: EvidencePoint }) {
  const toneStyles = {
    strength: {
      badge: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
      border: "border-success-100 dark:border-success-500/20",
    },
    concern: {
      badge: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
      border: "border-error-100 dark:border-error-500/20",
    },
    neutral: {
      badge: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
      border: "border-gray-200 dark:border-gray-800",
    },
  }[point.tone];

  return (
    <article className={`rounded-lg border bg-white p-5 shadow-theme-xs dark:bg-white/[0.03] ${toneStyles.border}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{point.title}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${toneStyles.badge}`}>
          {point.tone}
        </span>
      </div>
      <blockquote className="mt-4 rounded-lg bg-gray-50 px-4 py-4 text-sm leading-6 text-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
        {point.excerpt || "No direct excerpt was returned for this evidence point."}
      </blockquote>
      <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{point.rationale}</p>
    </article>
  );
}

function ComparisonCard({
  title,
  session,
}: {
  title: string;
  session: StoredAnalysisSession;
}) {
  const matched = session.response.result.roleMatch.criteria.filter(
    (item) => item.status === "matched"
  ).length;

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <h3 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
        {session.response.result.candidateProfile.name || session.response.meta.fileName}
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {session.response.result.candidateProfile.headline}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Status"
          value={session.recruiterStatus}
          caption={session.response.result.recommendation.decision}
        />
        <MetricCard
          label="Score"
          value={String(session.response.result.score.value)}
          caption={session.response.result.score.label}
        />
        <MetricCard
          label="Matched"
          value={String(matched)}
          caption={`${session.response.result.roleMatch.criteria.length} criteria`}
        />
        <MetricCard
          label="Risks"
          value={String(session.response.result.riskSignals.length)}
          caption="Structured concerns"
        />
      </div>
    </article>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function ListCard({
  title,
  subtitle,
  items,
  tone,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  items: string[];
  tone: "brand" | "success" | "danger" | "neutral";
  emptyMessage: string;
}) {
  const styles = {
    brand: {
      badge: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200",
      dot: "bg-brand-500 dark:bg-brand-300",
      item:
        "border-brand-100 bg-brand-50/85 text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/[0.10] dark:text-brand-50",
    },
    success: {
      badge: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
      dot: "bg-success-500 dark:bg-success-300",
      item:
        "border-emerald-100 bg-emerald-50/85 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.10] dark:text-emerald-50",
    },
    danger: {
      badge: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
      dot: "bg-error-500 dark:bg-error-300",
      item:
        "border-amber-100 bg-amber-50/85 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/[0.10] dark:text-amber-50",
    },
    neutral: {
      badge: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
      dot: "bg-gray-500 dark:bg-gray-400",
      item:
        "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-200",
    },
  }[tone];

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles.badge}`}>
          {items.length}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item}
              className={`flex gap-3 rounded-lg border p-4 ${styles.item}`}
            >
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
              <p className="text-sm leading-6">{item}</p>
            </div>
          ))
        ) : (
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{emptyMessage}</p>
        )}
      </div>
    </article>
  );
}

function TagList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 ? items.map((item) => <MetaPill key={item} label={item} />) : <MetaPill label={emptyMessage} />}
      </div>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
      {message}
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}

function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
    </div>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-gray-100 px-3 py-1 text-left text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
      {label}
    </span>
  );
}

function HeaderCell({ children }: { children: string }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
      {children}
    </th>
  );
}

function BodyCell({ children }: { children: ReactNode }) {
  return (
    <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{children}</td>
  );
}

function buildScoreChartOptions(
  scoreLabel: string,
  color: string,
  isDark: boolean
): ApexOptions {
  return {
    colors: [color],
    chart: {
      fontFamily: chartFontFamily,
      type: "radialBar",
      sparkline: {
        enabled: true,
      },
    },
    stroke: {
      lineCap: "round",
    },
    fill: {
      colors: [color],
    },
    plotOptions: {
      radialBar: {
        startAngle: -95,
        endAngle: 95,
        hollow: {
          size: "76%",
        },
        track: {
          background: isDark ? "#1D2939" : "#F2F4F7",
          strokeWidth: "100%",
          margin: 6,
        },
        dataLabels: {
          name: {
            show: true,
            offsetY: 28,
            color: isDark ? "#98A2B3" : "#667085",
            fontSize: "12px",
            fontWeight: "500",
          },
          value: {
            offsetY: -10,
            color: isDark ? "#F9FAFB" : "#101828",
            fontSize: "34px",
            fontWeight: "700",
            formatter: (value) => `${Math.round(value)}`,
          },
        },
      },
    },
    labels: [scoreLabel],
  };
}

function buildRadarChartOptions(categories: string[], isDark: boolean): ApexOptions {
  return {
    chart: {
      fontFamily: chartFontFamily,
      toolbar: {
        show: false,
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: categories.map(() => (isDark ? "#98A2B3" : "#667085")),
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      max: 100,
      min: 0,
      tickAmount: 4,
      labels: {
        style: {
          colors: [isDark ? "#98A2B3" : "#667085"],
        },
      },
    },
    stroke: {
      width: 2,
      colors: ["#465FFF"],
    },
    fill: {
      colors: ["#465FFF"],
      opacity: 0.18,
    },
    markers: {
      size: 4,
      colors: ["#465FFF"],
    },
    grid: {
      borderColor: isDark ? "#1F2937" : "#E5E7EB",
    },
  };
}

function buildDonutChartOptions(
  labels: string[],
  colors: string[],
  isDark: boolean
): ApexOptions {
  return {
    chart: {
      fontFamily: chartFontFamily,
      type: "donut",
    },
    labels,
    colors,
    legend: {
      position: "bottom",
      labels: {
        colors: isDark ? "#D1D5DB" : "#374151",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      colors: [isDark ? "#101828" : "#FFFFFF"],
    },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
        },
      },
    },
  };
}

function buildHorizontalBarChartOptions(categories: string[], isDark: boolean): ApexOptions {
  return {
    chart: {
      fontFamily: chartFontFamily,
      toolbar: {
        show: false,
      },
    },
    colors: ["#465FFF"],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: categories.map(() => (isDark ? "#98A2B3" : "#667085")),
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: [isDark ? "#D1D5DB" : "#374151"],
        },
      },
    },
    grid: {
      borderColor: isDark ? "#1F2937" : "#E5E7EB",
    },
    dataLabels: {
      enabled: false,
    },
  };
}

function buildSkillsBarChartOptions(categories: string[], isDark: boolean): ApexOptions {
  return {
    chart: {
      fontFamily: chartFontFamily,
      toolbar: {
        show: false,
      },
    },
    colors: ["#465FFF"],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
      },
    },
    xaxis: {
      max: 100,
      categories,
      labels: {
        style: {
          colors: categories.map(() => (isDark ? "#98A2B3" : "#667085")),
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: [isDark ? "#D1D5DB" : "#374151"],
        },
      },
    },
    grid: {
      borderColor: isDark ? "#1F2937" : "#E5E7EB",
    },
    dataLabels: {
      enabled: false,
    },
  };
}

function buildComparisonBarChartOptions(categories: string[], isDark: boolean): ApexOptions {
  return {
    chart: {
      fontFamily: chartFontFamily,
      toolbar: {
        show: false,
      },
    },
    colors: ["#465FFF"],
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "42%",
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: categories.map(() => (isDark ? "#98A2B3" : "#667085")),
          fontSize: "11px",
        },
      },
    },
    yaxis: {
      max: 100,
      labels: {
        style: {
          colors: [isDark ? "#98A2B3" : "#667085"],
        },
      },
    },
    grid: {
      borderColor: isDark ? "#1F2937" : "#E5E7EB",
    },
    dataLabels: {
      enabled: false,
    },
  };
}

function formatProviderLabel(provider: string, detail?: string) {
  if (provider === "huggingface") {
    return detail ? `Hugging Face - ${detail}` : "Hugging Face";
  }

  if (provider === "local") {
    return "Enhanced local";
  }

  return detail || "Gemini";
}

function formatDocumentTypeLabel(documentType: string) {
  if (documentType === "cv") {
    return "CV screening";
  }

  if (documentType === "other") {
    return "General review";
  }

  return documentType.charAt(0).toUpperCase() + documentType.slice(1);
}

function formatInputMetaLabel(meta: AnalysisMeta) {
  if (meta.inputKind === "image") {
    return "Image upload";
  }

  if (meta.inputKind === "text") {
    return "Text upload";
  }

  if (typeof meta.pageCount === "number" && meta.pageCount > 0) {
    return `${meta.pageCount} ${meta.pageCount === 1 ? "page" : "pages"}`;
  }

  return "Document upload";
}

function formatProviderWarning(warning: string) {
  return warning.replace(/\s+/g, " ").trim();
}

function scoreToneFromValue(value: number) {
  if (value >= 85) {
    return {
      color: "#12B76A",
      textClass: "text-success-700 dark:text-success-400",
    };
  }

  if (value >= 72) {
    return {
      color: "#465FFF",
      textClass: "text-brand-700 dark:text-brand-300",
    };
  }

  if (value >= 55) {
    return {
      color: "#F79009",
      textClass: "text-warning-700 dark:text-warning-300",
    };
  }

  return {
    color: "#F04438",
    textClass: "text-error-700 dark:text-error-300",
  };
}

function recommendationToneFromDecision(decision: HiringRecommendation["decision"]) {
  if (decision === "Shortlist") {
    return {
      badgeClass: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
    };
  }

  if (decision === "Interview") {
    return {
      badgeClass: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200",
    };
  }

  if (decision === "Hold") {
    return {
      badgeClass: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-200",
    };
  }

  return {
    badgeClass: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-200",
  };
}

function summarizeRoleCriteria(criteria: RoleCriterionMatch[]) {
  return {
    matched: criteria.filter((item) => item.status === "matched").length,
    partial: criteria.filter((item) => item.status === "partial").length,
    missing: criteria.filter((item) => item.status === "missing").length,
    total: criteria.length,
  };
}

function summarizeRiskLevels(risks: RiskSignal[]) {
  return {
    low: risks.filter((item) => item.level === "low").length,
    medium: risks.filter((item) => item.level === "medium").length,
    high: risks.filter((item) => item.level === "high").length,
  };
}

function hasRoleSetup(roleSetup: StoredAnalysisSession["roleSetup"]) {
  return Boolean(
    roleSetup.title ||
      roleSetup.seniority ||
      roleSetup.location ||
      roleSetup.summary ||
      roleSetup.mustHaveSkills.length > 0 ||
      roleSetup.niceToHaveSkills.length > 0 ||
      roleSetup.interviewFocus.length > 0
  );
}

function skillBarColor(status: SkillAssessment["status"]) {
  if (status === "strong") {
    return "#12B76A";
  }

  if (status === "partial") {
    return "#F79009";
  }

  if (status === "missing") {
    return "#F04438";
  }

  return "#667085";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
