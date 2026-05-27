import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const WORKSPACE_FEATURE_MODULES = [
  {
    key: "screen_cv",
    label: "Screen CV",
    path: "/upload",
    description: "Upload resumes and run AI-assisted screening.",
  },
  {
    key: "results",
    label: "Results",
    path: "/results",
    description: "Review saved screening outcomes and comparisons.",
  },
  {
    key: "analytics",
    label: "Analytics",
    path: "/analytics",
    description: "Track submissions, stage movement, and workspace hiring trends.",
  },
  {
    key: "operations",
    label: "Operations",
    path: "/operations",
    description: "Work through overdue follow-ups, upcoming interviews, and stale reviews.",
  },
  {
    key: "audit_log",
    label: "Audit Log",
    path: "/audit",
    description: "Review access, workflow, billing, and integration activity across the workspace.",
  },
  {
    key: "pipeline",
    label: "Hiring Pipeline",
    path: "/pipeline",
    description: "Build hiring forms and review incoming submissions.",
  },
  {
    key: "candidate_mail",
    label: "Candidate Mail",
    path: "/candidate-mail",
    description: "Compose rejection and follow-up emails with approval.",
  },
  {
    key: "workspace_settings",
    label: "Workspace Settings",
    path: "/workspace",
    description: "Control branding, access, inbox connection, and security.",
  },
  {
    key: "assistant",
    label: "Workspace Bot",
    path: "",
    description: "Offer chat guidance, walkthroughs, and CV help inside the workspace.",
  },
] as const;

export type WorkspaceFeatureKey = (typeof WORKSPACE_FEATURE_MODULES)[number]["key"];
export type WorkspaceModuleReleaseMode = "open" | "owner_locked" | "requires_billing";
export type WorkspaceBillingPlanKind = "current" | "upgrade";
export type WorkspaceBillingStatus =
  | "inactive"
  | "pending_payment"
  | "active"
  | "past_due"
  | "cancelled";
export type WorkspaceBillingInterval = "monthly" | "yearly";
export type WorkspaceBillingIntervalOption = {
  interval: WorkspaceBillingInterval;
  amountKobo: number;
  planCode: string;
};
export type WorkspaceBillingUpgradePlan = {
  key: string;
  name: string;
  monthlyAmountKobo: number;
  monthlyPlanCode: string;
  yearlyAmountKobo: number;
  yearlyPlanCode: string;
};

export type WorkspaceModuleAccess = {
  mode: WorkspaceModuleReleaseMode;
  note: string;
  billingPlanKey: string;
};

export type WorkspaceBillingSettings = {
  enabled: boolean;
  provider: "paystack";
  currency: "NGN";
  monthlyAmountKobo: number;
  monthlyPlanCode: string;
  yearlyAmountKobo: number;
  yearlyPlanCode: string;
  interval: WorkspaceBillingInterval;
  planName: string;
  planCode: string;
  amountKobo: number;
  upgradePlans: WorkspaceBillingUpgradePlan[];
  activePlanKey: string;
  activePlanKind: WorkspaceBillingPlanKind;
  status: WorkspaceBillingStatus;
  customerEmail: string;
  lastReference: string;
  lastPaidAt: string | null;
};

export type WorkspaceControlSettings = {
  workspaceId: string;
  modules: Record<WorkspaceFeatureKey, WorkspaceModuleAccess>;
  billing: WorkspaceBillingSettings;
};

export const BASE_WORKSPACE_BILLING_PLAN_KEY = "current-plan";

const DEFAULT_MODULE_ACCESS: WorkspaceModuleAccess = {
  mode: "open",
  note: "",
  billingPlanKey: BASE_WORKSPACE_BILLING_PLAN_KEY,
};

export const DEFAULT_WORKSPACE_BILLING_SETTINGS: WorkspaceBillingSettings = {
  enabled: false,
  provider: "paystack",
  currency: "NGN",
  monthlyAmountKobo: 0,
  monthlyPlanCode: "",
  yearlyAmountKobo: 0,
  yearlyPlanCode: "",
  interval: "monthly",
  planName: "Workspace Growth",
  planCode: "",
  amountKobo: 0,
  upgradePlans: [],
  activePlanKey: BASE_WORKSPACE_BILLING_PLAN_KEY,
  activePlanKind: "current",
  status: "inactive",
  customerEmail: "",
  lastReference: "",
  lastPaidAt: null,
};

export function buildDefaultWorkspaceControlSettings(
  workspaceId: string
): WorkspaceControlSettings {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return {
    workspaceId: normalizedWorkspaceId,
    modules: WORKSPACE_FEATURE_MODULES.reduce(
      (accumulator, module) => {
        accumulator[module.key] = { ...DEFAULT_MODULE_ACCESS };
        return accumulator;
      },
      {} as Record<WorkspaceFeatureKey, WorkspaceModuleAccess>
    ),
    billing: {
      ...DEFAULT_WORKSPACE_BILLING_SETTINGS,
    },
  };
}

export function parseWorkspaceControlSettings(
  value: unknown,
  workspaceId: string
): WorkspaceControlSettings {
  const defaults = buildDefaultWorkspaceControlSettings(workspaceId);
  const parsed = (value ?? {}) as Partial<WorkspaceControlSettings>;
  const parsedModules = (parsed.modules ?? {}) as Partial<
    Record<WorkspaceFeatureKey, Partial<WorkspaceModuleAccess>>
  >;

  const modules = WORKSPACE_FEATURE_MODULES.reduce(
    (accumulator, module) => {
      const moduleValue = parsedModules[module.key];

      accumulator[module.key] = {
        mode: normalizeModuleReleaseMode(moduleValue?.mode, defaults.modules[module.key].mode),
        note: normalizeShortText(moduleValue?.note),
        billingPlanKey: normalizeWorkspaceBillingPlanKey(
          moduleValue?.billingPlanKey,
          defaults.modules[module.key].billingPlanKey
        ),
      };

      return accumulator;
    },
    {} as Record<WorkspaceFeatureKey, WorkspaceModuleAccess>
  );

  const billing = parseWorkspaceBillingSettings(parsed.billing, defaults.billing);

  if (!billing.enabled && billing.status !== "inactive") {
    billing.status = "inactive";
  }

  return {
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId ?? workspaceId),
    modules,
    billing,
  };
}

export function getWorkspaceFeatureModule(featureKey: WorkspaceFeatureKey) {
  return WORKSPACE_FEATURE_MODULES.find((module) => module.key === featureKey) ?? null;
}

export function isWorkspaceModuleAccessible(
  controls: WorkspaceControlSettings,
  featureKey: WorkspaceFeatureKey
) {
  const moduleAccess = controls.modules[featureKey];

  if (!moduleAccess || moduleAccess.mode === "open") {
    return true;
  }

  if (moduleAccess.mode === "requires_billing") {
    return hasWorkspaceBillingTierAccess(controls, moduleAccess.billingPlanKey);
  }

  return false;
}

export function getWorkspaceModuleLockedMessage(
  controls: WorkspaceControlSettings,
  featureKey: WorkspaceFeatureKey
) {
  const moduleAccess = controls.modules[featureKey];
  const moduleDefinition = getWorkspaceFeatureModule(featureKey);
  const moduleLabel = moduleDefinition?.label ?? "This workspace module";

  if (!moduleAccess || moduleAccess.mode === "open") {
    return "";
  }

  if (moduleAccess.note) {
    return moduleAccess.note;
  }

  if (moduleAccess.mode === "requires_billing") {
    const targetPlanLabel = getWorkspaceBillingPlanLabel(
      controls.billing,
      moduleAccess.billingPlanKey
    );

    return controls.billing.enabled
      ? moduleAccess.billingPlanKey === BASE_WORKSPACE_BILLING_PLAN_KEY
        ? `${moduleLabel} unlocks once the base paid workspace plan is active.`
        : `${moduleLabel} unlocks on the ${targetPlanLabel} tier.`
      : `${moduleLabel} is reserved for paid workspaces once billing is turned on.`;
  }

  return `${moduleLabel} is currently locked by the platform owner for this workspace.`;
}

export function humanizeWorkspaceModuleReleaseMode(mode: WorkspaceModuleReleaseMode) {
  if (mode === "requires_billing") {
    return "Requires billing";
  }

  if (mode === "owner_locked") {
    return "Owner locked";
  }

  return "Open";
}

export function humanizeWorkspaceBillingStatus(status: WorkspaceBillingStatus) {
  if (status === "pending_payment") {
    return "Pending payment";
  }

  if (status === "past_due") {
    return "Past due";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function humanizeWorkspaceBillingInterval(interval: WorkspaceBillingInterval) {
  return interval === "yearly" ? "Yearly" : "Monthly";
}

export function getWorkspaceBillingIntervalOptions(settings: WorkspaceBillingSettings) {
  const options: WorkspaceBillingIntervalOption[] = [];

  if (settings.monthlyAmountKobo > 0) {
    options.push({
      interval: "monthly",
      amountKobo: settings.monthlyAmountKobo,
      planCode: settings.monthlyPlanCode.trim(),
    });
  }

  if (settings.yearlyAmountKobo > 0) {
    options.push({
      interval: "yearly",
      amountKobo: settings.yearlyAmountKobo,
      planCode: settings.yearlyPlanCode.trim(),
    });
  }

  return options;
}

export function getPreferredWorkspaceBillingIntervalOption(settings: WorkspaceBillingSettings) {
  const options = getWorkspaceBillingIntervalOptions(settings);

  return options.find((option) => option.interval === "monthly") ?? options[0] ?? null;
}

export function hasWorkspaceBillingUpgrade(settings: WorkspaceBillingSettings) {
  return getAvailableWorkspaceBillingUpgrades(settings).length > 0;
}

export function getAvailableWorkspaceBillingUpgrades(settings: WorkspaceBillingSettings) {
  return [...settings.upgradePlans]
    .filter(
      (plan) =>
        getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(plan)) >
          settings.amountKobo &&
        plan.name.trim().length > 0
    )
    .sort(
      (left, right) =>
        getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(left)) -
        getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(right))
    );
}

export function getWorkspaceBillingPlanLabel(
  settings: WorkspaceBillingSettings,
  planKey: string
) {
  if (!planKey || planKey === BASE_WORKSPACE_BILLING_PLAN_KEY) {
    return settings.planName || "Base plan";
  }

  return settings.upgradePlans.find((plan) => plan.key === planKey)?.name || "Upgrade tier";
}

export function getWorkspaceBillingPlanOrder(
  settings: WorkspaceBillingSettings,
  planKey: string
) {
  if (!planKey || planKey === BASE_WORKSPACE_BILLING_PLAN_KEY) {
    return 0;
  }

  const orderedPlans = [...settings.upgradePlans].sort(
    (left, right) =>
      getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(left)) -
      getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(right))
  );
  const index = orderedPlans.findIndex((plan) => plan.key === planKey);

  return index >= 0 ? index + 1 : null;
}

export function hasWorkspaceBillingTierAccess(
  controls: WorkspaceControlSettings,
  requiredPlanKey: string
) {
  if (!controls.billing.enabled || controls.billing.status !== "active") {
    return false;
  }

  const activePlanKey = normalizeWorkspaceBillingPlanKey(
    controls.billing.activePlanKey,
    BASE_WORKSPACE_BILLING_PLAN_KEY
  );
  const normalizedRequiredPlanKey = normalizeWorkspaceBillingPlanKey(
    requiredPlanKey,
    BASE_WORKSPACE_BILLING_PLAN_KEY
  );
  const activeOrder = getWorkspaceBillingPlanOrder(controls.billing, activePlanKey) ?? 0;
  const requiredOrder =
    getWorkspaceBillingPlanOrder(controls.billing, normalizedRequiredPlanKey) ?? 0;

  return activeOrder >= requiredOrder;
}

export function getWorkspaceModulesForBillingPlan(
  controls: WorkspaceControlSettings,
  planKey: string
) {
  const normalizedPlanKey = normalizeWorkspaceBillingPlanKey(
    planKey,
    BASE_WORKSPACE_BILLING_PLAN_KEY
  );

  return WORKSPACE_FEATURE_MODULES.filter((module) => {
    const access = controls.modules[module.key];

    return (
      access.mode === "requires_billing" &&
      normalizeWorkspaceBillingPlanKey(
        access.billingPlanKey,
        BASE_WORKSPACE_BILLING_PLAN_KEY
      ) === normalizedPlanKey
    );
  });
}

export function getWorkspaceBillingUpgradePlanIntervalOptions(
  plan: WorkspaceBillingUpgradePlan
) {
  const options: WorkspaceBillingIntervalOption[] = [];

  if (plan.monthlyAmountKobo > 0) {
    options.push({
      interval: "monthly",
      amountKobo: plan.monthlyAmountKobo,
      planCode: plan.monthlyPlanCode.trim(),
    });
  }

  if (plan.yearlyAmountKobo > 0) {
    options.push({
      interval: "yearly",
      amountKobo: plan.yearlyAmountKobo,
      planCode: plan.yearlyPlanCode.trim(),
    });
  }

  return options;
}

function parseWorkspaceBillingSettings(
  value: unknown,
  fallback: WorkspaceBillingSettings
): WorkspaceBillingSettings {
  const parsed = (value ?? {}) as Partial<WorkspaceBillingSettings> & {
    activePlanKey?: unknown;
    activePlanKind?: unknown;
    monthlyAmountKobo?: unknown;
    monthlyPlanCode?: unknown;
    upgradeAmountKobo?: unknown;
    upgradeInterval?: unknown;
    upgradePlanCode?: unknown;
    upgradePlanName?: unknown;
    upgradePlans?: unknown;
    yearlyAmountKobo?: unknown;
    yearlyPlanCode?: unknown;
  };
  const legacyUpgradePlan =
    normalizeShortText(parsed.upgradePlanName).length > 0 ||
    normalizeNonNegativeInteger(parsed.upgradeAmountKobo, 0) > 0
      ? {
          monthlyAmountKobo:
            normalizeBillingInterval(parsed.upgradeInterval, "yearly") === "monthly"
              ? normalizeNonNegativeInteger(parsed.upgradeAmountKobo, 0)
              : 0,
          monthlyPlanCode:
            normalizeBillingInterval(parsed.upgradeInterval, "yearly") === "monthly"
              ? normalizeShortText(parsed.upgradePlanCode)
              : "",
          key: buildWorkspaceBillingUpgradePlanKey(
            normalizeShortText(parsed.upgradePlanCode) ||
              normalizeShortText(parsed.upgradePlanName) ||
              "legacy-upgrade",
            0
          ),
          name: normalizeShortText(parsed.upgradePlanName),
          yearlyAmountKobo:
            normalizeBillingInterval(parsed.upgradeInterval, "yearly") === "yearly"
              ? normalizeNonNegativeInteger(parsed.upgradeAmountKobo, 0)
              : 0,
          yearlyPlanCode:
            normalizeBillingInterval(parsed.upgradeInterval, "yearly") === "yearly"
              ? normalizeShortText(parsed.upgradePlanCode)
              : "",
        }
      : null;
  const normalizedUpgradePlans = normalizeWorkspaceBillingUpgradePlans(
    parsed.upgradePlans,
    legacyUpgradePlan ? [legacyUpgradePlan] : fallback.upgradePlans
  );

  return {
    enabled: Boolean(parsed.enabled),
    provider: "paystack",
    currency: "NGN",
    monthlyAmountKobo: normalizeNonNegativeInteger(
      parsed.monthlyAmountKobo,
      parsed.interval === "monthly"
        ? normalizeNonNegativeInteger(parsed.amountKobo, fallback.monthlyAmountKobo)
        : fallback.monthlyAmountKobo
    ),
    monthlyPlanCode: normalizeShortText(
      parsed.monthlyPlanCode,
      parsed.interval === "monthly" ? normalizeShortText(parsed.planCode) : fallback.monthlyPlanCode
    ),
    yearlyAmountKobo: normalizeNonNegativeInteger(
      parsed.yearlyAmountKobo,
      parsed.interval === "yearly"
        ? normalizeNonNegativeInteger(parsed.amountKobo, fallback.yearlyAmountKobo)
        : fallback.yearlyAmountKobo
    ),
    yearlyPlanCode: normalizeShortText(
      parsed.yearlyPlanCode,
      parsed.interval === "yearly" ? normalizeShortText(parsed.planCode) : fallback.yearlyPlanCode
    ),
    interval: normalizeBillingInterval(parsed.interval, fallback.interval),
    planName: normalizeShortText(parsed.planName, fallback.planName),
    planCode: normalizeShortText(parsed.planCode),
    amountKobo: normalizeNonNegativeInteger(parsed.amountKobo, fallback.amountKobo),
    upgradePlans: normalizedUpgradePlans,
    activePlanKey: normalizeWorkspaceBillingPlanKey(parsed.activePlanKey, fallback.activePlanKey),
    activePlanKind: normalizeWorkspaceBillingPlanKind(
      parsed.activePlanKind,
      fallback.activePlanKind
    ),
    status: normalizeBillingStatus(parsed.status, fallback.status),
    customerEmail: normalizeEmail(parsed.customerEmail),
    lastReference: normalizeShortText(parsed.lastReference),
    lastPaidAt: normalizeNullableIsoDate(parsed.lastPaidAt),
  };
}

function normalizeModuleReleaseMode(
  value: unknown,
  fallback: WorkspaceModuleReleaseMode
): WorkspaceModuleReleaseMode {
  return value === "owner_locked" || value === "requires_billing" || value === "open"
    ? value
    : fallback;
}

function normalizeWorkspaceBillingPlanKind(
  value: unknown,
  fallback: WorkspaceBillingPlanKind
): WorkspaceBillingPlanKind {
  return value === "upgrade" || value === "current" ? value : fallback;
}

function normalizeBillingStatus(
  value: unknown,
  fallback: WorkspaceBillingStatus
): WorkspaceBillingStatus {
  return value === "inactive" ||
    value === "pending_payment" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled"
    ? value
    : fallback;
}

function normalizeBillingInterval(
  value: unknown,
  fallback: WorkspaceBillingInterval
): WorkspaceBillingInterval {
  return value === "yearly" || value === "monthly" ? value : fallback;
}

function normalizeWorkspaceBillingUpgradePlans(
  value: unknown,
  fallback: WorkspaceBillingUpgradePlan[]
) {
  const parsed = Array.isArray(value) ? value : fallback;

  return parsed
    .map((item, index) => normalizeWorkspaceBillingUpgradePlan(item, index))
    .filter((item): item is WorkspaceBillingUpgradePlan => item !== null)
    .sort(
      (left, right) =>
        getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(left)) -
        getLowestWorkspaceBillingOptionAmount(getWorkspaceBillingUpgradePlanIntervalOptions(right))
    );
}

function normalizeWorkspaceBillingUpgradePlan(value: unknown, index: number) {
  const parsed = (value ?? {}) as Partial<WorkspaceBillingUpgradePlan> & {
    amountKobo?: unknown;
    code?: unknown;
    interval?: unknown;
  };
  const name = normalizeShortText(parsed.name);
  const legacyInterval = normalizeBillingInterval(parsed.interval, "monthly");
  const legacyAmountKobo = normalizeNonNegativeInteger(parsed.amountKobo, 0);
  const legacyPlanCode = normalizeShortText(parsed.code);
  const monthlyAmountKobo = normalizeNonNegativeInteger(
    parsed.monthlyAmountKobo,
    legacyInterval === "monthly" ? legacyAmountKobo : 0
  );
  const monthlyPlanCode = normalizeShortText(
    parsed.monthlyPlanCode,
    legacyInterval === "monthly" ? legacyPlanCode : ""
  );
  const yearlyAmountKobo = normalizeNonNegativeInteger(
    parsed.yearlyAmountKobo,
    legacyInterval === "yearly" ? legacyAmountKobo : 0
  );
  const yearlyPlanCode = normalizeShortText(
    parsed.yearlyPlanCode,
    legacyInterval === "yearly" ? legacyPlanCode : ""
  );

  if (!name && monthlyAmountKobo <= 0 && yearlyAmountKobo <= 0) {
    return null;
  }

  const keySource =
    normalizeShortText(parsed.key) ||
    normalizeShortText(parsed.code) ||
    name ||
    `upgrade-${index + 1}`;

  return {
    key: buildWorkspaceBillingUpgradePlanKey(keySource, index),
    name,
    monthlyAmountKobo,
    monthlyPlanCode,
    yearlyAmountKobo,
    yearlyPlanCode,
  };
}

function getLowestWorkspaceBillingOptionAmount(options: WorkspaceBillingIntervalOption[]) {
  return options.reduce((lowest, option) => Math.min(lowest, option.amountKobo), Number.POSITIVE_INFINITY);
}

function buildWorkspaceBillingUpgradePlanKey(source: string, index: number) {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `${slug}-${index + 1}` : `upgrade-${index + 1}`;
}

function normalizeWorkspaceBillingPlanKey(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeShortText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function normalizeNullableIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
