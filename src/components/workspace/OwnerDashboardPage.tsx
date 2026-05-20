"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  OwnerDashboardSnapshot,
  OwnerWorkspaceSummary,
} from "@/lib/owner-dashboard-store";
import type { WorkspaceAccessResetRequest } from "@/lib/workspace-access-reset-store";

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

export default function OwnerDashboardPage({
  snapshot,
  ownerEmail,
}: {
  snapshot: OwnerDashboardSnapshot;
  ownerEmail: string;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resetRequests, setResetRequests] = useState(snapshot.accessResetRequests);
  const [resetActionId, setResetActionId] = useState<string | null>(null);
  const [resetActionError, setResetActionError] = useState<string | null>(null);
  const [issuedKeys, setIssuedKeys] = useState<Record<string, string>>({});
  const [workspaceIssuedKeys, setWorkspaceIssuedKeys] = useState<Record<string, string>>({});
  const [resetIntent, setResetIntent] = useState<ResetIntent | null>(null);
  const [ownerPassword, setOwnerPassword] = useState("");

  const pendingResetCount = resetRequests.filter(
    (request) => request.status === "pending"
  ).length;
  const totalWorkspaceActivity =
    snapshot.totals.forms + snapshot.totals.applications + snapshot.totals.uploads;

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/owner/auth/signout", { method: "POST" });
    } finally {
      router.push("/owner/signin");
      router.refresh();
      setIsSigningOut(false);
    }
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
                requestId: resetIntent.requestId,
              }
            : {
                action: "reset-workspace",
                adminPassword: ownerPassword,
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

  return (
    <main className="min-h-screen bg-[#06101f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[620px] w-[860px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[150px]" />
        <div className="absolute bottom-[-120px] right-[-80px] h-[440px] w-[520px] rounded-full bg-cyan-400/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06101f]/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link href="/" className="text-sm font-semibold text-blue-100">
              Hiring Workspace OS
            </Link>
            <p className="text-xs text-slate-400">Owner console / {ownerEmail}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workspace"
              className="hidden rounded-xl border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20 sm:inline-flex"
            >
              Invite workspace team
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-100">
                Platform owner
              </span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                {snapshot.storageMode}
              </span>
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Command center for every company using your hiring platform.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Monitor tenants, recover company access, and route teams into the right workspace
              tools without exposing candidate data across companies.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
              >
                Create company workspace
              </Link>
              <Link
                href="/workspace"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Invite people to workspace
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1628]/85 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Security posture
            </p>
            <div className="mt-5 space-y-4">
              <StatusLine label="Owner password required" value="For company key resets" />
              <StatusLine label="Pending recovery requests" value={pendingResetCount.toString()} />
              <StatusLine
                label="Tenant isolation"
                value="Workspace-scoped sessions"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Companies" value={snapshot.totals.workspaces} />
          <MetricCard label="Hiring forms" value={snapshot.totals.forms} />
          <MetricCard label="Applications" value={snapshot.totals.applications} />
          <MetricCard label="Uploads" value={snapshot.totals.uploads} />
          <MetricCard label="Key resets" value={pendingResetCount} tone="warning" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <Panel
            eyebrow="Access recovery"
            title="Company password reset queue"
            description="Requests from the sign-in page appear here. Issuing a new company key requires your owner password before the reset happens."
          >
            {resetActionError ? (
              <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {resetActionError}
              </div>
            ) : null}

            {resetRequests.length > 0 ? (
              <div className="space-y-3">
                {resetRequests.map((requestItem) => (
                  <ResetRequestCard
                    key={requestItem.id}
                    issuedKey={issuedKeys[requestItem.id]}
                    isWorking={resetActionId === requestItem.id}
                    request={requestItem}
                    onIssue={() =>
                      setResetIntent({
                        mode: "request",
                        requestId: requestItem.id,
                        title: `Reset ${requestItem.workspaceId}`,
                        workspaceId: requestItem.workspaceId,
                      })
                    }
                    onReject={() => void handleRejectRequest(requestItem.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No reset requests"
                description="When a company asks for help from sign-in, it will appear here for review."
              />
            )}
          </Panel>

          <Panel
            eyebrow="Tenant registry"
            title="Company workspaces"
            description={`${snapshot.workspaces.length.toLocaleString()} companies tracked with ${totalWorkspaceActivity.toLocaleString()} total workspace events.`}
          >
            {snapshot.workspaces.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                    <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Company</th>
                        <th className="px-4 py-3 font-semibold">Admin</th>
                        <th className="px-4 py-3 font-semibold">Activity</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {snapshot.workspaces.map((workspace) => (
                        <WorkspaceRow
                          key={workspace.workspaceId}
                          issuedKey={workspaceIssuedKeys[workspace.workspaceId]}
                          workspace={workspace}
                          onReset={() =>
                            setResetIntent({
                              mode: "workspace",
                              title: `Reset ${workspace.organizationName}`,
                              workspaceId: workspace.workspaceId,
                            })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No workspaces yet"
                description="Once a company signs up, it will appear here for owner-level monitoring."
              />
            )}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <ActionCard
            title="Invite people to your workspace"
            description="Workspace admins can create member-specific keys and send Gmail-backed invitations."
            href="/workspace"
            action="Open workspace settings"
          />
          <ActionCard
            title="Create a company account"
            description="Provision a new tenant with its own company ID, admin key, forms, and pipeline."
            href="/signup"
            action="Create workspace"
          />
          <ActionCard
            title="Review hiring dashboard"
            description="Go back into the active workspace dashboard when you need operational tools."
            href="/pipeline"
            action="Open pipeline"
          />
        </section>
      </div>

      {resetIntent ? (
        <ResetPasswordModal
          intent={resetIntent}
          isWorking={
            resetActionId ===
            (resetIntent.mode === "request" ? resetIntent.requestId : resetIntent.workspaceId)
          }
          ownerPassword={ownerPassword}
          onClose={() => {
            if (!resetActionId) {
              setResetIntent(null);
              setOwnerPassword("");
              setResetActionError(null);
            }
          }}
          onConfirm={() => void handleConfirmReset()}
          onPasswordChange={setOwnerPassword}
        />
      ) : null}
    </main>
  );
}

function Panel({
  children,
  description,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "warning";
  value: number;
}) {
  return (
    <article
      className={`rounded-2xl border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl ${
        tone === "warning"
          ? "border-amber-300/20 bg-amber-400/10"
          : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value.toLocaleString()}</p>
    </article>
  );
}

function WorkspaceRow({
  issuedKey,
  onReset,
  workspace,
}: {
  issuedKey?: string;
  onReset: () => void;
  workspace: OwnerWorkspaceSummary;
}) {
  return (
    <tr className="align-top text-slate-300 transition hover:bg-white/[0.03]">
      <td className="px-4 py-4">
        <p className="font-semibold text-white">{workspace.organizationName}</p>
        <p className="mt-1 text-xs text-slate-500">{workspace.workspaceId}</p>
        {issuedKey ? (
          <OneTimeKeyBox accessKey={issuedKey} compact />
        ) : null}
      </td>
      <td className="px-4 py-4">{workspace.contactEmail || "Not captured"}</td>
      <td className="px-4 py-4">
        <p>{workspace.formsCount.toLocaleString()} forms</p>
        <p className="mt-1 text-xs text-slate-500">
          {workspace.applicationsCount.toLocaleString()} applications /{" "}
          {workspace.uploadsCount.toLocaleString()} uploads
        </p>
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
        >
          Reset company key
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Created {formatDate(workspace.createdAt ?? workspace.updatedAt)}
        </p>
      </td>
    </tr>
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
    <article className="rounded-xl border border-white/10 bg-[#0b1628]/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-blue-100">
              {request.workspaceId}
            </span>
            <StatusPill status={request.status} />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">{request.contactEmail}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Requested {formatDate(request.createdAt)}
            {request.resolvedAt ? ` / handled ${formatDate(request.resolvedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onIssue}
            disabled={!isPending || isWorking}
            className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? "Working..." : "Issue new key"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={!isPending || isWorking}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
      {request.note ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm leading-6 text-slate-300">
          {request.note}
        </p>
      ) : null}
      {issuedKey ? <OneTimeKeyBox accessKey={issuedKey} /> : null}
    </article>
  );
}

function ResetPasswordModal({
  intent,
  isWorking,
  onClose,
  onConfirm,
  onPasswordChange,
  ownerPassword,
}: {
  intent: ResetIntent;
  isWorking: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onPasswordChange: (value: string) => void;
  ownerPassword: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1628] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.45)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-200">
          Admin confirmation required
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">{intent.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          You are about to reset the company access key for{" "}
          <span className="font-semibold text-white">{intent.workspaceId}</span>. Enter your
          owner password to continue.
        </p>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-slate-200">Owner password</span>
          <input
            value={ownerPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-hidden transition placeholder:text-slate-500 focus:border-blue-300/40 focus:ring-4 focus:ring-blue-500/10"
            placeholder="Enter owner password"
            autoComplete="current-password"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking || !ownerPassword.trim()}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "Resetting..." : "Confirm reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OneTimeKeyBox({
  accessKey,
  compact = false,
}: {
  accessKey: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
        New key generated
      </p>
      <code className="mt-2 block break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">
        {accessKey}
      </code>
      <p className="mt-2 text-xs text-emerald-100/80">
        Copy this now. It will not be shown again after refresh.
      </p>
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
      className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.07]"
    >
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      <span className="mt-4 inline-flex text-sm font-semibold text-blue-200">{action}</span>
    </Link>
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
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: WorkspaceAccessResetRequest["status"] }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
        status === "pending"
          ? "bg-amber-400/15 text-amber-100"
          : status === "resolved"
            ? "bg-emerald-400/15 text-emerald-100"
            : "bg-red-400/15 text-red-100"
      }`}
    >
      {status}
    </span>
  );
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
