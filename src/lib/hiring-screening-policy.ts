import type { RoleCriterionMatch } from "@/types/document-intelligence";
import type {
  HiringApplicationRecord,
  HiringFormScreeningPolicy,
} from "@/types/hiring-funnel";

export const DEFAULT_HIRING_FORM_SCREENING_POLICY: HiringFormScreeningPolicy = {
  autoFilterLowRoleMatch: true,
  minimumRoleMatchScore: 45,
};

export type HiringApplicationFilterResult = {
  autoFiltered: boolean;
  reason: string;
  roleMatchScore: number;
};

export function normalizeHiringFormScreeningPolicy(
  value: unknown
): HiringFormScreeningPolicy {
  const parsed = (value ?? {}) as Partial<HiringFormScreeningPolicy>;

  return {
    autoFilterLowRoleMatch: parsed.autoFilterLowRoleMatch !== false,
    minimumRoleMatchScore: clampNumber(
      parsed.minimumRoleMatchScore,
      0,
      100,
      DEFAULT_HIRING_FORM_SCREENING_POLICY.minimumRoleMatchScore
    ),
  };
}

export function calculateRoleMatchScore(criteria: RoleCriterionMatch[]) {
  if (criteria.length === 0) {
    return 100;
  }

  const weightedTotal = criteria.reduce((sum, item) => {
    if (item.status === "matched") {
      return sum + 100;
    }

    if (item.status === "partial") {
      return sum + 50;
    }

    return sum;
  }, 0);

  return Math.round(weightedTotal / criteria.length);
}

export function evaluateHiringApplicationFilter(
  application: HiringApplicationRecord,
  policy: HiringFormScreeningPolicy
): HiringApplicationFilterResult {
  const normalizedPolicy = normalizeHiringFormScreeningPolicy(policy);
  const roleMatchScore = calculateRoleMatchScore(
    application.analysis.result.roleMatch.criteria
  );

  if (!normalizedPolicy.autoFilterLowRoleMatch) {
    return {
      autoFiltered: false,
      reason: "Automatic low-match filtering is turned off for this form.",
      roleMatchScore,
    };
  }

  if (roleMatchScore >= normalizedPolicy.minimumRoleMatchScore) {
    return {
      autoFiltered: false,
      reason: "This CV met the role-match threshold for the main review queue.",
      roleMatchScore,
    };
  }

  return {
    autoFiltered: true,
    reason: `Role-match score ${roleMatchScore} is below the ${normalizedPolicy.minimumRoleMatchScore} threshold for this form.`,
    roleMatchScore,
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}
