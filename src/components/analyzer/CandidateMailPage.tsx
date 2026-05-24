"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useWorkspace } from "@/context/WorkspaceContext";
import CandidateEmailAutomationCard from "@/components/analyzer/CandidateEmailAutomationCard";
import {
  appendWorkspaceQuery,
  buildWorkspaceApiHeaders,
} from "@/lib/workspace-settings";
import type {
  HiringApplicationRecord,
  HiringFormDetail,
  HiringFormListItem,
} from "@/types/hiring-funnel";
import type { WorkspaceSessionRole } from "@/types/workspace-session";

type LoadState = "idle" | "loading" | "ready";

export default function CandidateMailPage({
  initialForms = null,
  initialSelectedForm = null,
  initialSelectedFormId = "",
  sessionRole,
  sessionEmail,
}: {
  initialForms?: HiringFormListItem[] | null;
  initialSelectedForm?: HiringFormDetail | null;
  initialSelectedFormId?: string;
  sessionRole: WorkspaceSessionRole;
  sessionEmail: string;
}) {
  const searchParams = useSearchParams();
  const { settings } = useWorkspace();
  const requestedFormId = searchParams.get("form")?.trim() ?? "";
  const requestedApplicationId = searchParams.get("application")?.trim() ?? "";
  const workspaceHeaders = useMemo(
    () => buildWorkspaceApiHeaders(settings.workspaceId),
    [settings.workspaceId]
  );

  const [forms, setForms] = useState<HiringFormListItem[]>(initialForms ?? []);
  const [selectedFormId, setSelectedFormId] = useState(initialSelectedFormId);
  const [selectedForm, setSelectedForm] = useState<HiringFormDetail | null>(
    initialSelectedForm
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [loadState, setLoadState] = useState<LoadState>(
    initialForms ? "ready" : "loading"
  );
  const [detailState, setDetailState] = useState<LoadState>(
    initialSelectedForm ? "ready" : initialSelectedFormId ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const selectedApplication = useMemo(
    () =>
      selectedForm?.applications.find((item) => item.id === selectedApplicationId) ??
      selectedForm?.applications.find((item) => item.applicant.email.trim()) ??
      selectedForm?.applications[0] ??
      null,
    [selectedApplicationId, selectedForm?.applications]
  );
  const totalApplications = useMemo(
    () => forms.reduce((sum, item) => sum + item.applicationCount, 0),
    [forms]
  );
  const activeForms = useMemo(
    () => forms.filter((item) => item.status === "active").length,
    [forms]
  );
  const emailableCandidates = useMemo(
    () =>
      (selectedForm?.applications ?? []).filter((item) => item.applicant.email.trim()).length,
    [selectedForm?.applications]
  );

  const refreshForms = useCallback(async () => {
    setLoadState("loading");
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery("/api/forms", settings.workspaceId),
        {
          cache: "no-store",
          headers: workspaceHeaders,
        }
      );
      const payload = (await response.json()) as { forms?: HiringFormListItem[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't load the candidate mail workspace.");
      }

      const nextForms = payload.forms ?? [];
      const targetId = requestedFormId || selectedFormId || nextForms[0]?.id || "";

      setForms(nextForms);
      setSelectedFormId(targetId);
      setLoadState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "I couldn't load the candidate mail workspace."
      );
      setLoadState("ready");
    }
  }, [requestedFormId, selectedFormId, settings.workspaceId, workspaceHeaders]);

  const loadFormDetail = useCallback(
    async (formId: string) => {
      setDetailState("loading");
      setError(null);
      setSelectedForm(null);
      setSelectedApplicationId("");

      try {
        const response = await fetch(
          appendWorkspaceQuery(`/api/forms/${formId}`, settings.workspaceId),
          {
            cache: "no-store",
            headers: workspaceHeaders,
          }
        );
        const payload = (await response.json()) as { form?: HiringFormDetail; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "I couldn't load that form.");
        }

        const nextForm = payload.form ?? null;
        setSelectedForm(nextForm);
        const preferredApplication = requestedApplicationId
          ? nextForm?.applications.find((item) => item.id === requestedApplicationId) ?? null
          : null;
        setSelectedApplicationId(
          preferredApplication?.id ||
            nextForm?.applications.find((item) => item.applicant.email.trim())?.id ||
            nextForm?.applications[0]?.id ||
            ""
        );
        setDetailState("ready");
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "I couldn't load that form."
        );
        setDetailState("ready");
      }
    },
    [requestedApplicationId, settings.workspaceId, workspaceHeaders]
  );

  useEffect(() => {
    if (initialForms) {
      return;
    }

    void refreshForms();
  }, [initialForms, refreshForms]);

  useEffect(() => {
    if (!requestedFormId || requestedFormId === selectedFormId) {
      return;
    }

    if (forms.some((form) => form.id === requestedFormId)) {
      setSelectedFormId(requestedFormId);
    }
  }, [forms, requestedFormId, selectedFormId]);

  useEffect(() => {
    if (!selectedFormId) {
      setSelectedForm(null);
      setDetailState("idle");
      return;
    }

    if (
      initialSelectedForm &&
      selectedFormId === initialSelectedForm.id &&
      selectedForm?.id === initialSelectedForm.id
    ) {
      return;
    }

    void loadFormDetail(selectedFormId);
  }, [initialSelectedForm, loadFormDetail, selectedForm?.id, selectedFormId]);

  useEffect(() => {
    if (!initialSelectedForm) {
      return;
    }

    const preferredApplication = requestedApplicationId
      ? initialSelectedForm.applications.find((item) => item.id === requestedApplicationId) ?? null
      : null;

    setSelectedApplicationId(
      preferredApplication?.id ||
        initialSelectedForm.applications.find((item) => item.applicant.email.trim())?.id ||
        initialSelectedForm.applications[0]?.id ||
        ""
    );
  }, [initialSelectedForm, requestedApplicationId]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Candidate mail workspace
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
                Compose, approve, and send candidate emails from one dedicated page
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                Open a hiring form, choose a candidate, generate a rejection or follow-up draft with AI, then send it only after admin approval by web or email.
              </p>
            </div>

            <div className="grid gap-2 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-2 dark:border-gray-800 dark:bg-gray-950/80 sm:grid-cols-3 xl:min-w-[500px]">
              <ReviewStat label="Forms" value={String(activeForms)} helper="Active" />
              <ReviewStat label="Submissions" value={String(totalApplications)} helper="Workspace total" />
              <ReviewStat label="Ready to email" value={String(emailableCandidates)} helper="Selected form" />
            </div>
          </div>
        </div>

        {error ? (
          <div className="border-b border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-danger-bg)] px-5 py-3 text-sm text-[var(--workspace-form-danger-text)] dark:border-gray-800 dark:bg-error-500/10 dark:text-error-100 sm:px-6">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)] sm:p-6">
          <div className="space-y-6">
            <section className="space-y-4 overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Forms
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  Choose a hiring form
                </h2>
              </div>

              {loadState === "loading" ? (
                <EmptyMessage text="Loading form list..." />
              ) : forms.length === 0 ? (
                <EmptyMessage text="No hiring forms have been published yet." />
              ) : (
                <div className="space-y-3">
                  {forms.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => setSelectedFormId(form.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selectedFormId === form.id
                          ? "border-[var(--workspace-form-accent)] bg-white shadow-[0_16px_28px_rgba(15,23,42,0.08)] dark:bg-gray-900"
                          : "border-[var(--workspace-form-border-soft)] bg-white/70 hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                            {form.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                            {form.team || "General team"}
                          </p>
                        </div>
                        <StatusBadge status={form.status} />
                      </div>
                      <p className="mt-3 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                        {form.applicationCount} submissions
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4 overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Candidates
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  Pick a candidate
                </h2>
              </div>

              {detailState === "loading" ? (
                <EmptyMessage text="Loading candidate submissions..." />
              ) : !selectedForm ? (
                <EmptyMessage text="Choose a hiring form to see its candidates." />
              ) : selectedForm.applications.length === 0 ? (
                <EmptyMessage text="No candidates have applied to this form yet." />
              ) : (
                <div className="space-y-3">
                  {selectedForm.applications.map((application) => (
                    <CandidateMailListItem
                      key={application.id}
                      application={application}
                      isActive={selectedApplication?.id === application.id}
                      onClick={() => setSelectedApplicationId(application.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="min-w-0">
            {selectedApplication && selectedForm ? (
              <CandidateEmailAutomationCard
                application={selectedApplication}
                formTitle={selectedForm.title}
                formTeam={selectedForm.team}
                sessionRole={sessionRole}
                sessionEmail={sessionEmail}
              />
            ) : (
              <EmptyMessage text="Choose a candidate with an application record to open the candidate mail workspace." />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CandidateMailListItem({
  application,
  isActive,
  onClick,
}: {
  application: HiringApplicationRecord;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName = getApplicationDisplayName(application);
  const hasEmail = Boolean(application.applicant.email.trim());

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isActive
          ? "border-[var(--workspace-form-accent)] bg-white shadow-[0_16px_28px_rgba(15,23,42,0.08)] dark:bg-gray-900"
          : "border-[var(--workspace-form-border-soft)] bg-white/70 hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-900/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${
            isActive
              ? "bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200"
              : "bg-[var(--workspace-form-surface)] text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300"
          }`}
        >
          {getInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                {displayName}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                {application.applicant.email || "No email captured"}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-[var(--workspace-form-pill-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
              {application.analysis.result.score.value}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--workspace-form-surface)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300">
              {application.analysis.result.recommendation.decision}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${
                hasEmail
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100"
              }`}
            >
              {hasEmail ? "Email ready" : "No email"}
            </span>
          </div>

          <p className="mt-3 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
            {formatDate(application.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

function ReviewStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-transparent bg-white/80 px-4 py-3 dark:border-gray-800/80 dark:bg-gray-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold leading-none text-[var(--workspace-form-title)] dark:text-white">
          {value}
        </p>
        <p className="text-right text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-muted)] dark:text-gray-400">
          {helper}
        </p>
      </div>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white px-4 py-6 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "expired" | "unpublished" }) {
  return (
    <span
      className={`rounded-md px-3 py-1 text-xs font-medium ${
        status === "unpublished"
          ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          : status === "expired"
            ? "bg-[var(--workspace-form-warning-bg)] text-[var(--workspace-form-warning-text)]"
            : "bg-[var(--workspace-form-success-bg)] text-[var(--workspace-form-success-text)]"
      }`}
    >
      {status}
    </span>
  );
}

function getApplicationDisplayName(application: HiringApplicationRecord) {
  return (
    application.analysis.result.candidateProfile.name ||
    application.applicant.fullName ||
    application.resumeFile.fileName
  );
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "CV";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}
