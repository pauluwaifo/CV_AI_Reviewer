"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useTheme } from "@/context/ThemeContext";
import { buildPpapQuestionPages } from "@/lib/ppap-assessment";
import type { WorkspaceSettings } from "@/lib/workspace-settings";
import { buildPublicFormTheme } from "@/lib/workspace-settings";
import type { PpapBrand, PpapCandidateIntake } from "@/types/ppap";

type PpapAssessmentPageProps = {
  settings: WorkspaceSettings;
  workspaceId: string;
};

type PpapStage = "welcome" | "intake" | "assessment" | "review" | "submitting";
type PpapIntakeState = Omit<PpapCandidateIntake, "brand"> & {
  brand: PpapBrand | "";
};

const RESPONSE_OPTIONS = [
  { value: 1, label: "Strongly Disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly Agree" },
];

const QUESTION_PAGES = buildPpapQuestionPages();

export default function PpapAssessmentPage({
  settings,
  workspaceId,
}: PpapAssessmentPageProps) {
  const router = useRouter();
  const { theme: uiTheme } = useTheme();
  const isDark = uiTheme === "dark";
  const theme = buildPublicFormTheme(settings.formAccent);
  const [stage, setStage] = useState<PpapStage>("welcome");
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState("");
  const [intake, setIntake] = useState<PpapIntakeState>({
    fullName: "",
    email: "",
    roleApplied: "",
    brand: "",
    workspaceId,
  });
  const [responses, setResponses] = useState<Partial<Record<number, number>>>({});

  const currentPage = QUESTION_PAGES[pageIndex] || [];
  const currentPageComplete = currentPage.every(
    (question) => typeof responses[question.id] === "number"
  );
  const answeredCount = Object.keys(responses).length;
  const assessmentComplete = answeredCount === 30;
  const themeStyles = {
    accent: theme.accent,
    accentText: theme.accentText,
    accentSoft: theme.accentSoft,
    border: theme.border,
    page: theme.page,
    title: theme.title,
  };

  const progressValue = useMemo(() => {
    if (stage === "assessment") {
      return ((pageIndex + 1) / QUESTION_PAGES.length) * 100;
    }

    if (stage === "review") {
      return 95;
    }

    if (stage === "submitting") {
      return 100;
    }

    return 5;
  }, [pageIndex, stage]);

  function updateIntake(field: keyof PpapIntakeState, value: string) {
    setIntake((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateResponse(questionId: number, value: number) {
    setResponses((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  function goToAssessment() {
    if (!intake.fullName.trim() || !intake.roleApplied.trim()) {
      setError("Enter the candidate name and role before continuing.");
      return;
    }

    if (!intake.brand) {
      setError("Choose a brand or function before continuing.");
      return;
    }

    setError("");
    setStage("assessment");
  }

  function goNextPage() {
    if (!currentPageComplete) {
      setError("Answer every question on this page before moving on.");
      return;
    }

    setError("");

    if (pageIndex >= QUESTION_PAGES.length - 1) {
      setStage("review");
      return;
    }

    setPageIndex((current) => current + 1);
  }

  function goPreviousPage() {
    setError("");

    if (pageIndex === 0) {
      setStage("intake");
      return;
    }

    setPageIndex((current) => Math.max(0, current - 1));
  }

  async function submitAssessment() {
    if (!assessmentComplete) {
      setError("Answer all 30 questions before submitting.");
      return;
    }

    setError("");
    setStage("submitting");

    try {
      const payload = {
        workspaceId,
        fullName: intake.fullName.trim(),
        email: intake.email.trim(),
        roleApplied: intake.roleApplied.trim(),
        brand: intake.brand,
        responses: Object.fromEntries(
          Array.from({ length: 30 }, (_, index) => {
            const questionId = index + 1;
            return [questionId, responses[questionId] ?? 3];
          })
        ),
      };

      const response = await fetch("/api/ppap/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            submissionId?: string;
            error?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "I couldn't submit that assessment.");
      }

      const searchParams = new URLSearchParams({
        submission: data?.submissionId || "",
        workspace: workspaceId,
      });

      router.push(`/ppap/complete?${searchParams.toString()}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submission failed.");
      setStage("review");
    }
  }

  return (
    <main
      className="min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8"
      style={{
        background: isDark
          ? "#020617"
          : `linear-gradient(180deg, ${themeStyles.page} 0%, #ffffff 42%, #f8fafc 100%)`,
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header
          className="border bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          style={{ borderColor: themeStyles.border }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className="grid h-11 w-11 place-items-center overflow-hidden border border-slate-200 bg-white text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                style={{ borderRadius: 2 }}
              >
                {settings.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.logoDataUrl}
                    alt={`${settings.organizationName} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  settings.organizationName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {settings.appName}
                </p>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  PPAP Personality Assessment
                </h1>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{settings.organizationName}</p>
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{settings.tagline}</p>
            </div>
          </div>
        </header>

        <section
          className="border bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6"
          style={{ borderColor: themeStyles.border }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Progress
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {stage === "assessment"
                  ? `Page ${pageIndex + 1} of ${QUESTION_PAGES.length}`
                  : stage === "review"
                    ? "Review"
                    : stage === "submitting"
                      ? "Analysing"
                      : "Getting started"}
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${progressValue}%`,
                  backgroundColor: themeStyles.accent,
                }}
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {stage === "welcome" ? (
          <section className="border bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-7" style={{ borderColor: themeStyles.border }}>
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Welcome
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                This assessment helps us understand how you naturally approach work, teams, and
                challenges.
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                There are no right or wrong answers. It takes about 10 minutes, and you will move
                through 30 short statements one page at a time.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStage("intake")}
                  className="border px-4 py-2 text-sm font-medium transition hover:opacity-95"
                  style={{
                    backgroundColor: themeStyles.accent,
                    borderColor: themeStyles.accent,
                    color: themeStyles.accentText,
                    borderRadius: 2,
                  }}
                >
                  Start assessment
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {stage === "intake" ? (
          <section className="border bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6" style={{ borderColor: themeStyles.border }}>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Intake
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Tell us who is taking the assessment
                </h2>
              </div>

              <div className="space-y-5">
                <FieldLabel label="Full name" required>
                  <input
                    value={intake.fullName}
                    onChange={(event) => updateIntake("fullName", event.target.value)}
                    className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                    style={{ borderRadius: 2 }}
                    placeholder="Candidate name"
                  />
                </FieldLabel>

                <FieldLabel label="Email address">
                  <input
                    type="email"
                    value={intake.email}
                    onChange={(event) => updateIntake("email", event.target.value)}
                    className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                    style={{ borderRadius: 2 }}
                    placeholder="Optional"
                  />
                </FieldLabel>

                <FieldLabel label="Role applied for" required>
                  <input
                    value={intake.roleApplied}
                    onChange={(event) => updateIntake("roleApplied", event.target.value)}
                    className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                    style={{ borderRadius: 2 }}
                    placeholder="e.g. Operations Lead"
                  />
                </FieldLabel>

                <FieldLabel label="Brand or function" required>
                  <select
                    value={intake.brand}
                    onChange={(event) => updateIntake("brand", event.target.value)}
                    className="w-full border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                    style={{ borderRadius: 2 }}
                  >
                    <option value="">Select a brand or function</option>
                    <option value="ICF">ICF</option>
                    <option value="YYE">YYE</option>
                    <option value="Back Office">Back Office</option>
                    <option value="Multiple">Multiple</option>
                  </select>
                </FieldLabel>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStage("welcome")}
                  className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  style={{ borderRadius: 2 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goToAssessment}
                  className="border px-4 py-2 text-sm font-medium transition hover:opacity-95"
                  style={{
                    backgroundColor: themeStyles.accent,
                    borderColor: themeStyles.accent,
                    color: themeStyles.accentText,
                    borderRadius: 2,
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {stage === "assessment" ? (
          <section className="border bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6" style={{ borderColor: themeStyles.border }}>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Assessment
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Question {pageIndex + 1} of {QUESTION_PAGES.length}
                </h2>
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Answer all six statements on this page before moving forward.
                </p>
              </div>

              <div className="space-y-4">
                {currentPage.map((question, index) => {
                  const value = responses[question.id];

                  return (
                    <article
                      key={question.id}
                      className="border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60"
                      style={{ borderRadius: 2 }}
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              Question {pageIndex * 6 + index + 1}
                            </p>
                            <p className="text-sm leading-7 text-slate-900 dark:text-slate-100">{question.prompt}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {RESPONSE_OPTIONS.map((option) => {
                            const active = value === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateResponse(question.id, option.value)}
                                className="border px-3 py-2 text-left text-xs font-medium transition"
                                style={{
                                  borderRadius: 2,
                                  borderColor: active ? themeStyles.accent : themeStyles.border,
                                  backgroundColor: active ? themeStyles.accentSoft : "#ffffff",
                                  color: active ? themeStyles.title : "#334155",
                                }}
                              >
                                <span className="block">{option.value}</span>
                                <span className="block text-[11px] font-normal leading-4">
                                  {option.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goPreviousPage}
                  className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  style={{ borderRadius: 2 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNextPage}
                  className="border px-4 py-2 text-sm font-medium transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: themeStyles.accent,
                    borderColor: themeStyles.accent,
                    color: themeStyles.accentText,
                    borderRadius: 2,
                  }}
                  disabled={!currentPageComplete}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {stage === "review" ? (
          <section className="border bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6" style={{ borderColor: themeStyles.border }}>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Review
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  You have answered all 30 questions
                </h2>
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Review your details below, then submit your assessment. We will generate your
                  summary once the responses are processed.
                </p>
              </div>

              <div className="space-y-3 border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
                <SummaryRow label="Full name" value={intake.fullName} />
                <SummaryRow label="Email" value={intake.email || "Not provided"} />
                <SummaryRow label="Role applied for" value={intake.roleApplied} />
                <SummaryRow label="Brand / function" value={intake.brand} />
                <SummaryRow label="Questions answered" value={`${answeredCount} / 30`} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStage("assessment")}
                  className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  style={{ borderRadius: 2 }}
                >
                  Back to questions
                </button>
                <button
                  type="button"
                  onClick={submitAssessment}
                  className="border px-4 py-2 text-sm font-medium transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: themeStyles.accent,
                    borderColor: themeStyles.accent,
                    color: themeStyles.accentText,
                    borderRadius: 2,
                  }}
                  disabled={!assessmentComplete}
                >
                  Submit assessment
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {stage === "submitting" ? (
          <section className="border bg-white px-5 py-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6" style={{ borderColor: themeStyles.border }}>
            <div className="space-y-4">
              <div
                className="mx-auto h-10 w-10 animate-spin border-2 border-slate-200 border-t-slate-900 dark:border-slate-700 dark:border-t-slate-100"
                style={{ borderRadius: 2 }}
              />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Analysing your responses...
              </h2>
              <p className="mx-auto max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                We are scoring your answers and generating your summary. This may take a moment.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function FieldLabel({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="text-sm text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}
