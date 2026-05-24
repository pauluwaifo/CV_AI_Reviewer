import "server-only";

import { randomBytes } from "node:crypto";

import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { getWorkspaceControlSettings, saveWorkspaceControlSettings } from "@/lib/workspace-control-store";
import {
  createWorkspaceBillingTransaction,
  getWorkspaceBillingTransactionByReference,
  listWorkspaceBillingTransactions,
  updateWorkspaceBillingTransactionByReference,
} from "@/lib/workspace-billing-store";
import {
  getWorkspaceBillingIntervalOptions,
  getAvailableWorkspaceBillingUpgrades,
  getWorkspaceBillingUpgradePlanIntervalOptions,
  type WorkspaceBillingInterval,
  type WorkspaceBillingUpgradePlan,
} from "@/lib/workspace-controls";
import {
  getPaystackPublicKey,
  isPaystackConfigured,
  verifyPaystackTransaction,
} from "@/lib/paystack";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export async function getWorkspaceBillingSummary(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const [accessRecord, controls, transactions] = await Promise.all([
    getWorkspaceAccessRecord(normalizedWorkspaceId),
    getWorkspaceControlSettings(normalizedWorkspaceId),
    listWorkspaceBillingTransactions(normalizedWorkspaceId),
  ]);

  return {
    controls,
    paystackReady: isPaystackConfigured(),
    payerEmail:
      controls.billing.customerEmail ||
      accessRecord?.contactEmail ||
      "",
    transactions,
    workspaceId: normalizedWorkspaceId,
  };
}

export async function prepareWorkspaceBillingCheckout(input: {
  customer: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  billingInterval?: WorkspaceBillingInterval;
  intent?: "current" | "upgrade";
  planKey?: string;
  requesterEmail: string;
  workspaceId: string;
}) {
  const summary = await getWorkspaceBillingSummary(input.workspaceId);
  const billing = summary.controls.billing;
  const availableUpgrades = getAvailableWorkspaceBillingUpgrades(billing);
  const baseIntervalOptions = getWorkspaceBillingIntervalOptions(billing);

  if (!billing.enabled) {
    throw new Error("Billing has not been activated for this workspace yet.");
  }

  if (!summary.paystackReady) {
    throw new Error("Paystack is not configured yet for this deployment.");
  }

  const selectedPlan =
    input.intent === "upgrade"
      ? resolveWorkspaceBillingUpgradePlan(
          availableUpgrades,
          input.planKey,
          input.billingInterval
        )
      : resolveWorkspaceBillingCurrentPlan(
          billing.planName.trim(),
          baseIntervalOptions,
          input.billingInterval
        );

  if (!selectedPlan) {
    throw new Error(
      input.intent === "upgrade"
        ? "There is no higher upgrade plan configured for this workspace yet."
        : "This workspace does not have a monthly or yearly billing option configured yet."
    );
  }

  if (selectedPlan.kind === "current" && billing.status === "active") {
    throw new Error("This workspace plan is already active. Upgrade instead if a higher plan is available.");
  }

  if (selectedPlan.amountKobo <= 0) {
    throw new Error("Set a billing amount before sending this workspace to checkout.");
  }

  const payerEmail =
    normalizeBillingEmail(input.customer.email) ||
    billing.customerEmail ||
    input.requesterEmail.trim().toLowerCase() ||
    summary.payerEmail;

  if (!payerEmail) {
    throw new Error("This workspace does not have a billing contact email yet.");
  }

  const reference = buildWorkspaceBillingReference(summary.workspaceId);
  const customer = {
    email: payerEmail,
    firstName: normalizeShortText(input.customer.firstName),
    lastName: normalizeShortText(input.customer.lastName),
    phone: normalizeShortText(input.customer.phone),
  };
  const metadata = {
    workspaceId: summary.workspaceId,
    workspacePlanKey: selectedPlan.key,
    workspacePlan: selectedPlan.planName,
    workspacePlanAmountKobo: selectedPlan.amountKobo,
    workspacePlanCode: selectedPlan.planCode,
    workspacePlanInterval: selectedPlan.interval,
    workspacePlanKind: selectedPlan.kind,
    source: "workspace-billing",
  };

  await createWorkspaceBillingTransaction({
    workspaceId: summary.workspaceId,
    reference,
    amountKobo: selectedPlan.amountKobo,
    currency: billing.currency,
    payerEmail,
    authorizationUrl: "",
    accessCode: "",
    providerPayload: {
      customer,
      mode: "inline_popup",
      metadata,
      planKey: selectedPlan.key,
      planInterval: selectedPlan.interval,
      planKind: selectedPlan.kind,
      planName: selectedPlan.planName,
      ...(selectedPlan.planCode ? { planCode: selectedPlan.planCode } : {}),
    },
  });

  await saveWorkspaceControlSettings(summary.workspaceId, {
    billing: {
      ...billing,
      customerEmail: payerEmail,
      lastReference: reference,
      status: billing.status === "active" && selectedPlan.kind === "upgrade"
        ? "active"
        : "pending_payment",
    },
  });

  return {
    amountKobo: selectedPlan.amountKobo,
    currency: billing.currency,
    customer,
    interval: selectedPlan.interval,
    metadata,
    planCode: selectedPlan.planCode,
    planName: selectedPlan.planName,
    publicKey: getPaystackPublicKey(),
    reference,
  };
}

export async function verifyWorkspaceBillingCheckout(reference: string) {
  const transaction = await getWorkspaceBillingTransactionByReference(reference);

  if (!transaction) {
    throw new Error("That billing reference was not found.");
  }

  const verification = await verifyPaystackTransaction(reference);
  const status = typeof verification.status === "string" ? verification.status : "pending";
  const customer =
    verification.customer && typeof verification.customer === "object"
      ? verification.customer
      : null;
  const customerEmail =
    customer && typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  const paidAt =
    typeof verification.paid_at === "string" && verification.paid_at.trim()
      ? new Date(verification.paid_at).toISOString()
      : null;
  const nextTransaction = await updateWorkspaceBillingTransactionByReference(reference, {
    paidAt,
    providerPayload: verification,
    status:
      status === "success"
        ? "success"
        : status === "failed" || status === "abandoned"
          ? status
          : "pending",
  });
  const currentControls = await getWorkspaceControlSettings(transaction.workspaceId);
  const selectedPlan = getStoredBillingPlanSelection(transaction.providerPayload, currentControls.billing);
  const isUpgradeAttempt = selectedPlan.kind === "upgrade";
  const wasActive = currentControls.billing.status === "active";
  const nextStatus =
    status === "success"
      ? "active"
      : wasActive && isUpgradeAttempt
        ? "active"
        : status === "abandoned"
          ? "cancelled"
          : status === "failed"
            ? "past_due"
            : "pending_payment";

  await saveWorkspaceControlSettings(transaction.workspaceId, {
    billing: {
      ...currentControls.billing,
      amountKobo:
        status === "success" ? selectedPlan.amountKobo : currentControls.billing.amountKobo,
      customerEmail: customerEmail || currentControls.billing.customerEmail,
      interval:
        status === "success" ? selectedPlan.interval : currentControls.billing.interval,
      lastPaidAt: paidAt ?? currentControls.billing.lastPaidAt,
      lastReference: reference.trim(),
      planCode:
        status === "success" ? selectedPlan.planCode : currentControls.billing.planCode,
      planName:
        status === "success" ? selectedPlan.planName : currentControls.billing.planName,
      status: nextStatus,
      upgradePlans:
        status === "success" && isUpgradeAttempt
          ? currentControls.billing.upgradePlans.filter(
              (plan) =>
                getHighestWorkspaceBillingOptionAmount(
                  getWorkspaceBillingUpgradePlanIntervalOptions(plan)
                ) > selectedPlan.amountKobo && plan.key !== selectedPlan.key
            )
          : currentControls.billing.upgradePlans,
    },
  });

  return {
    transaction: nextTransaction,
    verification,
  };
}

function getStoredBillingPlanSelection(
  value: unknown,
  fallback: {
    amountKobo: number;
    interval: WorkspaceBillingInterval;
    key?: string;
    planCode: string;
    planName: string;
    upgradePlans?: WorkspaceBillingUpgradePlan[];
  }
) {
  const parsed = (value ?? {}) as {
    metadata?: {
      workspacePlan?: string;
      workspacePlanAmountKobo?: number;
      workspacePlanCode?: string;
      workspacePlanInterval?: string;
      workspacePlanKey?: string;
      workspacePlanKind?: string;
    };
    planKey?: string;
    planCode?: string;
    planInterval?: string;
    planKind?: string;
    planName?: string;
  };

  const metadata = parsed.metadata ?? {};
  const interval: WorkspaceBillingInterval =
    metadata.workspacePlanInterval === "yearly" ||
    parsed.planInterval === "yearly"
      ? "yearly"
      : "monthly";

  return {
    amountKobo:
      typeof metadata.workspacePlanAmountKobo === "number" && Number.isFinite(metadata.workspacePlanAmountKobo)
        ? Math.max(0, Math.round(metadata.workspacePlanAmountKobo))
        : fallback.amountKobo,
    interval,
    key:
      typeof metadata.workspacePlanKey === "string" && metadata.workspacePlanKey.trim()
        ? metadata.workspacePlanKey.trim()
        : typeof parsed.planKey === "string" && parsed.planKey.trim()
          ? parsed.planKey.trim()
          : fallback.key ?? "current-plan",
    kind:
      metadata.workspacePlanKind === "upgrade" || parsed.planKind === "upgrade"
        ? "upgrade"
        : "current",
    planCode:
      typeof metadata.workspacePlanCode === "string" && metadata.workspacePlanCode.trim()
        ? metadata.workspacePlanCode.trim()
        : typeof parsed.planCode === "string"
          ? parsed.planCode.trim()
          : fallback.planCode,
    planName:
      typeof metadata.workspacePlan === "string" && metadata.workspacePlan.trim()
        ? metadata.workspacePlan.trim()
        : typeof parsed.planName === "string" && parsed.planName.trim()
          ? parsed.planName.trim()
          : fallback.planName,
  };
}

function buildWorkspaceBillingReference(workspaceId: string) {
  return `bill_${workspaceId}_${randomBytes(6).toString("hex")}`;
}

function normalizeBillingEmail(value: string | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeShortText(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveWorkspaceBillingCurrentPlan(
  planName: string,
  options: Array<{
    amountKobo: number;
    interval: WorkspaceBillingInterval;
    planCode: string;
  }>,
  interval: WorkspaceBillingInterval | undefined
) {
  const chosenOption =
    (interval
      ? options.find((option) => option.interval === interval)
      : null) ??
    options.find((option) => option.interval === "monthly") ??
    options[0] ??
    null;

  if (!chosenOption) {
    return null;
  }

  return {
    key: `current-${chosenOption.interval}`,
    amountKobo: chosenOption.amountKobo,
    interval: chosenOption.interval,
    kind: "current" as const,
    planCode: chosenOption.planCode.trim(),
    planName,
  };
}

function resolveWorkspaceBillingUpgradePlan(
  plans: WorkspaceBillingUpgradePlan[],
  planKey: string | undefined,
  interval: WorkspaceBillingInterval | undefined
) {
  const normalizedPlanKey = typeof planKey === "string" ? planKey.trim() : "";
  const chosenPlanDefinition =
    (normalizedPlanKey
      ? plans.find((plan) => plan.key === normalizedPlanKey)
      : null) ?? plans[0] ?? null;

  if (!chosenPlanDefinition) {
    return null;
  }

  const options = getWorkspaceBillingUpgradePlanIntervalOptions(chosenPlanDefinition);
  const chosenOption =
    (interval ? options.find((option) => option.interval === interval) : null) ??
    options.find((option) => option.interval === "monthly") ??
    options[0] ??
    null;

  if (!chosenOption) {
    return null;
  }

  return {
    key: chosenPlanDefinition.key,
    amountKobo: chosenOption.amountKobo,
    interval: chosenOption.interval,
    kind: "upgrade" as const,
    planCode: chosenOption.planCode.trim(),
    planName: chosenPlanDefinition.name.trim(),
  };
}

function getHighestWorkspaceBillingOptionAmount(
  options: Array<{ amountKobo: number }>
) {
  return options.reduce((highest, option) => Math.max(highest, option.amountKobo), 0);
}
