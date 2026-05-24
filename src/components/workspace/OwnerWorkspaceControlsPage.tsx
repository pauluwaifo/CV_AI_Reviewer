"use client";

import { useEffect, useMemo, useState } from "react";

import type { OwnerWorkspaceSummary } from "@/lib/owner-dashboard-store";
import {
  buildDefaultWorkspaceControlSettings,
  humanizeWorkspaceBillingStatus,
  isWorkspaceModuleAccessible,
  WORKSPACE_FEATURE_MODULES,
  type WorkspaceBillingUpgradePlan,
  type WorkspaceControlSettings,
  type WorkspaceFeatureKey,
  type WorkspaceModuleReleaseMode,
} from "@/lib/workspace-controls";

export default function OwnerWorkspaceControlsPage({
  initialControls,
  paystackReady,
  workspaces,
}: {
  initialControls: WorkspaceControlSettings[];
  paystackReady: boolean;
  workspaces: OwnerWorkspaceSummary[];
}) {
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [controlsByWorkspace, setControlsByWorkspace] = useState<Record<string, WorkspaceControlSettings>>(
    () =>
      Object.fromEntries(
        workspaces.map((workspace) => [
          workspace.workspaceId,
          initialControls.find((item) => item.workspaceId === workspace.workspaceId) ??
            buildDefaultWorkspaceControlSettings(workspace.workspaceId),
        ])
      )
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    workspaces[0]?.workspaceId ?? ""
  );
  const [draft, setDraft] = useState<WorkspaceControlSettings | null>(
    workspaces[0]
      ? controlsByWorkspace[workspaces[0].workspaceId] ??
          buildDefaultWorkspaceControlSettings(workspaces[0].workspaceId)
      : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const filteredWorkspaces = useMemo(() => {
    const normalizedQuery = workspaceQuery.trim().toLowerCase();

    return workspaces.filter((workspace) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        workspace.organizationName,
        workspace.workspaceId,
        workspace.contactEmail,
        workspace.appName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [workspaceQuery, workspaces]);

  const selectedWorkspace =
    filteredWorkspaces.find((item) => item.workspaceId === selectedWorkspaceId) ??
    workspaces.find((item) => item.workspaceId === selectedWorkspaceId) ??
    filteredWorkspaces[0] ??
    workspaces[0] ??
    null;

  const activeBillingCount = workspaces.filter((workspace) => {
    const controls = controlsByWorkspace[workspace.workspaceId];
    return controls?.billing.enabled;
  }).length;
  const paidBillingCount = workspaces.filter((workspace) => {
    const controls = controlsByWorkspace[workspace.workspaceId];
    return controls?.billing.status === "active";
  }).length;
  const lockedModuleCount = workspaces.reduce((sum, workspace) => {
    const controls = controlsByWorkspace[workspace.workspaceId];

    if (!controls) {
      return sum;
    }

    return (
      sum +
      WORKSPACE_FEATURE_MODULES.filter(
        (module) => !isWorkspaceModuleAccessible(controls, module.key)
      ).length
    );
  }, 0);

  useEffect(() => {
    if (!selectedWorkspace) {
      setDraft(null);
      return;
    }

    const nextControls =
      controlsByWorkspace[selectedWorkspace.workspaceId] ??
      buildDefaultWorkspaceControlSettings(selectedWorkspace.workspaceId);

    setSelectedWorkspaceId(selectedWorkspace.workspaceId);
    setDraft({
      ...nextControls,
      billing: {
        ...nextControls.billing,
        customerEmail:
          nextControls.billing.customerEmail || selectedWorkspace.contactEmail || "",
      },
    });
  }, [controlsByWorkspace, selectedWorkspace]);

  function updateModuleMode(
    moduleKey: WorkspaceFeatureKey,
    mode: WorkspaceModuleReleaseMode
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            modules: {
              ...current.modules,
              [moduleKey]: {
                ...current.modules[moduleKey],
                mode,
              },
            },
          }
        : current
    );
  }

  function updateModuleNote(moduleKey: WorkspaceFeatureKey, note: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            modules: {
              ...current.modules,
              [moduleKey]: {
                ...current.modules[moduleKey],
                note,
              },
            },
          }
        : current
    );
  }

  function addUpgradePlan() {
    const key = `upgrade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setDraft((current) =>
      current
        ? {
            ...current,
            billing: {
              ...current.billing,
              upgradePlans: [
                ...current.billing.upgradePlans,
                {
                  key,
                  name: "",
                  monthlyAmountKobo: 0,
                  monthlyPlanCode: "",
                  yearlyAmountKobo: 0,
                  yearlyPlanCode: "",
                },
              ],
            },
          }
        : current
    );
  }

  function updateUpgradePlan(
    planKey: string,
    patch: Partial<WorkspaceBillingUpgradePlan>
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            billing: {
              ...current.billing,
              upgradePlans: current.billing.upgradePlans.map((plan) =>
                plan.key === planKey ? { ...plan, ...patch } : plan
              ),
            },
          }
        : current
    );
  }

  function removeUpgradePlan(planKey: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            billing: {
              ...current.billing,
              upgradePlans: current.billing.upgradePlans.filter(
                (plan) => plan.key !== planKey
              ),
            },
          }
        : current
    );
  }

  async function handleSave() {
    if (!draft || !selectedWorkspace) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/owner/workspace-controls/${selectedWorkspace.workspaceId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(draft),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            controls?: WorkspaceControlSettings;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.controls) {
        throw new Error(payload?.error || "I couldn't save those workspace controls.");
      }

      const nextControls = payload.controls;

      setControlsByWorkspace((current) => ({
        ...current,
        [nextControls.workspaceId]: nextControls,
      }));
      setDraft(nextControls);
      setSuccessMessage("Workspace controls updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "I couldn't save those workspace controls."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)] dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 p-5 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Controls
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Release modules and control billing workspace by workspace
              </h1>
              <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-300">
                Turn modules on, lock them behind billing, activate Paystack-based billing, and decide exactly when each company gets access to premium workflow surfaces.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px] xl:grid-cols-4">
              <OwnerMetricCard label="Workspaces" value={String(workspaces.length)} helper="Managed" />
              <OwnerMetricCard label="Billing live" value={String(activeBillingCount)} helper="Enabled" />
              <OwnerMetricCard label="Paid" value={String(paidBillingCount)} helper="Active status" />
              <OwnerMetricCard label="Locked modules" value={String(lockedModuleCount)} helper="Across platform" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)] sm:p-6">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/40">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Workspace registry
              </p>
              <input
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
                placeholder="Search workspace, app, or contact email"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition placeholder:text-gray-400 focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div className="space-y-3">
              {filteredWorkspaces.map((workspace) => {
                const controls =
                  controlsByWorkspace[workspace.workspaceId] ??
                  buildDefaultWorkspaceControlSettings(workspace.workspaceId);
                const blockedCount = WORKSPACE_FEATURE_MODULES.filter(
                  (module) => !isWorkspaceModuleAccessible(controls, module.key)
                ).length;

                return (
                  <button
                    key={workspace.workspaceId}
                    type="button"
                    onClick={() => setSelectedWorkspaceId(workspace.workspaceId)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedWorkspaceId === workspace.workspaceId
                        ? "border-brand-300 bg-white shadow-[0_16px_32px_rgba(15,23,42,0.08)] dark:border-brand-500/30 dark:bg-gray-900"
                        : "border-gray-200 bg-white/80 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900/60 dark:hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {workspace.organizationName}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {workspace.workspaceId}
                        </p>
                      </div>
                      <WorkspaceBillingBadge enabled={controls.billing.enabled} status={controls.billing.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      <span>{blockedCount} locked</span>
                      <span>{workspace.formsCount} forms</span>
                      <span>{workspace.applicationsCount} applications</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            {selectedWorkspace && draft ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      Workspace controls
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                      {selectedWorkspace.organizationName}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">
                      Release modules and billing rules for <span className="font-medium text-gray-900 dark:text-white">{selectedWorkspace.workspaceId}</span>.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InlineInfoCard label="Admin contact" value={selectedWorkspace.contactEmail || "Not captured"} />
                    <InlineInfoCard label="Workspace app" value={selectedWorkspace.appName} />
                  </div>
                </div>

                <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        Billing control
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                        Keep billing inactive until you are ready to collect payments
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">
                        This uses your own UI with server-side Paystack API calls. When billing is live, workspace users can choose between the monthly and yearly prices you configure here.
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900">
                      <p className="font-medium text-gray-900 dark:text-white">
                        Paystack API
                      </p>
                      <p className={`mt-1 ${paystackReady ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
                        {paystackReady ? "Inline checkout ready from env" : "Public or secret key missing from env"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                      <span className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={draft.billing.enabled}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    billing: {
                                      ...current.billing,
                                      enabled: event.target.checked,
                                      status: event.target.checked
                                        ? current.billing.status === "inactive"
                                          ? "pending_payment"
                                          : current.billing.status
                                        : "inactive",
                                    },
                                  }
                                : current
                            )
                          }
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                      <span>
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                          Activate billing for this workspace
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-gray-600 dark:text-gray-300">
                            Once on, the workspace billing page can initialize Paystack checkout, let workspace users choose a billing cycle, and unlock billing-gated modules after successful payment.
                        </span>
                      </span>
                      </span>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                        Billing status
                      </span>
                      <select
                        value={draft.billing.status}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  billing: {
                                    ...current.billing,
                                    status: event.target.value as WorkspaceControlSettings["billing"]["status"],
                                  },
                                }
                              : current
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        <option value="inactive">Inactive</option>
                        <option value="pending_payment">Pending payment</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past due</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <OwnerField
                      label="Plan name"
                      value={draft.billing.planName}
                      onChange={(value) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                billing: {
                                  ...current.billing,
                                  planName: value,
                                },
                              }
                            : current
                        )
                      }
                      placeholder="Workspace Growth"
                    />
                    <OwnerField
                      label="Customer email"
                      value={draft.billing.customerEmail}
                      onChange={(value) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                billing: {
                                  ...current.billing,
                                  customerEmail: value,
                                },
                              }
                            : current
                        )
                      }
                      placeholder={selectedWorkspace.contactEmail || "billing@company.com"}
                    />
                    <OwnerField
                      label="Monthly plan code"
                      value={draft.billing.monthlyPlanCode}
                      onChange={(value) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                billing: {
                                  ...current.billing,
                                  monthlyPlanCode: value,
                                },
                              }
                            : current
                        )
                      }
                      placeholder="Optional Paystack monthly code"
                    />
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                        Monthly amount (NGN)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={
                          draft.billing.monthlyAmountKobo > 0
                            ? String(draft.billing.monthlyAmountKobo / 100)
                            : ""
                        }
                        onChange={(event) => {
                          const value = Number.parseFloat(event.target.value || "0");
                          const monthlyAmountKobo = Number.isFinite(value)
                            ? Math.max(0, Math.round(value * 100))
                            : 0;

                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  billing: {
                                    ...current.billing,
                                    monthlyAmountKobo,
                                  },
                                }
                              : current
                          );
                        }}
                        placeholder="25000"
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                    <OwnerField
                      label="Yearly plan code"
                      value={draft.billing.yearlyPlanCode}
                      onChange={(value) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                billing: {
                                  ...current.billing,
                                  yearlyPlanCode: value,
                                },
                              }
                            : current
                        )
                      }
                      placeholder="Optional Paystack yearly code"
                    />
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                        Yearly amount (NGN)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={
                          draft.billing.yearlyAmountKobo > 0
                            ? String(draft.billing.yearlyAmountKobo / 100)
                            : ""
                        }
                        onChange={(event) => {
                          const value = Number.parseFloat(event.target.value || "0");
                          const yearlyAmountKobo = Number.isFinite(value)
                            ? Math.max(0, Math.round(value * 100))
                            : 0;

                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  billing: {
                                    ...current.billing,
                                    yearlyAmountKobo,
                                  },
                                }
                              : current
                          );
                        }}
                        placeholder="250000"
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                  </div>

                  <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          Upgrade tiers
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                          Add higher plans for later upgrades
                        </h4>
                        <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">
                          Add as many higher billing tiers as you need. The workspace sees upgrade options only after the current plan is already active.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={addUpgradePlan}
                        className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-white/5"
                      >
                        Add upgrade tier
                      </button>
                    </div>

                    {draft.billing.upgradePlans.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-sm leading-7 text-gray-600 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
                        No upgrade tiers added yet.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {draft.billing.upgradePlans.map((plan, index) => (
                          <div
                            key={plan.key}
                            className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/40"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  Upgrade tier {index + 1}
                                </p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                  This becomes available after the current plan is active.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeUpgradePlan(plan.key)}
                                className="inline-flex items-center justify-center rounded-xl border border-error-200 bg-white px-3 py-2 text-sm font-medium text-error-700 transition hover:bg-error-50 dark:border-error-500/30 dark:bg-gray-900 dark:text-error-200 dark:hover:bg-error-500/10"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                              <OwnerField
                                label="Upgrade plan name"
                                value={plan.name}
                                onChange={(value) => updateUpgradePlan(plan.key, { name: value })}
                                placeholder="Workspace Scale"
                              />
                              <OwnerField
                                label="Monthly plan code"
                                value={plan.monthlyPlanCode}
                                onChange={(value) =>
                                  updateUpgradePlan(plan.key, { monthlyPlanCode: value })
                                }
                                placeholder="Optional Paystack monthly code"
                              />
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                  Monthly amount (NGN)
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={500}
                                  value={
                                    plan.monthlyAmountKobo > 0
                                      ? String(plan.monthlyAmountKobo / 100)
                                      : ""
                                  }
                                  onChange={(event) => {
                                    const value = Number.parseFloat(event.target.value || "0");
                                    const monthlyAmountKobo = Number.isFinite(value)
                                      ? Math.max(0, Math.round(value * 100))
                                      : 0;

                                    updateUpgradePlan(plan.key, { monthlyAmountKobo });
                                  }}
                                  placeholder="12000"
                                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                              </label>
                              <OwnerField
                                label="Yearly plan code"
                                value={plan.yearlyPlanCode}
                                onChange={(value) =>
                                  updateUpgradePlan(plan.key, { yearlyPlanCode: value })
                                }
                                placeholder="Optional Paystack yearly code"
                              />
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                  Yearly amount (NGN)
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={500}
                                  value={
                                    plan.yearlyAmountKobo > 0
                                      ? String(plan.yearlyAmountKobo / 100)
                                      : ""
                                  }
                                  onChange={(event) => {
                                    const value = Number.parseFloat(event.target.value || "0");
                                    const yearlyAmountKobo = Number.isFinite(value)
                                      ? Math.max(0, Math.round(value * 100))
                                      : 0;

                                    updateUpgradePlan(plan.key, { yearlyAmountKobo });
                                  }}
                                  placeholder="120000"
                                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      Feature modules
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      Release features one by one or lock them behind billing
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">
                      `Open` keeps a module available. `Owner locked` hides it from the workspace. `Requires billing` keeps it locked until billing is active for that workspace.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    {WORKSPACE_FEATURE_MODULES.map((module) => (
                      <div
                        key={module.key}
                        className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                      >
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_220px]">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {module.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                              {module.description}
                            </p>
                            {module.path ? (
                              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                Route: {module.path}
                              </p>
                            ) : null}
                          </div>

                          <label className="space-y-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                              Release mode
                            </span>
                            <select
                              value={draft.modules[module.key].mode}
                              onChange={(event) =>
                                updateModuleMode(
                                  module.key,
                                  event.target.value as WorkspaceModuleReleaseMode
                                )
                              }
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            >
                              <option value="open">Open</option>
                              <option value="owner_locked">Owner locked</option>
                              <option value="requires_billing">Requires billing</option>
                            </select>
                          </label>
                        </div>

                        <label className="mt-4 block space-y-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                            Lock note
                          </span>
                          <input
                            value={draft.modules[module.key].note}
                            onChange={(event) =>
                              updateModuleNote(module.key, event.target.value)
                            }
                            placeholder="Optional message shown when this module is locked."
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </section>

                {error ? (
                  <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm leading-6 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-100">
                    {error}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {successMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving controls..." : "Save workspace controls"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      selectedWorkspace &&
                      setDraft(
                        controlsByWorkspace[selectedWorkspace.workspaceId] ??
                          buildDefaultWorkspaceControlSettings(selectedWorkspace.workspaceId)
                      )
                    }
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Reset draft
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm leading-7 text-gray-600 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
                Create a workspace first before managing releases and billing controls.
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function OwnerMetricCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold leading-none text-gray-900 dark:text-white">
          {value}
        </p>
        <p className="text-right text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
          {helper}
        </p>
      </div>
    </div>
  );
}

function WorkspaceBillingBadge({
  enabled,
  status,
}: {
  enabled: boolean;
  status: WorkspaceControlSettings["billing"]["status"];
}) {
  const tone = !enabled
    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    : status === "active"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
      : status === "pending_payment"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
        : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200";

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {enabled ? humanizeWorkspaceBillingStatus(status) : "Billing off"}
    </span>
  );
}

function InlineInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-900 [overflow-wrap:anywhere] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function OwnerField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      />
    </label>
  );
}
