import {
  PPAP_QUESTIONS,
  PPAP_TENDENCIES,
  type PpapAssessmentScores,
  type PpapBandLabel,
  type PpapCandidateIntake,
  type PpapQuestion,
  type PpapQuestionScore,
  type PpapTendencyScore,
} from "@/types/ppap";

export const PPAP_PAGE_SIZE = 6;

export function buildDefaultPpapResponses() {
  return PPAP_QUESTIONS.reduce<Record<number, number>>((accumulator, question) => {
    accumulator[question.id] = 3;
    return accumulator;
  }, {});
}

export function buildPpapQuestionPages() {
  const pages: PpapQuestion[][] = [];

  for (let index = 0; index < PPAP_QUESTIONS.length; index += PPAP_PAGE_SIZE) {
    pages.push(PPAP_QUESTIONS.slice(index, index + PPAP_PAGE_SIZE));
  }

  return pages;
}

export function normalizePpapResponseValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }

  return clamp(Math.round(value), 1, 5);
}

export function scorePpapAssessment(responses: Record<number, number>): PpapAssessmentScores {
  const questionScores = PPAP_QUESTIONS.map((question) => {
    const response = normalizePpapResponseValue(responses[question.id]);
    const adjustedResponse = question.reverseScored ? 6 - response : response;

    return {
      id: question.id,
      prompt: question.prompt,
      tendencyId: question.tendencyId,
      response,
      adjustedResponse,
      reverseScored: question.reverseScored,
    } satisfies PpapQuestionScore;
  });

  const tendencyScores = buildTendencyScores(questionScores);
  const overallScore = roundNumber(
    tendencyScores.reduce((sum, score) => sum + score.percentage, 0) / tendencyScores.length
  );
  const band = classifyPpapBand(overallScore);
  const socialDesirabilityFlag = detectUniformResponsePattern(questionScores);

  return {
    tendencyScores,
    overallScore,
    band,
    socialDesirabilityFlag,
    questionScores,
  };
}

export function buildPpapTendencyResponsePattern(questionScores: PpapQuestionScore[]) {
  return Object.values(PPAP_TENDENCIES).map((tendency) => {
    const items = questionScores.filter((item) => item.tendencyId === tendency.id);
    const highItems = items.filter((item) => item.response >= 4).map((item) => item.id);
    const lowItems = items.filter((item) => item.response <= 2).map((item) => item.id);

    return {
      tendencyId: tendency.id,
      tendencyLabel: tendency.label,
      highItems,
      lowItems,
      reverseScoredItems: items
        .filter((item) => item.reverseScored)
        .map((item) => item.id),
      questionIds: items.map((item) => item.id),
    };
  });
}

export function buildPpapLocalNarratives({
  intake,
  scores,
}: {
  intake: PpapCandidateIntake;
  scores: PpapAssessmentScores;
}) {
  const tendencyById = new Map(scores.tendencyScores.map((item) => [item.id, item]));
  const goodNatured = tendencyById.get("good_natured");
  const growthMindset = tendencyById.get("growth_mindset");
  const energy = tendencyById.get("energy_adaptability");
  const team = tendencyById.get("team_player");
  const ownership = tendencyById.get("ownership_accountability");

  const adminReport = [
    `${intake.fullName || "The candidate"} is showing a ${describeBand(scores.band).toLowerCase()} overall tendency pattern for ${intake.roleApplied || "the role"}.`,
    describeTendencyParagraph("Good-Natured", goodNatured, "warmth, respect, and calm handling of tension"),
    describeTendencyParagraph("Growth Mindset", growthMindset, "feedback receptivity and self-awareness"),
    describeTendencyParagraph("Energy & Adaptability", energy, "energy, positivity, and comfort with change"),
    describeTendencyParagraph("Team Player", team, "shared ownership, communication, and collaboration"),
    describeTendencyParagraph("Ownership & Accountability", ownership, "follow-through, responsibility, and clean ownership"),
    buildCrossPatternSummary(scores),
  ]
    .filter(Boolean)
    .join("\n\n");

  const candidateSummary = buildCandidateSummary(scores, intake.fullName);

  return {
    adminReport,
    candidateSummary,
  };
}

export function classifyPpapBand(score: number): PpapBandLabel {
  if (score >= 85) {
    return "STRONG SIGNAL";
  }

  if (score >= 70) {
    return "POSITIVE SIGNAL";
  }

  if (score >= 55) {
    return "MIXED SIGNAL";
  }

  return "WEAK SIGNAL";
}

export function describeBand(band: PpapBandLabel) {
  return band.replace(" SIGNAL", "").toLowerCase();
}

function buildTendencyScores(questionScores: PpapQuestionScore[]) {
  return Object.values(PPAP_TENDENCIES).map((tendency) => {
    const items = questionScores.filter((item) => item.tendencyId === tendency.id);
    const adjustedSum = items.reduce((sum, item) => sum + item.adjustedResponse, 0);
    const percentage = roundNumber((adjustedSum / 30) * 100);

    return {
      id: tendency.id,
      label: tendency.label,
      percentage,
      adjustedSum,
      band: classifyPpapBand(percentage),
      questionIds: items.map((item) => item.id),
    } satisfies PpapTendencyScore;
  });
}

function detectUniformResponsePattern(questionScores: PpapQuestionScore[]) {
  const responses = questionScores.map((item) => item.response);
  return responses.every((value) => value === 1) || responses.every((value) => value === 5);
}

function buildCandidateSummary(scores: PpapAssessmentScores, candidateName: string) {
  const tendencyMap = new Map(scores.tendencyScores.map((item) => [item.id, item]));
  const goodNatured = tendencyMap.get("good_natured");
  const growthMindset = tendencyMap.get("growth_mindset");
  const team = tendencyMap.get("team_player");
  const ownership = tendencyMap.get("ownership_accountability");
  const subject = candidateName || "You";
  const caution = scores.socialDesirabilityFlag
    ? " Note: Uniform response pattern detected. Results should be interpreted with caution."
    : "";

  return [
    `Based on your responses, ${subject.toLowerCase()} appears to bring ${summarizeBand(goodNatured)}.`,
    `You also seem to show ${summarizeBand(growthMindset)}.`,
    `In team settings, the pattern suggests ${summarizeBand(team)}.`,
    `On ownership and accountability, the responses point to ${summarizeBand(ownership)}.`,
    `Overall, your results sit in the ${scores.band.toLowerCase()} range.${caution}`,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCrossPatternSummary(scores: PpapAssessmentScores) {
  const sorted = [...scores.tendencyScores].sort((left, right) => right.percentage - left.percentage);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  if (!strongest || !weakest) {
    return "";
  }

  if (strongest.id === weakest.id) {
    return "The response pattern is fairly even across the five tendencies, so the main story here is balance rather than a sharp split.";
  }

  return `The clearest signal appears in ${strongest.label}, while ${weakest.label} is the main area to probe further. That combination can matter a lot in hiring because a candidate may sound strong in one area but behave differently when stress, feedback, or teamwork pressure shows up.`;
}

function summarizeBand(score: PpapTendencyScore | undefined) {
  if (!score) {
    return "an even response pattern across the assessment";
  }

  const label =
    score.band === "STRONG SIGNAL"
      ? "a strong signal"
      : score.band === "POSITIVE SIGNAL"
        ? "a positive signal"
        : score.band === "MIXED SIGNAL"
          ? "a mixed signal"
          : "a weak signal";

  return `${label} in ${score.label.toLowerCase()}`;
}

function describeTendencyParagraph(
  label: string,
  score: PpapTendencyScore | undefined,
  focus: string
) {
  if (!score) {
    return "";
  }

  return `${label} shows ${summarizeBand(score)}. In behaviour terms, that usually points to ${focus}. The main follow-up question is whether this pattern holds under pressure, in conflict, and when the candidate is tired or challenged.`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundNumber(value: number) {
  return Math.round(value);
}
