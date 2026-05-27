"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import {
  describeHiringApplicationStage,
  getDefaultHiringApplicationNextStep,
  HIRING_APPLICATION_STAGE_OPTIONS,
  parseWorkflowTags,
} from "@/lib/hiring-application-workflow";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import type { HiringApplicationRecord } from "@/types/hiring-funnel";

export default function CandidateWorkflowPanel({
  application,
  onUpdated,
  workspaceId,
}: {
  application: HiringApplicationRecord;
  onUpdated: (application: HiringApplicationRecord) => void;
  workspaceId: string;
}) {
  const [stage, setStage] = useState(application.workflow.stage);
  const [ownerEmail, setOwnerEmail] = useState(application.workflow.ownerEmail);
  const [nextStep, setNextStep] = useState(application.workflow.nextStep);
  const [followUpAt, setFollowUpAt] = useState(
    toDateTimeLocalValue(application.workflow.followUpAt)
  );
  const [lastContactedAt, setLastContactedAt] = useState(
    toDateTimeLocalValue(application.workflow.lastContactedAt)
  );
  const [interviewDate, setInterviewDate] = useState(
    toDateTimeLocalValue(application.workflow.interviewDate)
  );
  const [interviewPlan, setInterviewPlan] = useState(application.workflow.interviewPlan);
  const [recruiterNotes, setRecruiterNotes] = useState(application.workflow.recruiterNotes);
  const [tagDraft, setTagDraft] = useState(application.workflow.tags.join(", "));
  const [feedback, setFeedback] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStage(application.workflow.stage);
    setOwnerEmail(application.workflow.ownerEmail);
    setNextStep(application.workflow.nextStep);
    setFollowUpAt(toDateTimeLocalValue(application.workflow.followUpAt));
    setLastContactedAt(toDateTimeLocalValue(application.workflow.lastContactedAt));
    setInterviewDate(toDateTimeLocalValue(application.workflow.interviewDate));
    setInterviewPlan(application.workflow.interviewPlan);
    setRecruiterNotes(application.workflow.recruiterNotes);
    setTagDraft(application.workflow.tags.join(", "));
    setFeedback("");
  }, [application.id, application.workflow]);

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
            followUpAt: fromDateTimeLocalValue(followUpAt),
            interviewDate: fromDateTimeLocalValue(interviewDate),
            interviewPlan,
            lastContactedAt: fromDateTimeLocalValue(lastContactedAt),
            nextStep,
            ownerEmail,
            recruiterNotes,
            stage,
            tags: parseWorkflowTags(tagDraft),
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { application?: HiringApplicationRecord; error?: string }
        | null;

      if (!response.ok || !payload?.application) {
        throw new Error(payload?.error || "I couldn't save that workflow update.");
      }

      onUpdated(payload.application);
      setFeedback("Workflow saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "I couldn't save that workflow update."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
            Workflow hub
          </p>
          <p className="text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
            Move the candidate through the pipeline, assign ownership, and capture the next interview step.
          </p>
        </div>
        <span className="rounded-full bg-[var(--workspace-form-surface)] px-3 py-1 text-xs font-medium text-[var(--workspace-form-title)] dark:bg-gray-950/60 dark:text-white">
          {describeHiringApplicationStage(stage)}
        </span>
      </div>

      {application.workflow.automationSummary ? (
        <div className="mt-4 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
          <span className="font-medium text-[var(--workspace-form-title)] dark:text-white">
            Automation:
          </span>{" "}
          {application.workflow.automationSummary}
        </div>
      ) : null}

      {application.workflow.automationLog.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Recent automations
            </p>
            <span className="text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
              Latest workflow assists
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
            {application.workflow.automationLog.slice(0, 4).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Field label="Stage">
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value as typeof stage)}
            className={inputClassName}
          >
            {HIRING_APPLICATION_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner email">
          <input
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
            className={inputClassName}
            placeholder="recruiter@company.com"
            type="email"
          />
        </Field>
        <Field label="Next step">
          <input
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
            className={inputClassName}
            placeholder="Book recruiter screen"
          />
        </Field>
        <Field label="Tags">
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            className={inputClassName}
            placeholder="frontend, lagos, urgent"
          />
        </Field>
        <Field label="Last contacted">
          <input
            value={lastContactedAt}
            onChange={(event) => setLastContactedAt(event.target.value)}
            className={inputClassName}
            type="datetime-local"
          />
        </Field>
        <Field label="Follow-up reminder">
          <input
            value={followUpAt}
            onChange={(event) => setFollowUpAt(event.target.value)}
            className={inputClassName}
            type="datetime-local"
          />
        </Field>
        <Field label="Interview date">
          <input
            value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
            className={inputClassName}
            type="datetime-local"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Field label="Interview plan">
          <textarea
            value={interviewPlan}
            onChange={(event) => setInterviewPlan(event.target.value)}
            className={`${inputClassName} min-h-32`}
            placeholder="What should the interview focus on?"
          />
        </Field>
        <Field label="Recruiter notes">
          <textarea
            value={recruiterNotes}
            onChange={(event) => setRecruiterNotes(event.target.value)}
            className={`${inputClassName} min-h-32`}
            placeholder="Capture context, blockers, or summary notes."
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLastContactedAt(toDateTimeLocalValue(new Date().toISOString()))}
          className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
        >
          Mark contact now
        </button>
        <button
          type="button"
          onClick={() => setFollowUpAt(toDateTimeLocalValue(addDaysToNow(1)))}
          className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
        >
          Remind tomorrow
        </button>
        <button
          type="button"
          onClick={() => setNextStep(getDefaultHiringApplicationNextStep(stage))}
          className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
        >
          Use stage next step
        </button>
        {followUpAt ? (
          <button
            type="button"
            onClick={() => setFollowUpAt("")}
            className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
          >
            Clear reminder
          </button>
        ) : null}
        {application.workflow.interviewKit.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              setInterviewPlan(application.workflow.interviewKit.map((item) => `- ${item}`).join("\n"))
            }
            className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
          >
            Load interview kit
          </button>
        ) : null}
        {application.workflow.interviewDate ? (
          <a
            href={appendWorkspaceQuery(
              `/api/applications/${application.id}/interview-event`,
              workspaceId
            )}
            className="inline-flex items-center justify-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-3 py-2 text-xs font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-white"
          >
            Export calendar invite
          </a>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--workspace-form-muted)] dark:text-gray-400">
          {feedback || "Saving here updates the candidate record, audit trail, and connected webhook events."}
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving workflow..." : "Save workflow"}
        </button>
      </div>
    </section>
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
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
        {label}
      </span>
      {children}
    </label>
  );
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function addDaysToNow(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

const inputClassName =
  "w-full rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";
