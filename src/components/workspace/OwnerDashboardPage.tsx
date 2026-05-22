"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import type {
  OwnerDashboardSnapshot,
  OwnerWorkspaceSummary,
} from "@/lib/owner-dashboard-store";
import type { WorkspaceAccessResetRequest } from "@/lib/workspace-access-reset-store";

type OwnerSection = "overview" | "recovery" | "workspaces" | "insights";

type ResetIntent =
  | {
      mode: "request";
      requestId: string;
      title: string;
      workspaceId: string;
    }
  | {
      mode: "workspace";
      title: string;
      workspaceId: string;
    };

type DeleteIntent = {
  title: string;
  workspaceId: string;
};

type ResetView = "pending" | "all" | "resolved";
type WorkspaceFilter = "all" | "attention" | "healthy";
type WorkspaceSort = "activity" | "recent" | "name";

type RecentKeyEvent = {
  id: string;
  accessKey: string;
  title: string;
  workspaceId: string;
  detail: string;
};

export default function OwnerDashboardPage({
  section,
  snapshot,
}: {
  section: OwnerSection;
  snapshot: OwnerDashboardSnapshot;
}) {
  const [workspaces, setWorkspaces] = useState(snapshot.workspaces);
  const [resetRequests, setResetRequests] = useState(snapshot.accessResetRequests);
  const [resetActionId, setResetActionId] = useState<string | null>(null);
  const [resetActionError, setResetActionError] = useState<string | null>(null);
  const [issuedKeys, setIssuedKeys] = useState<Record<string, string>>({});
  const [workspaceIssuedKeys, setWorkspaceIssuedKeys] = useState<Record<string, string>>({});
  const [resetIntent, setResetIntent] = useState<ResetIntent | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [nextAccessKey, setNextAccessKey] = useState("");
  const [deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation] = useState("");
  const [deleteActionId, setDeleteActionId] = useState<string | null>(null);
  const [deleteActionError, setDeleteActionError] = useState<string | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<WorkspaceFilter>("all");
  const [workspaceSort, setWorkspaceSort] = useState<WorkspaceSort>("activity");
  const [resetView, setResetView] = useState<ResetView>("pending");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    snapshot.workspaces[0]?.workspaceId ?? ""
  );

  const pendingResetCount = resetRequests.filter(
    (request) => request.status === "pending"
  ).length;
  const resolvedResetCount = resetRequests.filter(
    (request) => request.status === "resolved"
  ).length;
  const totalWorkspaces = workspaces.length;
  const totalForms = workspaces.reduce((sum, item) => sum + item.formsCount, 0);
  const totalApplications = workspaces.reduce((sum, item) => sum + item.applicationsCount, 0);
  const totalUploads = workspaces.reduce((sum, item) => sum + item.uploadsCount, 0);
  const totalWorkspaceActivity = totalForms + totalApplications + totalUploads;
  const averageApplicationsPerWorkspace =
    totalWorkspaces > 0 ? Math.round(totalApplications / totalWorkspaces) : 0;
  const pendingResetWorkspaceIds = new Set(
    resetRequests
      .filter((request) => request.status === "pending")
      .map((request) => request.workspaceId)
  );
  const attentionWorkspaces = workspaces.filter(
    (workspace) => getWorkspaceAttentionReasons(workspace, resetRequests).length > 0
  );
  const healthyWorkspaceCount = Math.max(totalWorkspaces - attentionWorkspaces.length, 0);
  const zeroActivityCount = workspaces.filter(
    (workspace) => getWorkspaceTotalActivity(workspace) === 0
  ).length;
  const missingContactCount = workspaces.filter(
    (workspace) => !workspace.contactEmail.trim()
  ).length;
  const highActivityWorkspaces = workspaces.filter(
    (workspace) => getWorkspaceTotalActivity(workspace) >= 15
  ).length;
  const filteredResetRequests = resetRequests.filter((request) => {
    if (resetView === "pending") {
      return request.status === "pending";
    }

    if (resetView === "resolved") {
      return request.status === "resolved";
    }

    return true;
  });
  const normalizedWorkspaceQuery = workspaceQuery.trim().toLowerCase();
  const filteredWorkspaces = [...workspaces]
    .filter((workspace) => {
      if (workspaceFilter === "attention") {
        return getWorkspaceAttentionReasons(workspace, resetRequests).length > 0;
      }

      if (workspaceFilter === "healthy") {
        return getWorkspaceAttentionReasons(workspace, resetRequests).length === 0;
      }

      return true;
    })
    .filter((workspace) => {
      if (!normalizedWorkspaceQuery) {
        return true;
      }

      const haystack = [
        workspace.organizationName,
        workspace.workspaceId,
        workspace.appName,
        workspace.contactEmail,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedWorkspaceQuery);
    })
    .sort((left, right) => sortWorkspaces(left, right, workspaceSort));
  const selectedWorkspace =
    filteredWorkspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ??
    workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ??
    filteredWorkspaces[0] ??
    workspaces[0] ??
    null;
  const topWorkspaces = [...workspaces]
    .sort((left, right) => getWorkspaceTotalActivity(right) - getWorkspaceTotalActivity(left))
    .slice(0, 5);
  const recentKeyEvents = buildRecentKeyEvents({
    issuedKeys,
    resetRequests,
    workspaceIssuedKeys,
    workspaces,
  });
  const selectedWorkspaceAttention = selectedWorkspace
    ? getWorkspaceAttentionReasons(selectedWorkspace, resetRequests)
    : [];

  function openResetModal(intent: ResetIntent) {
    setResetActionError(null);
    setOwnerPassword("");
    setNextAccessKey("");
    setResetIntent(intent);
  }

  function openDeleteModal(intent: DeleteIntent) {
    setDeleteActionError(null);
    setOwnerPassword("");
    setDeleteWorkspaceConfirmation("");
    setDeleteIntent(intent);
  }

  async function handleRejectRequest(requestId: string) {
    if (resetActionId) {
      return;
    }

    setResetActionId(requestId);
    setResetActionError(null);

    try {
      const response = await fetch("/api/owner/access-key-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reject", requestId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            request?: WorkspaceAccessResetRequest;
          }
        | null;

      if (!response.ok || !payload?.request) {
        throw new Error(payload?.error || "I couldn't reject that reset request.");
      }

      const updatedRequest = payload.request;

      setResetRequests((current) =>
        current.map((requestItem) =>
          requestItem.id === updatedRequest.id ? updatedRequest : requestItem
        )
      );
    } catch (error) {
      setResetActionError(
        error instanceof Error
          ? error.message
          : "I couldn't reject that reset request."
      );
    } finally {
      setResetActionId(null);
    }
  }

  async function handleConfirmReset() {
    if (!resetIntent || resetActionId) {
      return;
    }

    const accessKey = nextAccessKey.trim();

    if (!accessKey) {
      setResetActionError(
        "Enter the new company access key first, or use Generate automatically."
      );
      return;
    }

    const actionId =
      resetIntent.mode === "request" ? resetIntent.requestId : resetIntent.workspaceId;

    setResetActionId(actionId);
    setResetActionError(null);

    try {
      const response = await fetch("/api/owner/access-key-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          resetIntent.mode === "request"
            ? {
                action: "issue-new-key",
                adminPassword: ownerPassword,
                accessKey,
                requestId: resetIntent.requestId,
              }
            : {
                action: "reset-workspace",
                adminPassword: ownerPassword,
                accessKey,
                workspaceId: resetIntent.workspaceId,
              }
        ),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            accessKey?: string;
            error?: string;
            request?: WorkspaceAccessResetRequest;
            workspaceId?: string;
          }
        | null;

      if (!response.ok || !payload?.accessKey) {
        throw new Error(payload?.error || "I couldn't reset that company access key.");
      }

      if (payload.request) {
        const updatedRequest = payload.request;

        setResetRequests((current) =>
          current.map((requestItem) =>
            requestItem.id === updatedRequest.id ? updatedRequest : requestItem
          )
        );
        setIssuedKeys((current) => ({
          ...current,
          [updatedRequest.id]: payload.accessKey as string,
        }));
      }

      if (payload.workspaceId) {
        setWorkspaceIssuedKeys((current) => ({
          ...current,
          [payload.workspaceId as string]: payload.accessKey as string,
        }));
      }

      setResetIntent(null);
      setOwnerPassword("");
      setNextAccessKey("");
    } catch (error) {
      setResetActionError(
        error instanceof Error
          ? error.message
          : "I couldn't reset that company access key."
      );
    } finally {
      setResetActionId(null);
    }
  }

  async function handleDeleteWorkspace() {
    if (!deleteIntent || deleteActionId) {
      return;
    }

    if (!ownerPassword.trim()) {
      setDeleteActionError("Enter your owner password before deleting a workspace.");
      return;
    }

    if (deleteWorkspaceConfirmation.trim() !== deleteIntent.workspaceId) {
      setDeleteActionError("Type the exact workspace ID before deleting this workspace.");
      return;
    }

    setDeleteActionId(deleteIntent.workspaceId);
    setDeleteActionError(null);

    try {
      const workspaceId = deleteIntent.workspaceId;
      const fallbackWorkspaceId =
        workspaces.find((workspace) => workspace.workspaceId !== workspaceId)?.workspaceId ?? "";
      const requestIdsToRemove = resetRequests
        .filter((requestItem) => requestItem.workspaceId === workspaceId)
        .map((requestItem) => requestItem.id);
      const response = await fetch(`/api/owner/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminPassword: ownerPassword,
          confirmWorkspaceId: deleteWorkspaceConfirmation.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            workspaceId?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "I couldn't delete that workspace.");
      }

      setWorkspaces((current) =>
        current.filter((workspaceItem) => workspaceItem.workspaceId !== workspaceId)
      );
      setResetRequests((current) =>
        current.filter((requestItem) => requestItem.workspaceId !== workspaceId)
      );
      setWorkspaceIssuedKeys((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });
      setIssuedKeys((current) => {
        const next = { ...current };
        for (const requestId of requestIdsToRemove) {
          delete next[requestId];
        }
        return next;
      });
      setSelectedWorkspaceId((current) =>
        current === workspaceId ? fallbackWorkspaceId : current
      );
      setDeleteIntent(null);
      setOwnerPassword("");
      setDeleteWorkspaceConfirmation("");
      setDeleteActionError(null);
    } catch (error) {
      setDeleteActionError(
        error instanceof Error ? error.message : "I couldn't delete that workspace."
      );
    } finally {
      setDeleteActionId(null);
    }
  }

  const pageDefinition =
    section === "overview"
      ? {
          eyebrow: "Owner Overview",
          title: "Cross-workspace command center",
          description:
            "Monitor adoption, health, and high-priority owner actions across every workspace from one clean dashboard view.",
        }
      : section === "recovery"
        ? {
            eyebrow: "Recovery",
            title: "Access recovery and secure key handling",
            description:
              "Review reset requests, issue new company keys manually, and keep a one-time record of generated credentials during this session.",
          }
        : section === "workspaces"
          ? {
              eyebrow: "Workspaces",
              title: "Company registry and lifecycle controls",
              description:
                "Search every workspace, inspect a company in detail, and trigger owner-only actions like resets and deletions.",
            }
          : {
              eyebrow: "Insights",
              title: "Platform health and adoption signals",
              description:
                "Track the strongest and weakest workspaces, spot recovery pressure, and understand how tenant usage is trending across the platform.",
            };

  return (
    <div className="space-y-6 py-6 sm:py-8 md:py-10">
      <PageHero
        eyebrow={pageDefinition.eyebrow}
        title={pageDefinition.title}
        description={pageDefinition.description}
      />

      {section === "overview" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Companies"
              value={formatCompactNumber(totalWorkspaces)}
              caption={`${healthyWorkspaceCount.toLocaleString()} stable`}
            />
            <MetricCard
              label="Attention"
              value={formatCompactNumber(attentionWorkspaces.length)}
              caption="Need owner review"
              tone="warning"
            />
            <MetricCard
              label="Applications"
              value={formatCompactNumber(totalApplications)}
              caption="Candidate intake"
            />
            <MetricCard
              label="Uploads"
              value={formatCompactNumber(totalUploads)}
              caption="Resume storage"
            />
            <MetricCard
              label="Pending resets"
              value={formatCompactNumber(pendingResetCount)}
              caption="Recovery queue"
              tone="warning"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <OwnerPanel
              eyebrow="Priority Queue"
              title="What needs owner action next"
              description="The most urgent owner-side items across all workspaces."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <SignalTile
                  label="Pending reset requests"
                  value={pendingResetCount.toLocaleString()}
                  note="Companies waiting on a new access key."
                />
                <SignalTile
                  label="Missing admin emails"
                  value={missingContactCount.toLocaleString()}
                  note="Recovery communication risk."
                />
                <SignalTile
                  label="Zero-activity workspaces"
                  value={zeroActivityCount.toLocaleString()}
                  note="No forms, applications, or uploads yet."
                />
              </div>

              <div className="mt-5 space-y-3">
                {resetRequests.filter((request) => request.status === "pending").slice(0, 4).map((request) => (
                  <CompactRequestRow
                    key={request.id}
                    request={request}
                    onOpen={() =>
                      openResetModal({
                        mode: "request",
                        requestId: request.id,
                        title: `Reset ${request.workspaceId}`,
                        workspaceId: request.workspaceId,
                      })
                    }
                  />
                ))}
                {pendingResetCount === 0 ? (
                  <EmptyInlineState message="No pending recovery requests right now." />
                ) : null}
              </div>
            </OwnerPanel>

            <OwnerPanel
              eyebrow="Top Workspaces"
              title="Most active companies"
              description="Quick access to the tenants driving the most activity across the platform."
            >
              <div className="space-y-3">
                {topWorkspaces.length > 0 ? (
                  topWorkspaces.map((workspace) => (
                    <button
                      key={workspace.workspaceId}
                      type="button"
                      onClick={() => setSelectedWorkspaceId(workspace.workspaceId)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${
                        selectedWorkspace?.workspaceId === workspace.workspaceId
                          ? "border-brand-200 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10"
                          : "border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/70 dark:hover:bg-gray-900"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {workspace.organizationName}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {workspace.workspaceId}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCompactNumber(getWorkspaceTotalActivity(workspace))}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          activity
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyInlineState message="Top workspaces will appear once companies start using forms and pipeline tools." />
                )}
              </div>
            </OwnerPanel>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <ActionCard
              title="Open recovery center"
              description="Handle reset requests and issue new company keys from a focused owner workflow."
              href="/owner/recovery"
              action="Go to recovery"
            />
            <ActionCard
              title="Browse workspaces"
              description="Search, inspect, and manage company tenants in a dedicated registry view."
              href="/owner/workspaces"
              action="Open workspace registry"
            />
            <ActionCard
              title="Review platform insights"
              description="Check which tenants are healthy, active, risky, or still waiting to onboard."
              href="/owner/insights"
              action="Open insights"
            />
          </section>
        </>
      ) : null}

      {section === "recovery" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <OwnerPanel
            eyebrow="Reset Queue"
            title="Company access-key requests"
            description="Filter the queue, inspect each request, and issue a replacement key only when you are ready."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={resetView === "pending"}
                  label={`Pending (${pendingResetCount})`}
                  onClick={() => setResetView("pending")}
                />
                <FilterButton
                  active={resetView === "all"}
                  label={`All (${resetRequests.length})`}
                  onClick={() => setResetView("all")}
                />
                <FilterButton
                  active={resetView === "resolved"}
                  label={`Resolved (${resolvedResetCount})`}
                  onClick={() => setResetView("resolved")}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Manual-first key issue flow
              </p>
            </div>

            {resetActionError ? (
              <AlertBox tone="error" className="mt-4">
                {resetActionError}
              </AlertBox>
            ) : null}

            <div className="mt-5 space-y-3">
              {filteredResetRequests.length > 0 ? (
                filteredResetRequests.map((request) => (
                  <ResetRequestCard
                    key={request.id}
                    issuedKey={issuedKeys[request.id]}
                    isWorking={resetActionId === request.id}
                    request={request}
                    onIssue={() =>
                      openResetModal({
                        mode: "request",
                        requestId: request.id,
                        title: `Reset ${request.workspaceId}`,
                        workspaceId: request.workspaceId,
                      })
                    }
                    onReject={() => void handleRejectRequest(request.id)}
                  />
                ))
              ) : (
                <EmptyState
                  title="No requests in this filter"
                  description="Change the queue filter above or wait for the next company reset request."
                />
              )}
            </div>
          </OwnerPanel>

          <div className="grid gap-6">
            <OwnerPanel
              eyebrow="Secure Output"
              title="Generated keys in this session"
              description="Any company key you issue appears here once so you can copy it before refresh."
            >
              {recentKeyEvents.length > 0 ? (
                <div className="space-y-3">
                  {recentKeyEvents.map((event) => (
                    <RecentKeyCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <EmptyInlineState message="No keys have been issued in this owner session yet." />
              )}
            </OwnerPanel>

            <OwnerPanel
              eyebrow="Recovery Policy"
              title="Recommended workflow"
              description="Keep the owner surface safer and more predictable than shared admin spaces."
            >
              <ul className="space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                <li>Enter the replacement key yourself whenever you need a controlled recovery.</li>
                <li>Use generated keys only when you want a fast temporary rotation.</li>
                <li>Reject requests that look stale or duplicated before issuing a new company key.</li>
                <li>Delete a workspace only after confirming the exact workspace ID and owner password.</li>
              </ul>
            </OwnerPanel>
          </div>
        </section>
      ) : null}

      {section === "workspaces" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Tracked workspaces"
              value={formatCompactNumber(totalWorkspaces)}
              caption="Total tenant count"
            />
            <MetricCard
              label="Healthy"
              value={formatCompactNumber(healthyWorkspaceCount)}
              caption="No owner-side alerts"
            />
            <MetricCard
              label="Needs attention"
              value={formatCompactNumber(attentionWorkspaces.length)}
              caption="Flags or gaps detected"
              tone="warning"
            />
            <MetricCard
              label="High activity"
              value={formatCompactNumber(highActivityWorkspaces)}
              caption="15+ total events"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(340px,0.66fr)_minmax(0,1.34fr)]">
            <OwnerPanel
              eyebrow="Workspace Spotlight"
              title={
                selectedWorkspace ? selectedWorkspace.organizationName : "No workspace selected"
              }
              description={
                selectedWorkspace
                  ? "Inspect this company, review its health, and trigger owner-only actions."
                  : "Choose a workspace from the registry to inspect it here."
              }
            >
              {selectedWorkspace ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <HealthBadge
                            workspace={selectedWorkspace}
                            resetRequests={resetRequests}
                          />
                          {pendingResetWorkspaceIds.has(selectedWorkspace.workspaceId) ? (
                            <Badge tone="warning">Pending reset</Badge>
                          ) : null}
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
                          {selectedWorkspace.organizationName}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          {selectedWorkspace.appName}
                        </p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Workspace ID / {selectedWorkspace.workspaceId}
                        </p>
                      </div>
                      <ColorChip
                        dashboardAccent={selectedWorkspace.dashboardAccent}
                        formAccent={selectedWorkspace.formAccent}
                      />
                    </div>

                    <div className="mt-6 grid gap-x-6 gap-y-5 border-t border-gray-200 pt-5 dark:border-gray-800 sm:grid-cols-2">
                      <SpotlightMetaItem
                        label="Admin contact"
                        value={selectedWorkspace.contactEmail || "Not captured yet"}
                      />
                      <SpotlightMetaItem
                        label="Created"
                        value={formatDate(selectedWorkspace.createdAt ?? selectedWorkspace.updatedAt)}
                      />
                      <SpotlightMetaItem
                        label="Health state"
                        value={
                          selectedWorkspaceAttention.length > 0 ? "Needs attention" : "Healthy"
                        }
                      />
                      <SpotlightMetaItem
                        label="Access recovery"
                        value={
                          pendingResetWorkspaceIds.has(selectedWorkspace.workspaceId)
                            ? "Pending reset"
                            : "Stable"
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                          Workspace activity
                        </p>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                          A cleaner breakdown of the live form, submission, and file volume for this
                          company.
                        </p>
                      </div>
                      <div className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">
                        {selectedWorkspace.formsCount +
                          selectedWorkspace.applicationsCount +
                          selectedWorkspace.uploadsCount}{" "}
                        tracked items
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SpotlightStat
                        label="Forms"
                        value={selectedWorkspace.formsCount.toLocaleString()}
                        note="Published and draft funnels"
                      />
                      <SpotlightStat
                        label="Applications"
                        value={selectedWorkspace.applicationsCount.toLocaleString()}
                        note="Candidate submissions"
                      />
                      <SpotlightStat
                        className="sm:col-span-2"
                        label="Uploads"
                        value={selectedWorkspace.uploadsCount.toLocaleString()}
                        note="Stored resume files"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Owner notes
                    </p>
                    <div className="mt-4 space-y-3">
                      {selectedWorkspaceAttention.length > 0 ? (
                        selectedWorkspaceAttention.map((reason) => (
                          <AttentionItem key={reason}>{reason}</AttentionItem>
                        ))
                      ) : (
                        <EmptyInlineState message="No owner-side issues are flagged on this workspace right now." />
                      )}
                    </div>
                  </div>

                  {workspaceIssuedKeys[selectedWorkspace.workspaceId] ? (
                    <OneTimeKeyBox
                      accessKey={workspaceIssuedKeys[selectedWorkspace.workspaceId]}
                      title="Latest owner-issued company key"
                    />
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        openResetModal({
                          mode: "workspace",
                          title: `Reset ${selectedWorkspace.organizationName}`,
                          workspaceId: selectedWorkspace.workspaceId,
                        })
                      }
                      className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
                    >
                      Reset company key
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openDeleteModal({
                          title: `Delete ${selectedWorkspace.organizationName}`,
                          workspaceId: selectedWorkspace.workspaceId,
                        })
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-error-200 px-4 py-2 text-sm font-medium text-error-700 transition hover:bg-error-50 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
                    >
                      Delete workspace
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No workspace selected"
                  description="Use the registry to choose a company workspace."
                />
              )}
            </OwnerPanel>

            <OwnerPanel
              eyebrow="Workspace Registry"
              title="Search and manage tenants"
              description="Filter by health, sort by activity, and browse the platform's workspaces in one place."
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_190px_190px]">
                <Field
                  label="Search"
                  help="Company name, workspace ID, app name, or contact email."
                >
                  <input
                    value={workspaceQuery}
                    onChange={(event) => setWorkspaceQuery(event.target.value)}
                    className={inputClassName}
                    placeholder="Search workspace registry"
                  />
                </Field>
                <Field label="Focus" help="Filter by health state.">
                  <select
                    value={workspaceFilter}
                    onChange={(event) =>
                      setWorkspaceFilter(event.target.value as WorkspaceFilter)
                    }
                    className={inputClassName}
                  >
                    <option value="all">All workspaces</option>
                    <option value="attention">Needs attention</option>
                    <option value="healthy">Healthy only</option>
                  </select>
                </Field>
                <Field label="Sort" help="How workspaces are ordered.">
                  <select
                    value={workspaceSort}
                    onChange={(event) =>
                      setWorkspaceSort(event.target.value as WorkspaceSort)
                    }
                    className={inputClassName}
                  >
                    <option value="activity">Highest activity</option>
                    <option value="recent">Most recent</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Showing{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {filteredWorkspaces.length.toLocaleString()}
                  </span>{" "}
                  of {workspaces.length.toLocaleString()} workspaces.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">
                    {attentionWorkspaces.length.toLocaleString()} need attention
                  </Badge>
                  <Badge tone="neutral">
                    {pendingResetCount.toLocaleString()} pending resets
                  </Badge>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
                {filteredWorkspaces.length > 0 ? (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredWorkspaces.map((workspace) => (
                      <WorkspaceRegistryRow
                        key={workspace.workspaceId}
                        workspace={workspace}
                        isSelected={selectedWorkspace?.workspaceId === workspace.workspaceId}
                        pendingResetCount={
                          resetRequests.filter(
                            (request) =>
                              request.workspaceId === workspace.workspaceId &&
                              request.status === "pending"
                          ).length
                        }
                        attentionReasons={getWorkspaceAttentionReasons(workspace, resetRequests)}
                        onSelect={() => setSelectedWorkspaceId(workspace.workspaceId)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState
                      title="No workspaces match those filters"
                      description="Try another search term or switch the health filter."
                    />
                  </div>
                )}
              </div>
            </OwnerPanel>
          </section>
        </>
      ) : null}

      {section === "insights" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Average applications"
              value={formatCompactNumber(averageApplicationsPerWorkspace)}
              caption="Per workspace"
            />
            <MetricCard
              label="High activity"
              value={formatCompactNumber(highActivityWorkspaces)}
              caption="15+ total events"
            />
            <MetricCard
              label="Missing contacts"
              value={formatCompactNumber(missingContactCount)}
              caption="Recovery risk"
              tone="warning"
            />
            <MetricCard
              label="Zero activity"
              value={formatCompactNumber(zeroActivityCount)}
              caption="Needs onboarding"
              tone="warning"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <OwnerPanel
              eyebrow="Platform Health"
              title="Tenant signal breakdown"
              description="A simple owner view of which workspaces are healthy, risky, or still waiting to activate."
            >
              <div className="space-y-4">
                <ProgressRow
                  label="Healthy workspaces"
                  value={`${healthyWorkspaceCount.toLocaleString()} / ${totalWorkspaces.toLocaleString() || "0"}`}
                  percent={totalWorkspaces > 0 ? healthyWorkspaceCount / totalWorkspaces : 0}
                  tone="success"
                />
                <ProgressRow
                  label="Needs attention"
                  value={`${attentionWorkspaces.length.toLocaleString()} / ${totalWorkspaces.toLocaleString() || "0"}`}
                  percent={totalWorkspaces > 0 ? attentionWorkspaces.length / totalWorkspaces : 0}
                  tone="warning"
                />
                <ProgressRow
                  label="Pending recovery pressure"
                  value={`${pendingResetCount.toLocaleString()} / ${totalWorkspaces.toLocaleString() || "0"}`}
                  percent={totalWorkspaces > 0 ? pendingResetCount / totalWorkspaces : 0}
                  tone="brand"
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <SignalTile
                  label="Total activity"
                  value={formatCompactNumber(totalWorkspaceActivity)}
                  note="Forms, applications, uploads"
                />
                <SignalTile
                  label="Resolved resets"
                  value={resolvedResetCount.toLocaleString()}
                  note="Owner-issued recoveries"
                />
              </div>
            </OwnerPanel>

            <OwnerPanel
              eyebrow="Activity Leaders"
              title="Most active workspaces"
              description="These tenants are generating the most operational movement right now."
            >
              <div className="space-y-3">
                {topWorkspaces.length > 0 ? (
                  topWorkspaces.map((workspace) => (
                    <ActivityRow key={workspace.workspaceId} workspace={workspace} />
                  ))
                ) : (
                  <EmptyInlineState message="Activity rankings will appear once workspaces start using the platform." />
                )}
              </div>
            </OwnerPanel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <OwnerPanel
              eyebrow="Owner Privileges"
              title="What this dashboard can do"
              description="This space goes beyond what a single workspace admin can access."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CapabilityCard
                  title="Cross-workspace recovery"
                  body="Reset any company key, not just the key for one tenant."
                />
                <CapabilityCard
                  title="Tenant lifecycle control"
                  body="Delete any company workspace with owner-password verification."
                />
                <CapabilityCard
                  title="Registry-wide health view"
                  body="Spot missing contacts, inactive tenants, and recovery pressure across the platform."
                />
                <CapabilityCard
                  title="Centralized oversight"
                  body="Track which workspaces are actively using forms, applications, and uploads."
                />
              </div>
            </OwnerPanel>

            <OwnerPanel
              eyebrow="Next Steps"
              title="Recommended owner follow-up"
              description="Suggested actions based on the current shape of your tenant data."
            >
              <div className="space-y-3">
                <ActionSuggestion
                  title="Follow up on inactive companies"
                  body={`${zeroActivityCount.toLocaleString()} workspaces still have no activity. They likely need onboarding or setup help.`}
                />
                <ActionSuggestion
                  title="Close recovery gaps"
                  body={`${missingContactCount.toLocaleString()} workspaces are missing an admin contact email, which weakens recovery communication.`}
                />
                <ActionSuggestion
                  title="Keep the queue clean"
                  body={`${pendingResetCount.toLocaleString()} reset requests are waiting. Clear them regularly so the owner console stays trustworthy.`}
                />
              </div>
            </OwnerPanel>
          </section>
        </>
      ) : null}

      {resetIntent ? (
        <ResetPasswordModal
          errorMessage={resetActionError}
          intent={resetIntent}
          isWorking={
            resetActionId ===
            (resetIntent.mode === "request" ? resetIntent.requestId : resetIntent.workspaceId)
          }
          nextAccessKey={nextAccessKey}
          ownerPassword={ownerPassword}
          onClose={() => {
            if (!resetActionId) {
              setResetIntent(null);
              setOwnerPassword("");
              setNextAccessKey("");
              setResetActionError(null);
            }
          }}
          onConfirm={() => void handleConfirmReset()}
          onAccessKeyChange={setNextAccessKey}
          onPasswordChange={setOwnerPassword}
          onGenerateAccessKey={() => setNextAccessKey(createSuggestedWorkspaceAccessKey())}
        />
      ) : null}

      {deleteIntent ? (
        <DeleteWorkspaceModal
          errorMessage={deleteActionError}
          intent={deleteIntent}
          isWorking={deleteActionId === deleteIntent.workspaceId}
          ownerPassword={ownerPassword}
          confirmationValue={deleteWorkspaceConfirmation}
          onClose={() => {
            if (!deleteActionId) {
              setDeleteIntent(null);
              setOwnerPassword("");
              setDeleteWorkspaceConfirmation("");
              setDeleteActionError(null);
            }
          }}
          onConfirm={() => void handleDeleteWorkspace()}
          onConfirmationChange={setDeleteWorkspaceConfirmation}
          onPasswordChange={setOwnerPassword}
        />
      ) : null}
    </div>
  );
}

function PageHero({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-2.5 bg-brand-500" />
      <div className="space-y-4 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-4xl text-sm leading-7 text-gray-600 dark:text-gray-300 sm:text-base">
          {description}
        </p>
      </div>
    </section>
  );
}

function OwnerPanel({
  children,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  caption,
  label,
  tone = "default",
  value,
}: {
  caption: string;
  label: string;
  tone?: "default" | "warning";
  value: string;
}) {
  return (
    <article
      className={`rounded-2xl border p-5 shadow-theme-xs ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      }`}
    >
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{caption}</p>
    </article>
  );
}

function SignalTile({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{note}</p>
    </div>
  );
}

function CompactRequestRow({
  onOpen,
  request,
}: {
  onOpen: () => void;
  request: WorkspaceAccessResetRequest;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {request.workspaceId}
        </p>
        <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300">
          {request.contactEmail}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Requested {formatDate(request.createdAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
      >
        Review request
      </button>
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-brand-500 text-white"
          : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function AlertBox({
  children,
  className = "",
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: "error";
}) {
  const toneClassName =
    tone === "error"
      ? "border border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200"
      : "";

  return <div className={`rounded-lg px-4 py-3 text-sm ${toneClassName} ${className}`}>{children}</div>;
}

function EmptyInlineState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
      {message}
    </p>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "neutral" | "warning" | "success";
}) {
  const toneClassName =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
      : tone === "success"
        ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200"
        : "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}

function SpotlightMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SpotlightStat({
  className,
  label,
  note,
  value,
}: {
  className?: string;
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950/40${
        className ? ` ${className}` : ""
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{note}</p>
    </div>
  );
}

function AttentionItem({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
      <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
      <p className="text-sm leading-6 text-amber-700 dark:text-amber-100">{children}</p>
    </div>
  );
}

function ColorChip({
  dashboardAccent,
  formAccent,
}: {
  dashboardAccent: string;
  formAccent: string;
}) {
  return (
    <div
      className="h-14 w-14 rounded-2xl border border-gray-200 dark:border-gray-700"
      style={{
        background: `linear-gradient(145deg, ${dashboardAccent}, ${formAccent})`,
      }}
    />
  );
}

function WorkspaceRegistryRow({
  attentionReasons,
  isSelected,
  onSelect,
  pendingResetCount,
  workspace,
}: {
  attentionReasons: string[];
  isSelected: boolean;
  onSelect: () => void;
  pendingResetCount: number;
  workspace: OwnerWorkspaceSummary;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-5 py-5 text-left transition ${
        isSelected
          ? "bg-brand-50 dark:bg-brand-500/10"
          : "bg-white hover:bg-gray-50 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            {attentionReasons.length === 0 ? (
              <Badge tone="success">Healthy</Badge>
            ) : (
              <Badge tone="warning">Needs attention</Badge>
            )}
            {pendingResetCount > 0 ? <Badge tone="warning">Pending reset</Badge> : null}
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold text-gray-900 dark:text-white">
            {workspace.organizationName}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
            <span>{workspace.appName}</span>
            <span className="hidden text-gray-400 dark:text-gray-500 sm:inline">/</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{workspace.workspaceId}</span>
          </div>
        </div>
        <div className="flex items-center justify-start xl:justify-end">
          <span
            className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
              isSelected
                ? "bg-brand-500 text-white"
                : "border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
            }`}
          >
            {isSelected ? "Selected" : "View details"}
          </span>
        </div>
      </div>

      <p className="mt-4 max-w-5xl text-sm leading-6 text-gray-600 dark:text-gray-300">
        {attentionReasons.length > 0
          ? attentionReasons[0]
          : "No owner-side issues are currently flagged on this workspace."}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:max-w-3xl">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Admin contact
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {workspace.contactEmail || "Not captured"}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Activity
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {formatCompactNumber(getWorkspaceTotalActivity(workspace))}
              </p>
            </div>
            <p className="text-right text-xs leading-5 text-gray-500 dark:text-gray-400">
              {workspace.formsCount} forms / {workspace.applicationsCount} apps / {workspace.uploadsCount} uploads
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function ProgressRow({
  label,
  percent,
  tone,
  value,
}: {
  label: string;
  percent: number;
  tone: "brand" | "success" | "warning";
  value: string;
}) {
  const barClassName =
    tone === "brand" ? "bg-brand-500" : tone === "success" ? "bg-success-500" : "bg-amber-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${Math.min(Math.max(percent, 0), 1) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ActivityRow({ workspace }: { workspace: OwnerWorkspaceSummary }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {workspace.organizationName}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {workspace.workspaceId}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {formatCompactNumber(getWorkspaceTotalActivity(workspace))}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">activity</p>
      </div>
    </div>
  );
}

function CapabilityCard({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{body}</p>
    </div>
  );
}

function ActionSuggestion({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{body}</p>
    </div>
  );
}

function ActionCard({
  action,
  description,
  href,
  title,
}: {
  action: string;
  description: string;
  href: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
    >
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      <span className="mt-4 inline-flex text-sm font-semibold text-brand-600 dark:text-brand-300">
        {action}
      </span>
    </Link>
  );
}

function ResetRequestCard({
  issuedKey,
  isWorking,
  onIssue,
  onReject,
  request,
}: {
  issuedKey?: string;
  isWorking: boolean;
  onIssue: () => void;
  onReject: () => void;
  request: WorkspaceAccessResetRequest;
}) {
  const isPending = request.status === "pending";

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{request.workspaceId}</Badge>
            <StatusPill status={request.status} />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
            {request.contactEmail}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Requested {formatDate(request.createdAt)}
            {request.resolvedAt ? ` / handled ${formatDate(request.resolvedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onIssue}
            disabled={!isPending || isWorking}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "Working..." : "Issue new key"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={!isPending || isWorking}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Reject
          </button>
        </div>
      </div>
      {request.note ? (
        <p className="mt-4 rounded-xl border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
          {request.note}
        </p>
      ) : null}
      {issuedKey ? (
        <div className="mt-4">
          <OneTimeKeyBox accessKey={issuedKey} title="New key generated" />
        </div>
      ) : null}
    </article>
  );
}

function RecentKeyCard({ event }: { event: RecentKeyEvent }) {
  return (
    <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-500/20 dark:bg-success-500/10">
      <p className="text-sm font-semibold text-success-700 dark:text-success-100">
        {event.title}
      </p>
      <p className="mt-1 text-xs text-success-700/80 dark:text-success-100/80">
        {event.workspaceId} / {event.detail}
      </p>
      <div className="mt-3">
        <OneTimeKeyBox accessKey={event.accessKey} compact title="One-time key" />
      </div>
    </div>
  );
}

function HealthBadge({
  resetRequests,
  workspace,
}: {
  resetRequests: WorkspaceAccessResetRequest[];
  workspace: OwnerWorkspaceSummary;
}) {
  const attentionReasons = getWorkspaceAttentionReasons(workspace, resetRequests);

  if (attentionReasons.length === 0) {
    return <Badge tone="success">Healthy</Badge>;
  }

  return <Badge tone="warning">Needs attention</Badge>;
}

function Field({
  children,
  help,
  label,
}: {
  children: ReactNode;
  help: string;
  label: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
      <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{help}</p>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: WorkspaceAccessResetRequest["status"] }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
        status === "pending"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
          : status === "resolved"
            ? "bg-success-100 text-success-700 dark:bg-success-500/10 dark:text-success-200"
            : "bg-error-100 text-error-700 dark:bg-error-500/10 dark:text-error-200"
      }`}
    >
      {status}
    </span>
  );
}

function ResetPasswordModal({
  errorMessage,
  intent,
  isWorking,
  nextAccessKey,
  onClose,
  onConfirm,
  onAccessKeyChange,
  onGenerateAccessKey,
  onPasswordChange,
  ownerPassword,
}: {
  errorMessage: string | null;
  intent: ResetIntent;
  isWorking: boolean;
  nextAccessKey: string;
  onClose: () => void;
  onConfirm: () => void;
  onAccessKeyChange: (value: string) => void;
  onGenerateAccessKey: () => void;
  onPasswordChange: (value: string) => void;
  ownerPassword: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
          Owner confirmation required
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
          {intent.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          You are about to reset the company access key for{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{intent.workspaceId}</span>.
          Enter the replacement key yourself, or generate one first, then confirm with your owner
          password.
        </p>
        {errorMessage ? (
          <AlertBox tone="error" className="mt-4">
            {errorMessage}
          </AlertBox>
        ) : null}
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            New workspace access key
          </span>
          <input
            value={nextAccessKey}
            onChange={(event) => onAccessKeyChange(event.target.value)}
            type="text"
            className={inputClassName}
            placeholder="Enter the replacement company key"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={onGenerateAccessKey}
          disabled={isWorking}
          className="mt-3 inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
        >
          Generate automatically
        </button>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Owner password
          </span>
          <input
            value={ownerPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            className={inputClassName}
            placeholder="Enter owner password"
            autoComplete="current-password"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking || !ownerPassword.trim() || !nextAccessKey.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "Resetting..." : "Confirm reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteWorkspaceModal({
  confirmationValue,
  errorMessage,
  intent,
  isWorking,
  onClose,
  onConfirm,
  onConfirmationChange,
  onPasswordChange,
  ownerPassword,
}: {
  confirmationValue: string;
  errorMessage: string | null;
  intent: DeleteIntent;
  isWorking: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onConfirmationChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  ownerPassword: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-error-700 dark:text-error-200">
          Destructive action
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
          {intent.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          This permanently removes the workspace{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{intent.workspaceId}</span>,
          including forms, applications, uploads, member access, and active sessions.
        </p>
        {errorMessage ? (
          <AlertBox tone="error" className="mt-4">
            {errorMessage}
          </AlertBox>
        ) : null}
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Confirm workspace ID
          </span>
          <input
            value={confirmationValue}
            onChange={(event) => onConfirmationChange(event.target.value)}
            type="text"
            className={inputClassName}
            placeholder={intent.workspaceId}
            autoComplete="off"
          />
        </label>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Owner password
          </span>
          <input
            value={ownerPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            className={inputClassName}
            placeholder="Enter owner password"
            autoComplete="current-password"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={
              isWorking ||
              !ownerPassword.trim() ||
              confirmationValue.trim() !== intent.workspaceId
            }
            className="inline-flex items-center justify-center rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "Deleting..." : "Delete workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OneTimeKeyBox({
  accessKey,
  compact = false,
  title,
}: {
  accessKey: string;
  compact?: boolean;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(accessKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className={`rounded-lg border border-success-200 bg-success-50 ${
        compact ? "p-3" : "p-4"
      } dark:border-success-500/20 dark:bg-success-500/10`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-success-700 dark:text-success-100">
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-success-200 bg-white px-3 py-2 text-xs text-success-900 dark:border-success-500/20 dark:bg-gray-950 dark:text-success-100">
          {accessKey}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center justify-center rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-success-700"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-success-700/80 dark:text-success-100/80">
        Copy this now. It will not be shown again after refresh.
      </p>
    </div>
  );
}

function EmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-5 py-10 text-center dark:border-gray-700">
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";

function getWorkspaceTotalActivity(workspace: OwnerWorkspaceSummary) {
  return workspace.formsCount + workspace.applicationsCount + workspace.uploadsCount;
}

function getWorkspaceAttentionReasons(
  workspace: OwnerWorkspaceSummary,
  resetRequests: WorkspaceAccessResetRequest[]
) {
  const reasons: string[] = [];
  const pendingWorkspaceResets = resetRequests.filter(
    (request) =>
      request.workspaceId === workspace.workspaceId && request.status === "pending"
  ).length;

  if (pendingWorkspaceResets > 0) {
    reasons.push(
      `${pendingWorkspaceResets} pending access-key reset request${pendingWorkspaceResets > 1 ? "s are" : " is"} waiting for owner action.`
    );
  }

  if (!workspace.contactEmail.trim()) {
    reasons.push("No admin contact email is stored for this workspace.");
  }

  if (getWorkspaceTotalActivity(workspace) === 0) {
    reasons.push("This workspace has no forms, applications, or uploads yet.");
  }

  if (workspace.formsCount === 0 && workspace.applicationsCount > 0) {
    reasons.push("Applications exist without any tracked hiring forms, which is unusual.");
  }

  return reasons;
}

function sortWorkspaces(
  left: OwnerWorkspaceSummary,
  right: OwnerWorkspaceSummary,
  sort: WorkspaceSort
) {
  if (sort === "name") {
    return left.organizationName.localeCompare(right.organizationName);
  }

  if (sort === "recent") {
    const leftTime = left.updatedAt ?? left.createdAt ?? "";
    const rightTime = right.updatedAt ?? right.createdAt ?? "";
    return rightTime.localeCompare(leftTime) || left.workspaceId.localeCompare(right.workspaceId);
  }

  const activityDelta = getWorkspaceTotalActivity(right) - getWorkspaceTotalActivity(left);

  if (activityDelta !== 0) {
    return activityDelta;
  }

  return left.organizationName.localeCompare(right.organizationName);
}

function buildRecentKeyEvents({
  issuedKeys,
  resetRequests,
  workspaceIssuedKeys,
  workspaces,
}: {
  issuedKeys: Record<string, string>;
  resetRequests: WorkspaceAccessResetRequest[];
  workspaceIssuedKeys: Record<string, string>;
  workspaces: OwnerWorkspaceSummary[];
}) {
  const requestEvents = Object.entries(issuedKeys)
    .reverse()
    .map(([requestId, accessKey]) => {
      const request = resetRequests.find((requestItem) => requestItem.id === requestId);

      return request
        ? {
            id: `request:${requestId}`,
            accessKey,
            title: `Reset request / ${request.workspaceId}`,
            workspaceId: request.workspaceId,
            detail: request.contactEmail,
          }
        : null;
    })
    .filter((item): item is RecentKeyEvent => Boolean(item));

  const workspaceEvents = Object.entries(workspaceIssuedKeys)
    .reverse()
    .map(([workspaceId, accessKey]) => {
      const workspace = workspaces.find((workspaceItem) => workspaceItem.workspaceId === workspaceId);

      return {
        id: `workspace:${workspaceId}`,
        accessKey,
        title: workspace
          ? `Direct reset / ${workspace.organizationName}`
          : `Direct reset / ${workspaceId}`,
        workspaceId,
        detail: workspace?.contactEmail || "Workspace-level reset",
      } satisfies RecentKeyEvent;
    });

  return [...workspaceEvents, ...requestEvents].slice(0, 6);
}

function createSuggestedWorkspaceAccessKey() {
  if (typeof globalThis.crypto !== "undefined") {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return `workspace_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  return `workspace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
