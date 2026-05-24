"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";

import { useWorkspace } from "@/context/WorkspaceContext";
import {
  CheckCircleIcon,
  CloseIcon,
  DollarLineIcon,
  EnvelopeIcon,
  LockIcon,
  UserIcon,
} from "@/icons";
import {
  getAvailableWorkspaceBillingUpgrades,
  getWorkspaceBillingIntervalOptions,
  getWorkspaceBillingUpgradePlanIntervalOptions,
  humanizeWorkspaceBillingInterval,
  humanizeWorkspaceBillingStatus,
  isWorkspaceModuleAccessible,
  type WorkspaceBillingInterval,
  WORKSPACE_FEATURE_MODULES,
  type WorkspaceControlSettings,
} from "@/lib/workspace-controls";
import type { WorkspaceBillingTransactionRecord } from "@/lib/workspace-billing-store";

type WorkspaceBillingSummary = {
  controls: WorkspaceControlSettings;
  paystackReady: boolean;
  payerEmail: string;
  transactions: WorkspaceBillingTransactionRecord[];
  workspaceId: string;
};

type BillingSuccessReceipt = {
  amountKobo: number;
  paidAt: string | null;
  payerEmail: string;
  reference: string;
};

type BillingCheckoutPayload = {
  amountKobo: number;
  currency: string;
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  interval: "monthly" | "yearly";
  metadata: Record<string, unknown>;
  planCode: string;
  planName: string;
  publicKey: string;
  reference: string;
};

type PaystackTransactionCallback = {
  reference?: string;
  trxref?: string;
};

type PaystackPopupOptions = {
  amount: number;
  currency: string;
  email: string;
  firstName?: string;
  key: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
  onCancel?: () => void;
  onError?: (error: { message?: string }) => void;
  onSuccess?: (transaction: PaystackTransactionCallback) => void;
  phone?: string;
  planCode?: string;
  ref: string;
  reference?: string;
};

type PaystackPopupInstance = {
  checkout?: (options: PaystackPopupOptions) => void;
  newTransaction?: (options: PaystackPopupOptions) => void;
};

declare global {
  interface Window {
    Paystack?: new () => PaystackPopupInstance;
    PaystackPop?: new () => PaystackPopupInstance;
  }
}

export default function WorkspaceBillingPage({
  initialSummary,
}: {
  initialSummary: WorkspaceBillingSummary;
}) {
  const searchParams = useSearchParams();
  const { replaceControls } = useWorkspace();
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPaystackScriptReady, setIsPaystackScriptReady] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<BillingSuccessReceipt | null>(null);
  const [billingEmail, setBillingEmail] = useState(
    initialSummary.controls.billing.customerEmail || initialSummary.payerEmail || ""
  );
  const [billingFirstName, setBillingFirstName] = useState("");
  const [billingLastName, setBillingLastName] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [selectedBillingInterval, setSelectedBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutIntent, setCheckoutIntent] = useState<"current" | "upgrade">("current");
  const [selectedUpgradeKey, setSelectedUpgradeKey] = useState("");
  const [selectedUpgradeInterval, setSelectedUpgradeInterval] = useState<"monthly" | "yearly">("monthly");
  const reference = searchParams.get("reference")?.trim() ?? "";

  const billingLockedModules = useMemo(
    () =>
      WORKSPACE_FEATURE_MODULES.filter(
        (module) =>
          summary.controls.modules[module.key].mode === "requires_billing" &&
          !isWorkspaceModuleAccessible(summary.controls, module.key)
      ),
    [summary.controls]
  );

  useEffect(() => {
    setSummary(initialSummary);
    setBillingEmail(
      initialSummary.controls.billing.customerEmail || initialSummary.payerEmail || ""
    );
    setSelectedBillingInterval(
      initialSummary.controls.billing.monthlyAmountKobo > 0 ? "monthly" : "yearly"
    );
    setCheckoutIntent("current");
    setSelectedUpgradeKey("");
    setSelectedUpgradeInterval("monthly");
  }, [initialSummary]);

  const isBillingActive = summary.controls.billing.status === "active";
  const baseIntervalOptions = getWorkspaceBillingIntervalOptions(summary.controls.billing);
  const selectedBaseIntervalOption =
    baseIntervalOptions.find((option) => option.interval === selectedBillingInterval) ??
    baseIntervalOptions.find((option) => option.interval === "monthly") ??
    baseIntervalOptions[0] ??
    null;
  const availableUpgrades = getAvailableWorkspaceBillingUpgrades(summary.controls.billing);
  const selectedUpgrade =
    availableUpgrades.find((plan) => plan.key === selectedUpgradeKey) ??
    availableUpgrades[0] ??
    null;
  const selectedUpgradeOption =
    (selectedUpgrade
      ? getWorkspaceBillingUpgradePlanIntervalOptions(selectedUpgrade).find(
          (option) => option.interval === selectedUpgradeInterval
        )
      : null) ??
    (selectedUpgrade
      ? getWorkspaceBillingUpgradePlanIntervalOptions(selectedUpgrade).find(
          (option) => option.interval === "monthly"
        ) ??
        getWorkspaceBillingUpgradePlanIntervalOptions(selectedUpgrade)[0] ??
        null
      : null);
  const hasUpgradeOffer = isBillingActive && availableUpgrades.length > 0;
  const checkoutPlan =
    checkoutIntent === "upgrade" && hasUpgradeOffer
      ? {
          amountKobo: selectedUpgradeOption?.amountKobo ?? 0,
          interval: selectedUpgradeOption?.interval ?? summary.controls.billing.interval,
          key: selectedUpgrade?.key ?? "",
          name: selectedUpgrade?.name ?? "",
        }
      : {
          amountKobo: selectedBaseIntervalOption?.amountKobo ?? 0,
          interval: selectedBaseIntervalOption?.interval ?? summary.controls.billing.interval,
          key: "current-plan",
          name: summary.controls.billing.planName,
        };

  async function handleVerify(referenceToVerify: string) {
    if (!referenceToVerify || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setError(null);
    setSuccessMessage("");

    try {
      const response = await fetch("/api/workspace/billing/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reference: referenceToVerify }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            billing?: WorkspaceBillingSummary;
            error?: string;
            transaction?: WorkspaceBillingTransactionRecord;
          }
        | null;

      if (!response.ok || !payload?.billing) {
        throw new Error(payload?.error || "I couldn't verify that payment.");
      }

      setSummary(payload.billing);
      replaceControls(payload.billing.controls);
      if (payload.transaction?.status === "success") {
        setSuccessReceipt({
          amountKobo: payload.transaction.amountKobo,
          paidAt: payload.transaction.paidAt,
          payerEmail: payload.transaction.payerEmail,
          reference: payload.transaction.reference,
        });
        setSuccessMessage("");
      } else {
        setSuccessMessage("Billing status updated from Paystack.");
      }
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "I couldn't verify that payment."
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleCheckout() {
    if (isCheckingOut) {
      return;
    }

    const normalizedEmail = billingEmail.trim().toLowerCase();

    if (!normalizedEmail || !isValidBillingEmail(normalizedEmail)) {
      setError("Enter a valid billing email before opening the secure payment popup.");
      return;
    }

    if (!isPaystackScriptReady) {
      setError("The secure payment popup is still loading. Try again in a moment.");
      return;
    }

    setIsCheckingOut(true);
    setError(null);
    setSuccessMessage("");

    try {
      const response = await fetch("/api/workspace/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingInterval: checkoutPlan.interval,
          email: normalizedEmail,
          firstName: billingFirstName.trim(),
          intent: checkoutIntent,
          lastName: billingLastName.trim(),
          planKey: checkoutIntent === "upgrade" ? checkoutPlan.key : undefined,
          phone: billingPhone.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            amountKobo?: number;
            currency?: string;
            customer?: BillingCheckoutPayload["customer"];
            error?: string;
            interval?: BillingCheckoutPayload["interval"];
            metadata?: Record<string, unknown>;
            planCode?: string;
            planName?: string;
            publicKey?: string;
            reference?: string;
          }
        | null;

      if (
        !response.ok ||
        !payload?.publicKey ||
        !payload.reference ||
        typeof payload.amountKobo !== "number" ||
        !payload.currency ||
        !payload.customer?.email ||
        !payload.planName ||
        !payload.interval
      ) {
        throw new Error(payload?.error || "I couldn't prepare the secure payment popup.");
      }

      const checkoutPayload: BillingCheckoutPayload = {
        amountKobo: payload.amountKobo,
        currency: payload.currency,
        customer: payload.customer,
        interval: payload.interval,
        metadata: payload.metadata ?? {},
        planCode: payload.planCode ?? "",
        planName: payload.planName,
        publicKey: payload.publicKey,
        reference: payload.reference,
      };

      openWorkspaceBillingPopup({
        checkout: checkoutPayload,
        onCancel: () => {
          setSuccessMessage("Payment popup closed before checkout was completed.");
          setIsCheckingOut(false);
        },
        onError: (message) => {
          setError(message);
          setIsCheckingOut(false);
        },
        onSuccess: (completedReference) => {
          setIsCheckingOut(false);
          setSuccessReceipt(null);
          void handleVerify(completedReference);
        },
      });
      setIsCheckoutModalOpen(false);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "I couldn't start the secure payment popup."
      );
      setIsCheckingOut(false);
    }
  }

  const canOpenCheckout =
    summary.controls.billing.enabled &&
    summary.paystackReady &&
    checkoutPlan.amountKobo > 0 &&
    (checkoutIntent === "upgrade" ? hasUpgradeOffer : !isBillingActive);

  return (
    <div className="space-y-6">
      <Script
        src="https://js.paystack.co/v2/inline.js"
        strategy="afterInteractive"
        onLoad={() => setIsPaystackScriptReady(true)}
      />

      <section className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Billing
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
                Workspace billing
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                Review payment access, billing status, and recent payment activity for this workspace.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              <BillingMetricCard
                label="Status"
                value={humanizeWorkspaceBillingStatus(summary.controls.billing.status)}
                helper={summary.controls.billing.enabled ? "Workspace access" : "Not live yet"}
              />
              <BillingMetricCard
                label="Subscription"
                value={summary.controls.billing.planName}
                helper={
                  billingLockedModules.length > 0
                    ? `${billingLockedModules.length} locked feature${billingLockedModules.length === 1 ? "" : "s"}`
                    : `${humanizeWorkspaceBillingInterval(
                        isBillingActive
                          ? summary.controls.billing.interval
                          : selectedBaseIntervalOption?.interval ?? summary.controls.billing.interval
                      )} plan`
                }
              />
              <BillingMetricCard
                label="Amount"
                value={formatNaira(
                  isBillingActive
                    ? summary.controls.billing.amountKobo
                    : selectedBaseIntervalOption?.amountKobo ?? 0
                )}
                helper={
                  summary.controls.billing.enabled
                    ? humanizeWorkspaceBillingInterval(
                        isBillingActive
                          ? summary.controls.billing.interval
                          : selectedBaseIntervalOption?.interval ?? summary.controls.billing.interval
                      )
                    : "When enabled"
                }
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)] sm:p-6">
          <section className="space-y-5 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-5 dark:border-gray-800 dark:bg-gray-950/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Subscription
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  {summary.controls.billing.planName}
                </h2>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                  summary.controls.billing.enabled
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {summary.controls.billing.enabled ? "Billing enabled" : "Not active yet"}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BillingInfoCard
                label="Billing email"
                value={summary.controls.billing.customerEmail || summary.payerEmail || "Not set"}
              />
              <BillingInfoCard
                label="Billing cycle"
                value={humanizeWorkspaceBillingInterval(
                  isBillingActive
                    ? summary.controls.billing.interval
                    : selectedBaseIntervalOption?.interval ?? summary.controls.billing.interval
                )}
              />
              <BillingInfoCard
                label="Last payment"
                value={
                  summary.controls.billing.lastPaidAt
                    ? new Date(summary.controls.billing.lastPaidAt).toLocaleString()
                    : "No successful payment yet"
                }
              />
            </div>

            {!summary.controls.billing.enabled ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                Billing is not active for this workspace yet.
              </div>
            ) : !summary.paystackReady ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                Payments are temporarily unavailable on this deployment right now.
              </div>
            ) : baseIntervalOptions.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                This billing setup is not ready for checkout yet.
              </div>
            ) : isBillingActive ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-[var(--workspace-form-border-soft)] bg-[linear-gradient(135deg,var(--workspace-form-surface),white)] px-4 py-4 dark:border-gray-800 dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.96),rgba(15,23,42,0.92))] sm:px-5 sm:py-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] xl:items-start">
                    <div className="max-w-3xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                        <CheckCircleIcon className="h-3.5 w-3.5 fill-current" />
                        Active plan
                      </div>
                      <h3 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight text-[var(--workspace-form-title)] dark:text-white">
                        {summary.controls.billing.planName} is active
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                        Billing-required features are already unlocked for this workspace.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white/80 px-4 py-4 dark:border-gray-800 dark:bg-white/5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                        Current plan
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
                        {formatNaira(summary.controls.billing.amountKobo)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
                        {humanizeWorkspaceBillingInterval(summary.controls.billing.interval)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:p-5">
                  <div className="space-y-3 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
                    <BillingSummaryRow label="Plan" value={summary.controls.billing.planName} />
                    <BillingSummaryRow
                      label="Billing cycle"
                      value={humanizeWorkspaceBillingInterval(summary.controls.billing.interval)}
                    />
                    <BillingSummaryRow
                      label="Billing email"
                      value={summary.controls.billing.customerEmail || summary.payerEmail || "Not set"}
                    />
                    <BillingSummaryRow
                      label="Last payment"
                      value={
                        summary.controls.billing.lastPaidAt
                          ? new Date(summary.controls.billing.lastPaidAt).toLocaleString()
                          : "Verified recently"
                      }
                    />
                    {reference ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => void handleVerify(reference)}
                          disabled={isVerifying}
                          className="inline-flex min-w-[220px] items-center justify-center rounded-xl border border-[var(--workspace-form-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                        >
                          {isVerifying ? "Refreshing..." : "Refresh payment status"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {hasUpgradeOffer ? (
                    <div className="space-y-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200">
                          <DollarLineIcon className="h-5 w-5 fill-current" />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                            Upgrade options
                          </p>
                          <p className="mt-1 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                            Choose a higher plan
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {availableUpgrades.map((plan) => (
                          <UpgradeOptionCard
                            key={plan.key}
                            name={plan.name}
                            options={getWorkspaceBillingUpgradePlanIntervalOptions(plan)}
                            onChoose={(interval) => {
                              setCheckoutIntent("upgrade");
                              setSelectedUpgradeKey(plan.key);
                              setSelectedUpgradeInterval(interval);
                              setError(null);
                              setIsCheckoutModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 text-sm leading-7 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                      No higher upgrade plan is available for this workspace right now.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-[var(--workspace-form-border-soft)] bg-[linear-gradient(135deg,var(--workspace-form-surface),white)] px-4 py-4 dark:border-gray-800 dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.96),rgba(15,23,42,0.92))] sm:px-5 sm:py-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)] xl:items-start">
                    <div className="max-w-3xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--workspace-form-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                        <LockIcon className="h-3.5 w-3.5 fill-current" />
                        Secure checkout
                      </div>
                      <h3 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight text-[var(--workspace-form-title)] dark:text-white">
                        Pay from your workspace
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                        Start here, then complete card verification in Paystack.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 xl:justify-self-end">
                      <BillingStepPill step="1" label="Enter details" />
                      <BillingStepPill step="2" label="Authorize card" />
                      <BillingStepPill step="3" label="Return verified" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:p-5">
                  <div className="space-y-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)]/70 p-4 dark:border-gray-800 dark:bg-gray-950/60">
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                        Choose billing cycle
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {baseIntervalOptions.map((option) => {
                          const active = selectedBillingInterval === option.interval;

                          return (
                            <button
                              key={option.interval}
                              type="button"
                              onClick={() => setSelectedBillingInterval(option.interval)}
                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                                active
                                  ? "border-[var(--workspace-form-accent)] bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-100"
                                  : "border-[var(--workspace-form-border)] bg-white text-[var(--workspace-form-title)] hover:bg-[var(--workspace-form-page)] dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-white/5"
                              }`}
                            >
                              <span>{humanizeWorkspaceBillingInterval(option.interval)}</span>
                              <span className="text-xs opacity-80">
                                {formatNaira(option.amountKobo)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                          Checkout note
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-title)] dark:text-white">
                          Open the checkout modal when you are ready. The secure card step still happens in Paystack&apos;s protected popup.
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                        <CheckCircleIcon className="h-4 w-4 fill-current" />
                        Card auth stays secure
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutIntent("current");
                          setError(null);
                          setIsCheckoutModalOpen(true);
                        }}
                        disabled={!canOpenCheckout}
                        className="inline-flex min-w-[220px] items-center justify-center rounded-xl bg-[var(--workspace-form-accent)] px-5 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Open secure checkout
                      </button>
                      {reference ? (
                        <button
                          type="button"
                          onClick={() => void handleVerify(reference)}
                          disabled={isVerifying}
                          className="inline-flex min-w-[220px] items-center justify-center rounded-xl border border-[var(--workspace-form-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                        >
                          {isVerifying ? "Refreshing..." : "Refresh payment status"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200">
                        <DollarLineIcon className="h-5 w-5 fill-current" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                          Payment summary
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                          {formatNaira(checkoutPlan.amountKobo)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <BillingSummaryRow
                        label="Plan"
                        value={summary.controls.billing.planName}
                      />
                      <BillingSummaryRow
                        label="Billing cycle"
                        value={humanizeWorkspaceBillingInterval(checkoutPlan.interval)}
                      />
                      <BillingSummaryRow
                        label="Billing email"
                        value={summary.controls.billing.customerEmail || summary.payerEmail || "Not set"}
                      />
                      <BillingSummaryRow
                        label="Charge status"
                        value={
                          isPaystackScriptReady
                            ? "Secure popup ready"
                            : "Loading secure popup"
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {billingLockedModules.length > 0 ? (
              <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  Features tied to billing
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {billingLockedModules.map((module) => (
                    <span
                      key={module.key}
                      className="inline-flex items-center rounded-full bg-[var(--workspace-form-pill-bg)] px-3 py-1 text-xs font-medium text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200"
                    >
                      {module.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

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
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-5 dark:border-gray-800 dark:bg-gray-950/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Payments
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  Recent payments
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  Track successful, pending, or recently refreshed billing activity for this workspace.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Recorded payments
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  {summary.transactions.length}
                </p>
              </div>
            </div>

            {summary.transactions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white px-5 py-8 text-sm leading-7 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                No billing transactions have been recorded for this workspace yet.
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {summary.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                          {formatNaira(transaction.amountKobo)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                          {transaction.reference}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          transaction.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                            : transaction.status === "pending"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {transaction.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--workspace-form-muted)] [overflow-wrap:anywhere] dark:text-gray-300">
                      {transaction.payerEmail}
                    </p>
                    <p className="mt-2 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <BillingSuccessModal
        onClose={() => setSuccessReceipt(null)}
        receipt={successReceipt}
      />
      <BillingCheckoutModal
        amountKobo={checkoutPlan.amountKobo}
        billingEmail={billingEmail}
        billingFirstName={billingFirstName}
        billingLastName={billingLastName}
        billingPhone={billingPhone}
        canOpenCheckout={canOpenCheckout}
        checkoutIntent={checkoutIntent}
        error={error}
        interval={checkoutPlan.interval}
        isCheckingOut={isCheckingOut}
        isOpen={isCheckoutModalOpen}
        isPaystackScriptReady={isPaystackScriptReady}
        onBillingEmailChange={setBillingEmail}
        onBillingFirstNameChange={setBillingFirstName}
        onBillingLastNameChange={setBillingLastName}
        onBillingPhoneChange={setBillingPhone}
        onClose={() => setIsCheckoutModalOpen(false)}
        onSubmit={() => void handleCheckout()}
        planName={checkoutPlan.name}
      />
    </div>
  );
}

function BillingMetricCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xl font-semibold leading-tight text-[var(--workspace-form-title)] dark:text-white">
          {value}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-muted)] dark:text-gray-400 sm:text-right">
          {helper}
        </p>
      </div>
    </div>
  );
}

function BillingInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-title)] [overflow-wrap:anywhere] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function BillingStepPill({ label, step }: { label: string; step: string }) {
  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white/85 px-4 py-3 text-left dark:border-gray-800 dark:bg-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        Step {step}
      </p>
      <p className="mt-1 text-sm font-medium leading-5 text-[var(--workspace-form-title)] dark:text-white">
        {label}
      </p>
    </div>
  );
}

function BillingSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white/70 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="text-right text-sm leading-6 text-[var(--workspace-form-title)] [overflow-wrap:anywhere] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function UpgradeOptionCard({
  name,
  onChoose,
  options,
}: {
  name: string;
  onChoose: (interval: WorkspaceBillingInterval) => void;
  options: Array<{
    amountKobo: number;
    interval: WorkspaceBillingInterval;
  }>;
}) {
  return (
    <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
            {name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.interval}
              type="button"
              onClick={() => onChoose(option.interval)}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)]"
            >
              {humanizeWorkspaceBillingInterval(option.interval)} · {formatNaira(option.amountKobo)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BillingFormField({
  icon,
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  icon?: ReactNode;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
        {label}
      </span>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--workspace-form-muted)] dark:text-gray-500">
            {icon}
          </span>
        ) : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          type={type}
          className={`w-full rounded-xl border border-[var(--workspace-form-border)] bg-white py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-[var(--workspace-form-muted)] focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[color:var(--workspace-form-accent-soft)] dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 ${icon ? "pl-11 pr-4" : "px-4"}`}
        />
      </div>
    </label>
  );
}

function BillingSuccessModal({
  onClose,
  receipt,
}: {
  onClose: () => void;
  receipt: BillingSuccessReceipt | null;
}) {
  if (!receipt) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.3)] dark:bg-gray-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-[var(--workspace-form-border-soft)] bg-[linear-gradient(135deg,var(--workspace-form-accent-soft),white)] px-6 py-6 dark:border-gray-800 dark:bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(15,23,42,0.96))]">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-white/70 text-[var(--workspace-form-title)] transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
            aria-label="Close payment success modal"
          >
            <CloseIcon className="h-4 w-4 fill-current" />
          </button>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500 text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)]">
            <CheckCircleIcon className="h-7 w-7 fill-current" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            Payment confirmed
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
            Workspace billing is now active
          </h3>
          <p className="mt-2 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
            The payment was verified successfully and your billing-gated workspace features can now unlock according to your owner controls.
          </p>
        </div>

        <div className="space-y-3 p-6">
          <BillingSummaryRow label="Amount paid" value={formatNaira(receipt.amountKobo)} />
          <BillingSummaryRow label="Billing email" value={receipt.payerEmail} />
          <BillingSummaryRow label="Reference" value={receipt.reference} />
          <BillingSummaryRow
            label="Paid at"
            value={
              receipt.paidAt
                ? new Date(receipt.paidAt).toLocaleString()
                : "Verified just now"
            }
          />
        </div>

        <div className="flex justify-end border-t border-[var(--workspace-form-border-soft)] px-6 py-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--workspace-form-accent)] px-5 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingCheckoutModal({
  amountKobo,
  billingEmail,
  billingFirstName,
  billingLastName,
  billingPhone,
  canOpenCheckout,
  checkoutIntent,
  error,
  interval,
  isCheckingOut,
  isOpen,
  isPaystackScriptReady,
  onBillingEmailChange,
  onBillingFirstNameChange,
  onBillingLastNameChange,
  onBillingPhoneChange,
  onClose,
  onSubmit,
  planName,
}: {
  amountKobo: number;
  billingEmail: string;
  billingFirstName: string;
  billingLastName: string;
  billingPhone: string;
  canOpenCheckout: boolean;
  checkoutIntent: "current" | "upgrade";
  error: string | null;
  interval: "monthly" | "yearly";
  isCheckingOut: boolean;
  isOpen: boolean;
  isPaystackScriptReady: boolean;
  onBillingEmailChange: (value: string) => void;
  onBillingFirstNameChange: (value: string) => void;
  onBillingLastNameChange: (value: string) => void;
  onBillingPhoneChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  planName: string;
}) {
  const billingContactName = [billingFirstName.trim(), billingLastName.trim()]
    .filter(Boolean)
    .join(" ");
  const isUpgrade = checkoutIntent === "upgrade";

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.3)] dark:bg-gray-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--workspace-form-border-soft)] bg-[linear-gradient(135deg,var(--workspace-form-surface),white)] px-5 py-5 dark:border-gray-800 dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.96),rgba(15,23,42,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--workspace-form-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                <LockIcon className="h-3.5 w-3.5 fill-current" />
                {isUpgrade ? "Secure upgrade" : "Secure checkout"}
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
                {isUpgrade ? "Upgrade this workspace" : "Pay from your workspace"}
              </h3>
              <p className="mt-2 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                {isUpgrade
                  ? "Enter your billing details here, then complete the upgrade in Paystack."
                  : "Enter your billing details here, then complete card verification in Paystack."}
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <BillingStepPill step="1" label="Enter details" />
                <BillingStepPill step="2" label="Authorize card" />
                <BillingStepPill step="3" label="Return verified" />
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/40 bg-white/70 text-[var(--workspace-form-title)] transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                aria-label="Close secure checkout"
              >
                <CloseIcon className="h-4 w-4 fill-current" />
              </button>
            </div>
          </div>
        </div>

        <form
          className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <BillingFormField
                icon={<EnvelopeIcon className="h-4 w-4 fill-current" />}
                label="Billing email"
                placeholder="billing@company.com"
                required
                value={billingEmail}
                onChange={onBillingEmailChange}
                type="email"
              />
              <BillingFormField
                icon={<UserIcon className="h-4 w-4 fill-current" />}
                label="Phone number"
                placeholder="+234 801 234 5678"
                value={billingPhone}
                onChange={onBillingPhoneChange}
                type="tel"
              />
              <BillingFormField
                icon={<UserIcon className="h-4 w-4 fill-current" />}
                label="First name"
                placeholder="Ada"
                value={billingFirstName}
                onChange={onBillingFirstNameChange}
              />
              <BillingFormField
                icon={<UserIcon className="h-4 w-4 fill-current" />}
                label="Last name"
                placeholder="Okafor"
                value={billingLastName}
                onChange={onBillingLastNameChange}
              />
            </div>

            <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)]/70 p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                    Checkout note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-title)] dark:text-white">
                    After you continue, Paystack handles the secure card step while you remain inside your workspace flow.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <CheckCircleIcon className="h-4 w-4 fill-current" />
                  Card auth stays secure
                </span>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm leading-6 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-100">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200">
                <DollarLineIcon className="h-5 w-5 fill-current" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Payment summary
                </p>
                <p className="mt-1 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                  {formatNaira(amountKobo)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <BillingSummaryRow label="Plan" value={planName} />
              <BillingSummaryRow
                label="Billing cycle"
                value={humanizeWorkspaceBillingInterval(interval)}
              />
              <BillingSummaryRow
                label="Billing email"
                value={billingEmail.trim() || "Add an email above"}
              />
              <BillingSummaryRow
                label="Contact"
                value={billingContactName || "Optional"}
              />
              <BillingSummaryRow
                label="Charge status"
                value={
                  isPaystackScriptReady ? "Secure popup ready" : "Loading secure popup"
                }
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={isCheckingOut || !canOpenCheckout}
                className="inline-flex items-center justify-center rounded-xl bg-[var(--workspace-form-accent)] px-5 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingOut
                  ? isUpgrade
                    ? "Opening secure upgrade..."
                    : "Opening secure payment..."
                  : isPaystackScriptReady
                    ? isUpgrade
                      ? "Continue to secure upgrade"
                      : "Continue to secure payment"
                    : isUpgrade
                      ? "Loading secure upgrade..."
                      : "Loading secure payment..."}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--workspace-form-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatNaira(amountKobo: number) {
  const amount = Math.max(0, amountKobo) / 100;

  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    style: "currency",
    maximumFractionDigits: 2,
  }).format(amount);
}

function isValidBillingEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildPaystackPopup() {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof window.PaystackPop === "function") {
    return new window.PaystackPop();
  }

  if (typeof window.Paystack === "function") {
    return new window.Paystack();
  }

  return null;
}

function openWorkspaceBillingPopup({
  checkout,
  onCancel,
  onError,
  onSuccess,
}: {
  checkout: BillingCheckoutPayload;
  onCancel: () => void;
  onError: (message: string) => void;
  onSuccess: (reference: string) => void;
}) {
  const popup = buildPaystackPopup();

  if (!popup) {
    throw new Error("The Paystack popup is not available yet.");
  }

  const options: PaystackPopupOptions = {
    amount: checkout.amountKobo,
    currency: checkout.currency,
    email: checkout.customer.email,
    firstName: checkout.customer.firstName || undefined,
    key: checkout.publicKey,
    lastName: checkout.customer.lastName || undefined,
    metadata: checkout.metadata,
    onCancel,
    onError: (error) => {
      onError(error.message || "I couldn't open the secure payment popup.");
    },
    onSuccess: (transaction) => {
      onSuccess(transaction.reference || transaction.trxref || checkout.reference);
    },
    phone: checkout.customer.phone || undefined,
    planCode: checkout.planCode || undefined,
    ref: checkout.reference,
    reference: checkout.reference,
  };

  if (typeof popup.checkout === "function") {
    popup.checkout(options);
    return;
  }

  if (typeof popup.newTransaction === "function") {
    popup.newTransaction(options);
    return;
  }

  throw new Error("This Paystack popup build does not support inline checkout.");
}
