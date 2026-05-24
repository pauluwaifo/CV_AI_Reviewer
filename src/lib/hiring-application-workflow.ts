import {
  evaluateHiringApplicationFilter,
  normalizeHiringFormScreeningPolicy,
} from "@/lib/hiring-screening-policy";
import type { AnalysisResponse, RoleSetup } from "@/types/document-intelligence";
import type {
  HiringApplicationRecord,
  HiringApplicationStage,
  HiringApplicationWorkflow,
  HiringFormScreeningPolicy,
  HiringInterviewScorecard,
  HiringInterviewScorecardCriterion,
  HiringInterviewScorecardRecommendation,
} from "@/types/hiring-funnel";

export const HIRING_APPLICATION_STAGE_OPTIONS: Array<{
  description: string;
  label: string;
  value: HiringApplicationStage;
}> = [
  { value: "new", label: "New", description: "Fresh submission waiting for triage." },
  { value: "reviewing", label: "Reviewing", description: "Recruiter is actively assessing fit." },
  { value: "shortlisted", label: "Shortlisted", description: "Strong match worth moving forward." },
  { value: "interview", label: "Interview", description: "Candidate is in interview flow." },
  { value: "offer", label: "Offer", description: "Offer or close-out prep is underway." },
  { value: "hired", label: "Hired", description: "Candidate has been accepted." },
  { value: "on_hold", label: "On hold", description: "Paused pending more evidence or timing." },
  { value: "rejected", label: "Rejected", description: "Candidate is no longer progressing." },
] as const;

export const HIRING_INTERVIEW_RECOMMENDATION_OPTIONS: Array<{
  description: string;
  label: string;
  value: HiringInterviewScorecardRecommendation;
}> = [
  { value: "pending", label: "Pending", description: "Scorecard is still being filled." },
  { value: "advance", label: "Advance", description: "The interview supports moving forward confidently." },
  { value: "lean_advance", label: "Lean advance", description: "Move forward, but verify a few open questions." },
  { value: "hold", label: "Hold", description: "Pause until the team gets more evidence." },
  { value: "lean_reject", label: "Lean reject", description: "There are material concerns against the role benchmark." },
  { value: "reject", label: "Reject", description: "The interview does not support moving ahead." },
] as const;

export function buildInitialHiringApplicationWorkflow({
  analysis,
  screeningPolicy,
  roleSetup,
}: {
  analysis: AnalysisResponse;
  screeningPolicy: HiringFormScreeningPolicy | null | undefined;
  roleSetup?: RoleSetup | null;
}): HiringApplicationWorkflow {
  const interviewKit = buildHiringInterviewKit({ analysis, roleSetup });
  const interviewScorecard = buildInitialHiringInterviewScorecard({
    analysis,
    roleSetup,
  });
  const normalized = normalizeHiringApplicationWorkflow(
    {
      interviewKit,
      interviewScorecard,
    },
    null
  );
  const filterResult = evaluateHiringApplicationFilter(
    { analysis } as unknown as HiringApplicationRecord,
    normalizeHiringFormScreeningPolicy(screeningPolicy ?? null)
  );
  const decision = analysis.result.recommendation.decision.toLowerCase();
  const score = analysis.result.score.value;

  if (filterResult.autoFiltered) {
    return pushWorkflowAutomationLog(
      {
        ...normalized,
        automationSummary: `Auto-held because role match fell below ${filterResult.roleMatchScore}/100.`,
        nextStep: "Manual audit for low role match",
        stage: "on_hold",
      },
      `Auto-held because role match fell below ${filterResult.roleMatchScore}/100.`
    );
  }

  if (decision.includes("reject") || score <= 35) {
    return pushWorkflowAutomationLog(
      {
        ...normalized,
        automationSummary: "Auto-routed to rejected based on score and recommendation.",
        nextStep: "Review and send a rejection email",
        stage: "rejected",
      },
      "Auto-routed to rejected based on score and recommendation."
    );
  }

  if (decision.includes("shortlist") || score >= 80) {
    return pushWorkflowAutomationLog(
      {
        ...normalized,
        automationSummary: "Auto-routed to shortlisted based on strong fit signals.",
        nextStep: "Schedule recruiter screen",
        stage: "shortlisted",
      },
      "Auto-routed to shortlisted based on strong fit signals."
    );
  }

  return pushWorkflowAutomationLog(
    {
      ...normalized,
      automationSummary: "Auto-routed to reviewing so a recruiter can assess the profile.",
      nextStep: "Open candidate review",
      stage: "reviewing",
    },
    "Auto-routed to reviewing so a recruiter can assess the profile."
  );
}

export function applyHiringApplicationWorkflowAutomations({
  current,
  next,
}: {
  current: HiringApplicationWorkflow;
  next: HiringApplicationWorkflow;
}) {
  const automationNotes: string[] = [];
  const output: HiringApplicationWorkflow = {
    ...next,
    interviewScorecard: normalizeHiringInterviewScorecard(
      next.interviewScorecard,
      current.interviewScorecard
    ),
    interviewKit: normalizeStringList(next.interviewKit, current.interviewKit),
  };
  const currentNextStep = current.nextStep.trim();
  const nextNextStep = output.nextStep.trim();

  if (
    output.interviewDate &&
    output.interviewDate !== current.interviewDate &&
    output.stage !== "interview"
  ) {
    output.stage = "interview";
    automationNotes.push("Moved the candidate into Interview after an interview date was added.");
  }

  const stageChanged = current.stage !== output.stage;
  const stageDefault = getDefaultHiringApplicationNextStep(output.stage);

  if (
    (!output.interviewPlan.trim() || output.interviewPlan.trim() === current.interviewPlan.trim()) &&
    output.stage === "interview" &&
    output.interviewKit.length > 0
  ) {
    output.interviewPlan = output.interviewKit.map((item) => `- ${item}`).join("\n");
    automationNotes.push("Loaded the suggested interview kit into the interview plan.");
  }

  if (
    output.stage !== "new" &&
    (!nextNextStep || (stageChanged && nextNextStep === currentNextStep))
  ) {
    output.nextStep = stageDefault;
    automationNotes.push(`Updated the next step for the ${describeHiringApplicationStage(output.stage)} stage.`);
  }

  const completedScorecard = finalizeHiringInterviewScorecard(output.interviewScorecard);
  if (
    completedScorecard.completedAt &&
    completedScorecard.completedAt !== current.interviewScorecard.completedAt
  ) {
    automationNotes.push("Marked the interview scorecard as complete.");
  }
  output.interviewScorecard = completedScorecard;

  if (
    output.stage === "interview" &&
    completedScorecard.completedAt &&
    shouldPromoteInterviewNextStep(output.nextStep, current.nextStep)
  ) {
    const recommendationNextStep = getInterviewRecommendationNextStep(
      completedScorecard.recommendation
    );

    if (recommendationNextStep) {
      output.nextStep = recommendationNextStep;
      automationNotes.push("Updated the next step from the interview scorecard recommendation.");
    }
  }

  if (automationNotes.length === 0) {
    return output;
  }

  const dedupedLog = uniqueStringList([
    ...automationNotes,
    ...output.automationLog,
    ...current.automationLog,
  ]).slice(0, 8);

  return {
    ...output,
    automationSummary: automationNotes[0],
    automationLog: dedupedLog,
  };
}

export function describeHiringApplicationStage(stage: HiringApplicationStage) {
  return (
    HIRING_APPLICATION_STAGE_OPTIONS.find((option) => option.value === stage)?.label ??
    "New"
  );
}

export function describeHiringInterviewRecommendation(
  recommendation: HiringInterviewScorecardRecommendation
) {
  return (
    HIRING_INTERVIEW_RECOMMENDATION_OPTIONS.find(
      (option) => option.value === recommendation
    )?.label ?? "Pending"
  );
}

export function getDefaultHiringApplicationNextStep(stage: HiringApplicationStage) {
  switch (stage) {
    case "reviewing":
      return "Open candidate review and capture recruiter notes.";
    case "shortlisted":
      return "Schedule recruiter screen or open Candidate Mail.";
    case "interview":
      return "Confirm interview time and complete the scorecard.";
    case "offer":
      return "Align approvers and prepare offer details.";
    case "hired":
      return "Prepare onboarding handoff and close the loop.";
    case "rejected":
      return "Review and send a rejection email.";
    case "on_hold":
      return "Capture the blocker and set a follow-up date.";
    default:
      return "Open candidate review.";
  }
}

export function normalizeHiringApplicationWorkflow(
  value: unknown,
  fallback?: Partial<HiringApplicationWorkflow> | null
): HiringApplicationWorkflow {
  const parsed = (value ?? {}) as Partial<HiringApplicationWorkflow>;
  const updatedAt =
    (typeof parsed.updatedAt === "string" ? normalizeIsoDate(parsed.updatedAt) : null) ||
    fallback?.updatedAt ||
    new Date().toISOString();

  return {
    stage: normalizeHiringApplicationStage(parsed.stage, fallback?.stage ?? "new"),
    ownerEmail: normalizeEmail(parsed.ownerEmail, fallback?.ownerEmail ?? ""),
    recruiterNotes: normalizeLongText(parsed.recruiterNotes, fallback?.recruiterNotes ?? ""),
    nextStep: normalizeShortText(parsed.nextStep, fallback?.nextStep ?? ""),
    tags: normalizeTags(parsed.tags, fallback?.tags ?? []),
    interviewPlan: normalizeLongText(parsed.interviewPlan, fallback?.interviewPlan ?? ""),
    interviewKit: normalizeStringList(parsed.interviewKit, fallback?.interviewKit ?? []),
    interviewDate: normalizeNullableIsoDate(parsed.interviewDate) ?? fallback?.interviewDate ?? null,
    interviewScorecard: normalizeHiringInterviewScorecard(
      parsed.interviewScorecard,
      fallback?.interviewScorecard ?? null
    ),
    lastContactedAt:
      normalizeNullableIsoDate(parsed.lastContactedAt) ?? fallback?.lastContactedAt ?? null,
    automationSummary: normalizeLongText(
      parsed.automationSummary,
      fallback?.automationSummary ?? ""
    ),
    automationLog: normalizeStringList(parsed.automationLog, fallback?.automationLog ?? []),
    updatedAt,
  };
}

export function parseWorkflowTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function buildHiringInterviewKit({
  analysis,
  roleSetup,
}: {
  analysis: AnalysisResponse;
  roleSetup?: RoleSetup | null;
}) {
  const focusItems = (roleSetup?.interviewFocus ?? []).map(
    (item) => `Explore ${trimSentence(item)}.`
  );
  const mustHaveItems = (roleSetup?.mustHaveSkills ?? [])
    .slice(0, 3)
    .map((skill) => `Ask for concrete proof of ${skill}.`);
  const riskItems = analysis.result.redFlags
    .slice(0, 2)
    .map((item) => `Clarify this risk: ${trimSentence(item)}`);
  const questionItems = analysis.result.interviewQuestions
    .slice(0, 2)
    .map((item) => trimSentence(item));

  return uniqueStringList([
    ...focusItems,
    ...mustHaveItems,
    ...riskItems,
    ...questionItems,
  ]).slice(0, 6);
}

function buildInitialHiringInterviewScorecard({
  analysis,
  roleSetup,
}: {
  analysis: AnalysisResponse;
  roleSetup?: RoleSetup | null;
}): HiringInterviewScorecard {
  const criteria = buildInterviewScorecardCriteria({ analysis, roleSetup });

  return {
    recommendation: "pending",
    overallNotes: "",
    completedAt: null,
    updatedAt: new Date().toISOString(),
    criteria,
  };
}

function buildInterviewScorecardCriteria({
  analysis,
  roleSetup,
}: {
  analysis: AnalysisResponse;
  roleSetup?: RoleSetup | null;
}): HiringInterviewScorecardCriterion[] {
  const candidates: Array<{ label: string; prompt: string }> = [];

  roleSetup?.mustHaveSkills.slice(0, 3).forEach((skill) => {
    candidates.push({
      label: skill,
      prompt: `Ask for recent, measurable proof of ${skill}.`,
    });
  });
  roleSetup?.interviewFocus.slice(0, 2).forEach((focus) => {
    candidates.push({
      label: focus,
      prompt: `Use the interview to validate ${focus.toLowerCase()}.`,
    });
  });
  analysis.result.skillAssessments
    .filter((assessment) => assessment.status === "partial" || assessment.status === "unclear")
    .slice(0, 2)
    .forEach((assessment) => {
      candidates.push({
        label: `${assessment.skill} depth`,
        prompt: assessment.evidence || `Probe how deeply the candidate can operate in ${assessment.skill}.`,
      });
    });

  candidates.push(
    {
      label: "Communication",
      prompt: "Look for clear, structured answers with practical ownership examples.",
    },
    {
      label: "Delivery evidence",
      prompt: "Ask for measurable outcomes, scope, and the candidate's direct contribution.",
    }
  );

  return uniqueByLabel(candidates)
    .slice(0, 5)
    .map((item, index) => ({
      id: `criterion-${slugify(item.label) || index + 1}`,
      label: item.label,
      prompt: trimSentence(item.prompt),
      score: null,
      notes: "",
    }));
}

function normalizeHiringInterviewScorecard(
  value: unknown,
  fallback?: HiringInterviewScorecard | null
): HiringInterviewScorecard {
  const parsed = (value ?? {}) as Partial<HiringInterviewScorecard>;
  const criteria = normalizeInterviewCriteria(
    parsed.criteria,
    fallback?.criteria ?? defaultInterviewCriteria()
  );

  return {
    recommendation: normalizeInterviewRecommendation(
      parsed.recommendation,
      fallback?.recommendation ?? "pending"
    ),
    overallNotes: normalizeLongText(parsed.overallNotes, fallback?.overallNotes ?? ""),
    completedAt:
      normalizeNullableIsoDate(parsed.completedAt) ?? fallback?.completedAt ?? null,
    updatedAt:
      (typeof parsed.updatedAt === "string" ? normalizeIsoDate(parsed.updatedAt) : null) ||
      fallback?.updatedAt ||
      new Date().toISOString(),
    criteria,
  };
}

function finalizeHiringInterviewScorecard(scorecard: HiringInterviewScorecard) {
  const scoredCriteria = scorecard.criteria.filter((item) => typeof item.score === "number");
  const allCriteriaScored =
    scorecard.criteria.length > 0 && scoredCriteria.length === scorecard.criteria.length;
  const shouldComplete =
    allCriteriaScored && scorecard.recommendation !== "pending" && Boolean(scorecard.overallNotes.trim());

  return {
    ...scorecard,
    completedAt: shouldComplete
      ? scorecard.completedAt || new Date().toISOString()
      : null,
    updatedAt: new Date().toISOString(),
  };
}

function shouldPromoteInterviewNextStep(nextStep: string, previousStep: string) {
  const normalizedNext = nextStep.trim().toLowerCase();
  const normalizedPrevious = previousStep.trim().toLowerCase();

  return (
    !normalizedNext ||
    normalizedNext === normalizedPrevious ||
    normalizedNext === getDefaultHiringApplicationNextStep("interview").toLowerCase()
  );
}

function getInterviewRecommendationNextStep(
  recommendation: HiringInterviewScorecardRecommendation
) {
  switch (recommendation) {
    case "advance":
    case "lean_advance":
      return "Debrief and decide the next interview or offer step.";
    case "hold":
      return "Capture missing evidence and decide whether to keep the candidate warm.";
    case "lean_reject":
    case "reject":
      return "Review and send a rejection email.";
    default:
      return "";
  }
}

function pushWorkflowAutomationLog(
  workflow: HiringApplicationWorkflow,
  message: string
) {
  return {
    ...workflow,
    automationLog: uniqueStringList([message, ...workflow.automationLog]).slice(0, 8),
  };
}

function normalizeHiringApplicationStage(
  value: unknown,
  fallback: HiringApplicationStage
): HiringApplicationStage {
  return HIRING_APPLICATION_STAGE_OPTIONS.some((option) => option.value === value)
    ? (value as HiringApplicationStage)
    : fallback;
}

function normalizeInterviewRecommendation(
  value: unknown,
  fallback: HiringInterviewScorecardRecommendation
): HiringInterviewScorecardRecommendation {
  return HIRING_INTERVIEW_RECOMMENDATION_OPTIONS.some((option) => option.value === value)
    ? (value as HiringInterviewScorecardRecommendation)
    : fallback;
}

function normalizeInterviewCriteria(
  value: unknown,
  fallback: HiringInterviewScorecardCriterion[]
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = value
    .map((item, index) => {
      const parsed = (item ?? {}) as Partial<HiringInterviewScorecardCriterion>;
      const label = typeof parsed.label === "string" ? parsed.label.trim() : "";

      if (!label) {
        return null;
      }

      const numericScore =
        typeof parsed.score === "number" && parsed.score >= 1 && parsed.score <= 5
          ? Math.round(parsed.score)
          : null;

      return {
        id:
          typeof parsed.id === "string" && parsed.id.trim()
            ? parsed.id.trim()
            : `criterion-${index + 1}`,
        label,
        prompt: normalizeShortText(parsed.prompt, ""),
        score: numericScore,
        notes: normalizeLongText(parsed.notes, ""),
      } satisfies HiringInterviewScorecardCriterion;
    })
    .filter((item): item is HiringInterviewScorecardCriterion => item !== null)
    .slice(0, 8);

  return next.length > 0 ? next : fallback;
}

function defaultInterviewCriteria() {
  return [
    {
      id: "criterion-role-fit",
      label: "Role fit",
      prompt: "Validate role alignment with recent, directly relevant experience.",
      score: null,
      notes: "",
    },
    {
      id: "criterion-communication",
      label: "Communication",
      prompt: "Look for clear thinking, ownership, and calm structured answers.",
      score: null,
      notes: "",
    },
    {
      id: "criterion-delivery",
      label: "Delivery evidence",
      prompt: "Ask for concrete examples with metrics, scope, and outcomes.",
      score: null,
      notes: "",
    },
  ] satisfies HiringInterviewScorecardCriterion[];
}

function normalizeTags(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return uniqueStringList(
    value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 12)
  );
}

function normalizeNullableIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return normalizeIsoDate(value);
}

function normalizeIsoDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeEmail(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().toLowerCase() || fallback;
}

function normalizeShortText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, 240) || fallback;
}

function normalizeLongText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, 4_000) || fallback;
}

function uniqueStringList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueByLabel(values: Array<{ label: string; prompt: string }>) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.label.trim().toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trimSentence(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.]+$/g, "");
}
