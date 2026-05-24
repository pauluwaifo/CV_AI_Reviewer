"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { WorkspaceAnalyticsSummary } from "@/lib/workspace-analytics";

export default function WorkspaceAnalyticsPage({
  analytics,
}: {
  analytics: WorkspaceAnalyticsSummary;
}) {
  return (
    <div className="space-y-6 py-6 sm:py-8 md:py-10">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-6 border-b border-gray-200 p-6 dark:border-gray-800 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
              Workspace analytics
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              See what is moving in your hiring workspace
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              Track submission quality, workflow movement, form performance, screening activity,
              and recent operational events from one shared view.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AnalyticsHeroCard
              label="Submissions"
              value={String(analytics.submissions.total)}
              helper={`${analytics.submissions.recent} in the last 7 days`}
            />
            <AnalyticsHeroCard
              label="Shortlist rate"
              value={`${analytics.submissions.shortlistRate}%`}
              helper={`${analytics.submissions.interviewReadyCount} interview-ready`}
            />
            <AnalyticsHeroCard
              label="Interviews"
              value={String(analytics.interviews.completed)}
              helper={`${analytics.interviews.scheduled} scheduled`}
            />
            <AnalyticsHeroCard
              label="AI screenings"
              value={String(analytics.screenings.total)}
              helper={`${analytics.screenings.recent} in the last 7 days`}
            />
          </div>
        </div>

        <div className="grid gap-3 p-6 lg:grid-cols-3">
          {analytics.highlights.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <Panel title="Pipeline movement" description="How candidates are distributed across your workflow stages.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analytics.stageBreakdown.length > 0 ? (
                analytics.stageBreakdown.map((item) => (
                  <MetricTile key={item.label} label={item.label} value={String(item.count)} />
                ))
              ) : (
                <EmptyState text="No candidate workflow activity has been recorded yet." />
              )}
            </div>
          </Panel>

          <Panel title="Decision mix" description="How the AI recommendation layer is currently classifying applicants.">
            <BreakdownList items={analytics.decisionBreakdown} tone="brand" />
          </Panel>

          <Panel
            title="Interview scorecards"
            description="How completed interview reviews are currently leaning."
          >
            <BreakdownList
              items={analytics.interviews.recommendationBreakdown}
              tone="brand"
            />
          </Panel>

          <Panel title="Top hiring forms" description="The forms currently producing the most candidate activity.">
            <div className="space-y-3">
              {analytics.topForms.length > 0 ? (
                analytics.topForms.map((form) => (
                  <div
                    key={form.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {form.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {form.applicationCount} submissions • avg score {form.averageScore}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <Badge label={`${form.shortlistCount} shortlisted`} />
                        <Badge label={`${form.interviewCount} in interview`} />
                        <Link
                          href={`/pipeline?form=${encodeURIComponent(form.id)}`}
                          className="rounded-full border border-gray-300 px-3 py-1 hover:bg-white dark:border-gray-700 dark:hover:bg-white/5"
                        >
                          Open pipeline
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState text="Create and publish a hiring form to start tracking performance." />
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Form health" description="A quick view of published form inventory.">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label="All forms" value={String(analytics.forms.total)} />
              <MetricTile label="Active" value={String(analytics.forms.active)} />
              <MetricTile label="Unpublished" value={String(analytics.forms.unpublished)} />
            </div>
          </Panel>

          <Panel
            title="Submission quality"
            description="How strong the average screening outcome currently looks."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label="Average score" value={String(analytics.submissions.averageScore)} />
              <MetricTile
                label="Interview-ready"
                value={String(analytics.submissions.interviewReadyCount)}
              />
              <MetricTile
                label="Shortlist rate"
                value={`${analytics.submissions.shortlistRate}%`}
              />
            </div>
          </Panel>

          <Panel title="Submission sources" description="Where recent candidate records are coming from.">
            <BreakdownList items={analytics.sourceBreakdown} tone="neutral" />
          </Panel>

          <Panel title="Audit trail" description="Recent events recorded across forms, applications, and workflow actions.">
            <div className="mb-4 flex justify-end">
              <Link
                href="/audit"
                className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
              >
                Open full audit log
              </Link>
            </div>
            <div className="space-y-3">
              {analytics.auditEvents.length > 0 ? (
                analytics.auditEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {event.summary}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {event.actorEmail || "System"} • {event.action} • {event.targetType}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState text="Audit events will appear here once hiring activity starts." />
              )}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">
          {title}
        </p>
        <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AnalyticsHeroCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70">
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function BreakdownList({
  items,
  tone,
}: {
  items: Array<{ count: number; label: string }>;
  tone: "brand" | "neutral";
}) {
  if (items.length === 0) {
    return <EmptyState text="No activity has been recorded here yet." />;
  }

  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const width = total > 0 ? Math.max(8, Math.round((item.count / total) * 100)) : 8;
        const barClassName =
          tone === "brand" ? "bg-brand-500 dark:bg-brand-400" : "bg-gray-400 dark:bg-gray-500";

        return (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
              <span>{item.label}</span>
              <span className="font-medium">{item.count}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-900">
              <div className={`h-2 rounded-full ${barClassName}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm leading-6 text-gray-500 dark:border-gray-700 dark:text-gray-400">
      {text}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 dark:bg-gray-900">
      {label}
    </span>
  );
}
