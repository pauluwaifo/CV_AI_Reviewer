"use client";

import Link from "next/link";

import type { WorkspaceOperationsSummary } from "@/lib/workspace-operations";

export default function WorkspaceOperationsPage({
  operations,
}: {
  operations: WorkspaceOperationsSummary;
}) {
  return (
    <div className="space-y-6 py-6 sm:py-8 md:py-10">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-6 border-b border-gray-200 p-6 dark:border-gray-800 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
              Operations queue
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              Work the next hiring actions without hunting through the pipeline
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              Follow up on overdue candidates, keep interviews moving, assign ownership,
              and catch reviews that are going stale before momentum drops.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Overdue"
              value={String(operations.totals.overdue)}
              helper="Reminders already past due"
              tone="danger"
            />
            <MetricCard
              label="Due soon"
              value={String(operations.totals.upcoming)}
              helper="Follow-ups inside the next 36 hours"
            />
            <MetricCard
              label="Interviews soon"
              value={String(operations.totals.interviewsSoon)}
              helper="Scheduled interviews still needing follow-through"
            />
            <MetricCard
              label="Unassigned"
              value={String(operations.totals.unassigned)}
              helper="Active candidates with no owner yet"
            />
          </div>
        </div>

        <div className="grid gap-3 p-6 lg:grid-cols-3">
          <Highlight text={`${operations.totals.activeCandidates} active candidate records are still in play across the workspace.`} />
          <Highlight text={`${operations.totals.stale} review${operations.totals.stale === 1 ? "" : "s"} have gone quiet long enough to need a nudge.`} />
          <Highlight text="Every queue item links straight back into the exact candidate view so recruiters can act immediately." />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="space-y-6">
          <QueueSection
            title="Overdue follow-ups"
            description="Candidates whose follow-up reminder has already passed."
            items={operations.sections.overdue}
            emptyText="No overdue follow-ups right now."
          />
          <QueueSection
            title="Upcoming interviews"
            description="Scheduled interviews that still need prep or a completed scorecard."
            items={operations.sections.interviews}
            emptyText="No interview actions are due yet."
          />
        </div>

        <div className="space-y-6">
          <QueueSection
            title="Due soon"
            description="Candidate reminders that are approaching in the next day and a half."
            items={operations.sections.upcoming}
            emptyText="Nothing is coming due soon."
          />
          <QueueSection
            title="Ownership gaps"
            description="Active candidates that still need a recruiter owner."
            items={operations.sections.unassigned}
            emptyText="Every active candidate already has an owner."
          />
          <QueueSection
            title="Stale reviews"
            description="Candidates who have been sitting without recent outreach or movement."
            items={operations.sections.stale}
            emptyText="No stale reviews right now."
          />
        </div>
      </section>
    </div>
  );
}

function QueueSection({
  title,
  description,
  items,
  emptyText,
}: {
  title: string;
  description: string;
  items: WorkspaceOperationsSummary["sections"][keyof WorkspaceOperationsSummary["sections"]];
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">
          {title}
        </p>
        <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Badge tone={item.priority}>{humanizePriority(item.priority)}</Badge>
                    <Badge>{item.stageLabel}</Badge>
                    <Badge>{item.formTitle}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {item.candidateName}
                    </p>
                    <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                      {item.description}
                    </p>
                  </div>
                  <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                    <Meta label="Owner" value={item.ownerEmail || "Unassigned"} />
                    <Meta label="Next step" value={item.nextStep || "Not captured yet"} />
                    <Meta label="Due" value={formatDue(item.dueAt)} />
                    <Meta label="Candidate mail" value="Available for follow-up or rejection" />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                  <Link
                    href={item.reviewHref}
                    className="inline-flex items-center justify-center rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Open candidate
                  </Link>
                  <Link
                    href={item.mailHref}
                    className="inline-flex items-center justify-center rounded-full bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-600"
                  >
                    Open mail
                  </Link>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm leading-6 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  helper: string;
  label: string;
  value: string;
  tone?: "danger" | "neutral";
}) {
  const className =
    tone === "danger"
      ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
      : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/70";

  return (
    <div className={`rounded-xl border px-4 py-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{helper}</p>
    </div>
  );
}

function Highlight({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
      {text}
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "high" | "low" | "medium" | "neutral";
}) {
  const className =
    tone === "high"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
      : tone === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

  return <span className={`rounded-full border px-3 py-1 ${className}`}>{children}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium text-gray-700 dark:text-gray-200">{label}:</span> {value}
    </p>
  );
}

function formatDue(value: string | null) {
  if (!value) {
    return "No date set";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "No date set";
  }

  return parsed.toLocaleString();
}

function humanizePriority(value: "high" | "medium" | "low") {
  switch (value) {
    case "high":
      return "High priority";
    case "medium":
      return "Needs attention";
    default:
      return "Routine";
  }
}
