"use client";

import { useMemo, useState } from "react";

import type { WorkspaceAuditEvent } from "@/lib/workspace-audit-store";

export default function WorkspaceAuditPage({
  events,
}: {
  events: WorkspaceAuditEvent[];
}) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  const actionOptions = useMemo(
    () => Array.from(new Set(events.map((event) => event.action))).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      if (actionFilter !== "all" && event.action !== actionFilter) {
        return false;
      }

      if (actorFilter !== "all" && event.actorRole !== actorFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        event.summary,
        event.actorEmail,
        event.targetType,
        event.targetId,
        event.action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [actionFilter, actorFilter, events, query]);

  const adminEvents = useMemo(
    () => events.filter((event) => event.actorRole === "admin").length,
    [events]
  );
  const systemEvents = useMemo(
    () => events.filter((event) => !event.actorEmail).length,
    [events]
  );

  return (
    <div className="space-y-6 py-6 sm:py-8 md:py-10">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-6 border-b border-gray-200 p-6 dark:border-gray-800 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
              Audit log
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              Review sensitive workspace activity in one place
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              Track workflow changes, access updates, billing events, and integration changes without digging through individual screens.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Events loaded" value={String(events.length)} helper="Most recent workspace actions" />
            <MetricCard label="Admin actions" value={String(adminEvents)} helper="Explicit admin-led changes" />
            <MetricCard label="System events" value={String(systemEvents)} helper="Automatic or background activity" />
            <a
              href="/api/workspace/audit?format=csv"
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-left transition hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950/70 dark:hover:border-gray-700 dark:hover:bg-gray-900"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Export
              </p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                CSV
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Download the current audit feed
              </p>
            </a>
          </div>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              placeholder="Search summary, actor, action, or target"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">Action</span>
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            >
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">Actor</span>
            <select
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            >
              <option value="all">All actors</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">
              Event feed
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} match the current filters.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Badge>{event.action}</Badge>
                      <Badge>{event.targetType}</Badge>
                      <Badge>{event.actorRole}</Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {event.summary}
                    </p>
                    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {event.actorEmail || "System"} • Target {event.targetId || "n/a"}
                    </p>
                    {Object.keys(event.metadata ?? {}).length > 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs leading-6 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm leading-6 text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No audit events match the current filters yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
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

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-900">
      {children}
    </span>
  );
}
