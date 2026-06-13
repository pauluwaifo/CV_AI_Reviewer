export type PersonalityScaleCategory = "bright" | "derailer" | "values";

export type BrightScaleId =
  | "adjustment"
  | "ambition"
  | "sociability"
  | "interpersonalSensitivity"
  | "prudence"
  | "curiosity";

export type DerailerScaleId =
  | "excitable"
  | "skeptical"
  | "cautious"
  | "reserved"
  | "bold"
  | "mischievous";

export type ValueScaleId =
  | "recognition"
  | "power"
  | "affiliation"
  | "commerce"
  | "security"
  | "science";

export type PersonalityScaleId = BrightScaleId | DerailerScaleId | ValueScaleId;

export type PersonalityScaleDefinition = {
  id: PersonalityScaleId;
  category: PersonalityScaleCategory;
  label: string;
  prompt: string;
  detail: string;
  lowLabel: string;
  highLabel: string;
};

export type PersonalityScaleSection = {
  id: PersonalityScaleCategory;
  label: string;
  description: string;
  scales: PersonalityScaleDefinition[];
};

export type PersonalityAssessmentResponses = Record<PersonalityScaleId, number>;

export type PersonalityTargetOverrides = {
  bright?: Partial<Record<BrightScaleId, number>>;
  derailer?: Partial<Record<DerailerScaleId, number>>;
  values?: Partial<Record<ValueScaleId, number>>;
};

export type PersonalityRoleId =
  | "general"
  | "customer_success"
  | "sales"
  | "operations"
  | "engineering"
  | "leadership";

export type PersonalityRoleProfile = {
  id: PersonalityRoleId;
  label: string;
  summary: string;
  emphasis: string[];
  targetOverrides: PersonalityTargetOverrides;
};

export type PersonalityAssessmentDraft = {
  candidateName: string;
  roleId: PersonalityRoleId;
  notes: string;
  responses: PersonalityAssessmentResponses;
};

export type PersonalityScaleScore = PersonalityScaleDefinition & {
  response: number;
  score: number;
  target: number;
  gap: number;
};

export type PersonalityAssessmentSnapshot = {
  candidateName: string;
  role: PersonalityRoleProfile;
  responses: PersonalityAssessmentResponses;
  scores: PersonalityScaleScore[];
  brightAverage: number;
  derailerAverage: number;
  valuesAverage: number;
  fitScore: number;
  strengths: PersonalityScaleScore[];
  watchouts: PersonalityScaleScore[];
  motivators: PersonalityScaleScore[];
  summary: string;
  prompts: string[];
  notes: string;
};

const DEFAULT_NEUTRAL_RESPONSE = 3;

const PERSONALITY_SCALE_SECTIONS_DATA: PersonalityScaleSection[] = [
  {
    id: "bright",
    label: "Bright side",
    description:
      "How someone typically shows up when work is going well and the environment feels predictable.",
    scales: [
      {
        id: "adjustment",
        category: "bright",
        label: "Adjustment",
        prompt: "I stay composed and effective when priorities change at the last minute.",
        detail: "Measures steadiness, recovery, and composure under change.",
        lowLabel: "Reactive",
        highLabel: "Steady",
      },
      {
        id: "ambition",
        category: "bright",
        label: "Ambition",
        prompt: "I naturally step up and take ownership when a goal is unclear.",
        detail: "Measures drive, initiative, and willingness to lead.",
        lowLabel: "Waits",
        highLabel: "Leads",
      },
      {
        id: "sociability",
        category: "bright",
        label: "Sociability",
        prompt: "I gain energy from talking with lots of different people.",
        detail: "Measures social energy, visibility, and ease of connection.",
        lowLabel: "Reserved",
        highLabel: "Outgoing",
      },
      {
        id: "interpersonalSensitivity",
        category: "bright",
        label: "Interpersonal Sensitivity",
        prompt: "I usually communicate in a tactful, considerate way.",
        detail: "Measures diplomacy, warmth, and how carefully someone lands a message.",
        lowLabel: "Direct",
        highLabel: "Tactful",
      },
      {
        id: "prudence",
        category: "bright",
        label: "Prudence",
        prompt: "I like clear standards, structure, and careful follow-through.",
        detail: "Measures structure, dependability, and respect for process.",
        lowLabel: "Flexible",
        highLabel: "Disciplined",
      },
      {
        id: "curiosity",
        category: "bright",
        label: "Curiosity",
        prompt: "I enjoy new ideas, unfamiliar problems, and learning by exploration.",
        detail: "Measures openness, learning appetite, and comfort with ambiguity.",
        lowLabel: "Practical",
        highLabel: "Exploratory",
      },
    ],
  },
  {
    id: "derailer",
    label: "Derailers",
    description:
      "What tends to emerge under pressure, when the environment becomes noisy, political, or ambiguous.",
    scales: [
      {
        id: "excitable",
        category: "derailer",
        label: "Excitable",
        prompt: "Under pressure, my mood or confidence can shift quickly.",
        detail: "Signals emotional volatility and stress reactivity.",
        lowLabel: "Steady",
        highLabel: "Volatile",
      },
      {
        id: "skeptical",
        category: "derailer",
        label: "Skeptical",
        prompt: "When stakes are high, I can become suspicious of other people's motives.",
        detail: "Signals defensiveness, distrust, and a habit of reading hidden agendas.",
        lowLabel: "Trusting",
        highLabel: "Guarded",
      },
      {
        id: "cautious",
        category: "derailer",
        label: "Cautious",
        prompt: "I can become slow to act when the risk is unclear.",
        detail: "Signals risk aversion, hesitation, and decision drag.",
        lowLabel: "Decisive",
        highLabel: "Hesitant",
      },
      {
        id: "reserved",
        category: "derailer",
        label: "Reserved",
        prompt: "I may hold back my opinions until I know the room well.",
        detail: "Signals low transparency, social distance, and withholding.",
        lowLabel: "Open",
        highLabel: "Withheld",
      },
      {
        id: "bold",
        category: "derailer",
        label: "Bold",
        prompt: "I can become overly confident or dismiss feedback when I believe I am right.",
        detail: "Signals overconfidence, self-importance, and reduced coachability.",
        lowLabel: "Humble",
        highLabel: "Overconfident",
      },
      {
        id: "mischievous",
        category: "derailer",
        label: "Mischievous",
        prompt: "I sometimes test boundaries or bend rules if they feel inefficient.",
        detail: "Signals rule bending, impulsive risk taking, and boundary testing.",
        lowLabel: "Compliant",
        highLabel: "Boundary-testing",
      },
    ],
  },
  {
    id: "values",
    label: "Values",
    description:
      "What keeps someone engaged, motivated, and willing to stay with the work over time.",
    scales: [
      {
        id: "recognition",
        category: "values",
        label: "Recognition",
        prompt: "I like work that gets noticed and appreciated.",
        detail: "Signals the pull of praise, visibility, and status.",
        lowLabel: "Private",
        highLabel: "Visible",
      },
      {
        id: "power",
        category: "values",
        label: "Power",
        prompt: "I value influence and the ability to shape decisions.",
        detail: "Signals the pull of authority, influence, and control over outcomes.",
        lowLabel: "Collaborative",
        highLabel: "Influential",
      },
      {
        id: "affiliation",
        category: "values",
        label: "Affiliation",
        prompt: "I want to work in an environment where people feel close and supportive.",
        detail: "Signals the pull of belonging, teamwork, and close relationships.",
        lowLabel: "Independent",
        highLabel: "Connected",
      },
      {
        id: "commerce",
        category: "values",
        label: "Commerce",
        prompt: "I am energized by measurable results and financial reward.",
        detail: "Signals the pull of money, reward, and tangible business outcomes.",
        lowLabel: "Purpose-led",
        highLabel: "Results-led",
      },
      {
        id: "security",
        category: "values",
        label: "Security",
        prompt: "I prefer stability, predictability, and low-risk choices.",
        detail: "Signals the pull of certainty, protection, and dependable routines.",
        lowLabel: "Adventurous",
        highLabel: "Stable",
      },
      {
        id: "science",
        category: "values",
        label: "Science",
        prompt: "I am motivated by evidence, logic, and solving problems the right way.",
        detail: "Signals the pull of analysis, learning, and rational problem solving.",
        lowLabel: "Practical",
        highLabel: "Analytical",
      },
    ],
  },
];

const DEFAULT_ROLE_TARGETS: Record<PersonalityScaleCategory, Record<PersonalityScaleId, number>> = {
  bright: {
    adjustment: 55,
    ambition: 55,
    sociability: 55,
    interpersonalSensitivity: 55,
    prudence: 55,
    curiosity: 55,
    excitable: 30,
    skeptical: 30,
    cautious: 30,
    reserved: 30,
    bold: 30,
    mischievous: 30,
    recognition: 55,
    power: 55,
    affiliation: 55,
    commerce: 55,
    security: 55,
    science: 55,
  },
  derailer: {
    adjustment: 55,
    ambition: 55,
    sociability: 55,
    interpersonalSensitivity: 55,
    prudence: 55,
    curiosity: 55,
    excitable: 30,
    skeptical: 30,
    cautious: 30,
    reserved: 30,
    bold: 30,
    mischievous: 30,
    recognition: 55,
    power: 55,
    affiliation: 55,
    commerce: 55,
    security: 55,
    science: 55,
  },
  values: {
    adjustment: 55,
    ambition: 55,
    sociability: 55,
    interpersonalSensitivity: 55,
    prudence: 55,
    curiosity: 55,
    excitable: 30,
    skeptical: 30,
    cautious: 30,
    reserved: 30,
    bold: 30,
    mischievous: 30,
    recognition: 55,
    power: 55,
    affiliation: 55,
    commerce: 55,
    security: 55,
    science: 55,
  },
};

export const PERSONALITY_ROLE_PROFILES: Record<PersonalityRoleId, PersonalityRoleProfile> = {
  general: {
    id: "general",
    label: "General hiring lens",
    summary: "Balanced, versatile, and suited to a broad range of roles.",
    emphasis: ["Balanced", "Stable", "Flexible"],
    targetOverrides: {
      bright: {
        adjustment: 60,
        ambition: 58,
        sociability: 55,
        interpersonalSensitivity: 60,
        prudence: 60,
        curiosity: 60,
      },
      derailer: {
        excitable: 28,
        skeptical: 30,
        cautious: 30,
        reserved: 32,
        bold: 30,
        mischievous: 25,
      },
      values: {
        recognition: 50,
        power: 48,
        affiliation: 58,
        commerce: 55,
        security: 58,
        science: 55,
      },
    },
  },
  customer_success: {
    id: "customer_success",
    label: "Customer success",
    summary: "People-facing, calm, and tactful with enough structure to keep service reliable.",
    emphasis: ["People-facing", "Tactful", "Calm"],
    targetOverrides: {
      bright: {
        adjustment: 68,
        ambition: 52,
        sociability: 78,
        interpersonalSensitivity: 82,
        prudence: 64,
        curiosity: 58,
      },
      derailer: {
        excitable: 24,
        skeptical: 28,
        cautious: 34,
        reserved: 30,
        bold: 28,
        mischievous: 20,
      },
      values: {
        recognition: 52,
        power: 34,
        affiliation: 82,
        commerce: 46,
        security: 62,
        science: 42,
      },
    },
  },
  sales: {
    id: "sales",
    label: "Sales / growth",
    summary: "Outgoing, ambitious, and motivated by visible wins and influence.",
    emphasis: ["Outgoing", "Competitive", "Influential"],
    targetOverrides: {
      bright: {
        adjustment: 58,
        ambition: 84,
        sociability: 80,
        interpersonalSensitivity: 60,
        prudence: 46,
        curiosity: 56,
      },
      derailer: {
        excitable: 34,
        skeptical: 34,
        cautious: 28,
        reserved: 24,
        bold: 58,
        mischievous: 36,
      },
      values: {
        recognition: 84,
        power: 78,
        affiliation: 58,
        commerce: 86,
        security: 38,
        science: 40,
      },
    },
  },
  operations: {
    id: "operations",
    label: "Operations",
    summary: "Structured, steady, and comfortable with process, planning, and predictable delivery.",
    emphasis: ["Structured", "Steady", "Reliable"],
    targetOverrides: {
      bright: {
        adjustment: 74,
        ambition: 58,
        sociability: 44,
        interpersonalSensitivity: 62,
        prudence: 82,
        curiosity: 60,
      },
      derailer: {
        excitable: 20,
        skeptical: 28,
        cautious: 24,
        reserved: 36,
        bold: 24,
        mischievous: 18,
      },
      values: {
        recognition: 34,
        power: 38,
        affiliation: 50,
        commerce: 56,
        security: 86,
        science: 78,
      },
    },
  },
  engineering: {
    id: "engineering",
    label: "Engineering",
    summary: "Analytical, curious, and disciplined enough to make complex work ship cleanly.",
    emphasis: ["Analytical", "Curious", "Disciplined"],
    targetOverrides: {
      bright: {
        adjustment: 62,
        ambition: 56,
        sociability: 40,
        interpersonalSensitivity: 52,
        prudence: 78,
        curiosity: 90,
      },
      derailer: {
        excitable: 24,
        skeptical: 30,
        cautious: 34,
        reserved: 38,
        bold: 28,
        mischievous: 16,
      },
      values: {
        recognition: 30,
        power: 32,
        affiliation: 38,
        commerce: 54,
        security: 72,
        science: 90,
      },
    },
  },
  leadership: {
    id: "leadership",
    label: "Leadership",
    summary: "Confident, accountable, and able to carry teams through ambiguity and change.",
    emphasis: ["Accountable", "Influential", "Decisive"],
    targetOverrides: {
      bright: {
        adjustment: 72,
        ambition: 86,
        sociability: 68,
        interpersonalSensitivity: 62,
        prudence: 72,
        curiosity: 68,
      },
      derailer: {
        excitable: 26,
        skeptical: 30,
        cautious: 30,
        reserved: 28,
        bold: 58,
        mischievous: 24,
      },
      values: {
        recognition: 72,
        power: 86,
        affiliation: 56,
        commerce: 68,
        security: 56,
        science: 50,
      },
    },
  },
};

export const PERSONALITY_SCALE_SECTIONS = PERSONALITY_SCALE_SECTIONS_DATA;

const INTERVIEW_PROMPTS: Record<PersonalityScaleId, string> = {
  adjustment: "Tell me about a time the plan changed quickly and you still stayed effective.",
  ambition: "What kind of opportunity makes you naturally step forward and lead?",
  sociability: "How do you keep relationships strong when your work is highly independent?",
  interpersonalSensitivity:
    "How do you give direct feedback without losing trust or making the conversation tense?",
  prudence: "How do you balance speed with process and quality control?",
  curiosity: "What kind of problems make you want to dig deeper instead of settling for the first answer?",
  excitable: "What do you do when pressure starts affecting your patience or tone?",
  skeptical: "How do you verify assumptions without creating unnecessary friction?",
  cautious: "Tell me about a decision you had to make before you had all the information.",
  reserved: "How do you keep teammates informed when you are heads-down on a problem?",
  bold: "What feedback have you received about confidence or overconfidence?",
  mischievous: "Tell me about a time you had to follow a rule you thought was inefficient.",
  recognition: "How much does visible acknowledgement matter to your motivation?",
  power: "How do you like to influence decisions without creating unnecessary tension?",
  affiliation: "What kind of team culture helps you do your best work?",
  commerce: "What role does money or measurable reward play in the way you choose work?",
  security: "How do you respond when a role requires frequent ambiguity or change?",
  science: "How do you decide whether a solution is good enough to ship?",
};

export function buildDefaultPersonalityAssessmentDraft(): PersonalityAssessmentDraft {
  return {
    candidateName: "",
    roleId: "general",
    notes: "",
    responses: buildNeutralResponses(),
  };
}

export function buildPersonalityAssessmentSampleDraft(
  roleId: PersonalityRoleId
): PersonalityAssessmentDraft {
  return {
    candidateName: `${PERSONALITY_ROLE_PROFILES[roleId].label} sample`,
    roleId,
    notes: "Illustrative profile loaded from the selected role lens.",
    responses: buildSampleResponses(roleId),
  };
}

export function parsePersonalityAssessmentDraft(value: unknown): PersonalityAssessmentDraft {
  const parsed = (value ?? {}) as Partial<PersonalityAssessmentDraft> & {
    responses?: unknown;
  };
  const draft = buildDefaultPersonalityAssessmentDraft();
  const responseEntries =
    parsed.responses && typeof parsed.responses === "object"
      ? (parsed.responses as Partial<Record<PersonalityScaleId, unknown>>)
      : {};

  return {
    candidateName: normalizeShortText(parsed.candidateName, draft.candidateName),
    roleId: isPersonalityRoleId(parsed.roleId) ? parsed.roleId : draft.roleId,
    notes: normalizeLongText(parsed.notes, draft.notes),
    responses: PERSONALITY_SCALE_SECTIONS_DATA.flatMap((section) => section.scales).reduce(
      (accumulator, scale) => {
        accumulator[scale.id] = normalizeResponse(
          responseEntries[scale.id],
          draft.responses[scale.id]
        );
        return accumulator;
      },
      { ...draft.responses }
    ),
  };
}

export function buildPersonalityAssessmentDraftFromSnapshot(
  snapshot:
    | Partial<PersonalityAssessmentSnapshot>
    | PersonalityAssessmentSnapshot
    | null
    | undefined
): PersonalityAssessmentDraft {
  const draft = buildDefaultPersonalityAssessmentDraft();

  if (!snapshot) {
    return draft;
  }

  const parsed = snapshot as Partial<PersonalityAssessmentSnapshot> & {
    responses?: unknown;
    role?: unknown;
  };
  const responseEntries =
    parsed.responses && typeof parsed.responses === "object"
      ? (parsed.responses as Partial<Record<PersonalityScaleId, unknown>>)
      : {};
  const roleId =
    typeof parsed.role === "object" &&
    parsed.role !== null &&
    isPersonalityRoleId((parsed.role as Partial<PersonalityRoleProfile>).id)
      ? ((parsed.role as Partial<PersonalityRoleProfile>).id as PersonalityRoleId)
      : draft.roleId;

  return {
    candidateName: normalizeShortText(parsed.candidateName, draft.candidateName),
    roleId,
    notes: normalizeLongText(parsed.notes, draft.notes),
    responses: PERSONALITY_SCALE_SECTIONS_DATA.flatMap((section) => section.scales).reduce(
      (accumulator, scale) => {
        accumulator[scale.id] = normalizeResponse(
          responseEntries[scale.id],
          draft.responses[scale.id]
        );
        return accumulator;
      },
      { ...draft.responses }
    ),
  };
}

export function normalizePersonalityAssessmentSnapshot(
  value: unknown
): PersonalityAssessmentSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<PersonalityAssessmentSnapshot> & {
    responses?: unknown;
    role?: unknown;
  };
  const hasMeaningfulContent =
    (typeof parsed.candidateName === "string" && parsed.candidateName.trim().length > 0) ||
    (typeof parsed.notes === "string" && parsed.notes.trim().length > 0) ||
    Boolean(parsed.responses) ||
    Boolean(parsed.role);

  if (!hasMeaningfulContent) {
    return null;
  }

  return scorePersonalityAssessment(buildPersonalityAssessmentDraftFromSnapshot(parsed));
}

export function scorePersonalityAssessment(
  draft: PersonalityAssessmentDraft
): PersonalityAssessmentSnapshot {
  const role = PERSONALITY_ROLE_PROFILES[draft.roleId] ?? PERSONALITY_ROLE_PROFILES.general;
  const targets = getMergedRoleTargets(role.targetOverrides);
  const scores = PERSONALITY_SCALE_SECTIONS_DATA.flatMap((section) =>
    section.scales.map((scale) => {
      const response = normalizeResponse(draft.responses[scale.id], DEFAULT_NEUTRAL_RESPONSE);
      const score = responseToScore(response);
      const target = targets[scale.category][scale.id];
      const gap = Math.abs(score - target);

      return {
        ...scale,
        response,
        score,
        target,
        gap,
      };
    })
  );
  const brightScores = scores.filter((score) => score.category === "bright");
  const derailerScores = scores.filter((score) => score.category === "derailer");
  const valuesScores = scores.filter((score) => score.category === "values");
  const brightAverage = roundAverage(brightScores.map((score) => score.score));
  const derailerAverage = roundAverage(derailerScores.map((score) => score.score));
  const valuesAverage = roundAverage(valuesScores.map((score) => score.score));
  const brightFit = roundAverage(
    brightScores.map((score) => 100 - Math.abs(score.score - score.target))
  );
  const derailerFit = roundAverage(
    derailerScores.map((score) => 100 - Math.abs(score.score - score.target))
  );
  const valuesFit = roundAverage(
    valuesScores.map((score) => 100 - Math.abs(score.score - score.target))
  );
  const fitScore = Math.max(
    0,
    Math.min(100, Math.round(brightFit * 0.45 + derailerFit * 0.25 + valuesFit * 0.3))
  );
  const strengths = getTopScores(brightScores, 3, 50);
  const watchouts = getTopScores(derailerScores, 3, 45);
  const motivators = getTopScores(valuesScores, 3, 50);
  const prompts = buildPromptList(scores, role.id);
  const candidateName = normalizeShortText(draft.candidateName, "This profile");

  return {
    candidateName,
    role,
    responses: draft.responses,
    scores,
    brightAverage,
    derailerAverage,
    valuesAverage,
    fitScore,
    strengths,
    watchouts,
    motivators,
    summary: buildSnapshotSummary({
      candidateName,
      role,
      fitScore,
      strengths,
      watchouts,
      motivators,
    }),
    prompts,
    notes: normalizeLongText(draft.notes),
  };
}

export function buildPersonalityAssessmentSummary(snapshot: PersonalityAssessmentSnapshot) {
  const candidate = snapshot.candidateName || "This profile";
  const lines = [
    `${candidate} | ${snapshot.role.label}`,
    `Overall fit: ${snapshot.fitScore}/100 (${getFitTierLabel(snapshot.fitScore)})`,
    `Bright side average: ${snapshot.brightAverage}/100`,
    `Derailer risk average: ${snapshot.derailerAverage}/100`,
    `Values average: ${snapshot.valuesAverage}/100`,
    `Strengths: ${formatNameList(snapshot.strengths.map((score) => score.label)) || "None yet"}`,
    `Watch-outs: ${formatNameList(snapshot.watchouts.map((score) => score.label)) || "None yet"}`,
    `Motivators: ${formatNameList(snapshot.motivators.map((score) => score.label)) || "None yet"}`,
    "",
    snapshot.summary,
    "",
    "Suggested follow-up prompts:",
    ...snapshot.prompts.map((prompt) => `- ${prompt}`),
  ];

  if (snapshot.notes) {
    lines.push("", `Recruiter notes: ${snapshot.notes}`);
  }

  return lines.join("\n").trim();
}

export function getPersonalityRoleProfile(roleId: PersonalityRoleId) {
  return PERSONALITY_ROLE_PROFILES[roleId] ?? PERSONALITY_ROLE_PROFILES.general;
}

export function getPersonalityScoreBand(category: PersonalityScaleCategory, score: number) {
  if (category === "derailer") {
    if (score >= 70) {
      return "Elevated";
    }

    if (score >= 40) {
      return "Watch";
    }

    return "Low";
  }

  if (score >= 70) {
    return "Strong";
  }

  if (score >= 40) {
    return "Balanced";
  }

  return "Low";
}

export function getPersonalityFitTier(fitScore: number) {
  if (fitScore >= 85) {
    return "Excellent";
  }

  if (fitScore >= 70) {
    return "Strong";
  }

  if (fitScore >= 55) {
    return "Moderate";
  }

  return "Stretch";
}

function buildNeutralResponses() {
  return PERSONALITY_SCALE_SECTIONS_DATA.flatMap((section) => section.scales).reduce(
    (accumulator, scale) => {
      accumulator[scale.id] = DEFAULT_NEUTRAL_RESPONSE;
      return accumulator;
    },
    {} as PersonalityAssessmentResponses
  );
}

function buildSampleResponses(roleId: PersonalityRoleId) {
  const targets = getMergedRoleTargets(PERSONALITY_ROLE_PROFILES[roleId].targetOverrides);

  return PERSONALITY_SCALE_SECTIONS_DATA.flatMap((section) => section.scales).reduce(
    (accumulator, scale) => {
      accumulator[scale.id] = scoreToResponse(targets[scale.category][scale.id]);
      return accumulator;
    },
    {} as PersonalityAssessmentResponses
  );
}

function getMergedRoleTargets(targetOverrides: PersonalityTargetOverrides) {
  return {
    bright: {
      ...pickDefaults("bright"),
      ...(targetOverrides.bright ?? {}),
    },
    derailer: {
      ...pickDefaults("derailer"),
      ...(targetOverrides.derailer ?? {}),
    },
    values: {
      ...pickDefaults("values"),
      ...(targetOverrides.values ?? {}),
    },
  } as Record<PersonalityScaleCategory, Record<PersonalityScaleId, number>>;
}

function pickDefaults(category: PersonalityScaleCategory) {
  return { ...DEFAULT_ROLE_TARGETS[category] };
}

function buildSnapshotSummary({
  candidateName,
  role,
  fitScore,
  strengths,
  watchouts,
  motivators,
}: {
  candidateName: string;
  role: PersonalityRoleProfile;
  fitScore: number;
  strengths: PersonalityScaleScore[];
  watchouts: PersonalityScaleScore[];
  motivators: PersonalityScaleScore[];
}) {
  const subject = candidateName || "This profile";
  const strengthText = formatNameList(strengths.map((score) => score.label));
  const watchoutText = formatNameList(watchouts.map((score) => score.label));
  const motivatorText = formatNameList(motivators.map((score) => score.label));

  if (fitScore >= 85) {
    return `${subject} looks like an excellent fit for the ${role.label} lens. The strongest signals are ${strengthText || "not yet populated"}, while the main follow-up areas are ${watchoutText || "not yet populated"}. The profile appears most energized by ${motivatorText || "not yet populated"}.`;
  }

  if (fitScore >= 70) {
    return `${subject} looks like a strong fit for the ${role.label} lens with a few areas to verify in interview. The clearest strengths are ${strengthText || "not yet populated"}, while the main watch-outs are ${watchoutText || "not yet populated"}.`;
  }

  if (fitScore >= 55) {
    return `${subject} is a mixed-to-moderate fit for the ${role.label} lens. The profile has useful strengths in ${strengthText || "not yet populated"} but will need follow-up on ${watchoutText || "not yet populated"} before relying on it for a final decision.`;
  }

  return `${subject} is a stretch for the ${role.label} lens. The profile shows some strengths in ${strengthText || "not yet populated"}, but the main risks around ${watchoutText || "not yet populated"} deserve a deeper conversation.`;
}

function buildPromptList(scores: PersonalityScaleScore[], roleId: PersonalityRoleId) {
  const brightScores = scores.filter((score) => score.category === "bright");
  const derailerScores = scores.filter((score) => score.category === "derailer");
  const valuesScores = scores.filter((score) => score.category === "values");
  const selectedIds: PersonalityScaleId[] = [
    ...derailerScores
      .filter((score) => score.score >= 40)
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .map((score) => score.id),
    ...brightScores
      .sort((left, right) => left.score - right.score)
      .slice(0, 1)
      .map((score) => score.id),
    ...valuesScores
      .sort((left, right) => left.score - right.score)
      .slice(0, 1)
      .map((score) => score.id),
  ];
  const uniqueSelectedIds: PersonalityScaleId[] = [...new Set(selectedIds)];

  if (uniqueSelectedIds.length === 0) {
    const fallback: PersonalityScaleId =
      roleId === "sales" ? "ambition" : roleId === "engineering" ? "science" : "prudence";
    uniqueSelectedIds.push(fallback);
  }

  return uniqueSelectedIds.slice(0, 3).map((id) => INTERVIEW_PROMPTS[id]);
}

function getTopScores(
  scores: PersonalityScaleScore[],
  count: number,
  threshold: number
) {
  return [...scores]
    .sort((left, right) => right.score - left.score)
    .filter((score) => score.score >= threshold)
    .slice(0, count);
}

function roundAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function responseToScore(response: number) {
  return clamp(Math.round(((response - 1) / 4) * 100));
}

function scoreToResponse(score: number) {
  return clamp(Math.floor((score + 12.5) / 25) + 1, 1, 5);
}

function normalizeResponse(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return clamp(fallback, 1, 5);
  }

  return clamp(Math.round(value), 1, 5);
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeShortText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function normalizeLongText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function isPersonalityRoleId(value: unknown): value is PersonalityRoleId {
  return typeof value === "string" && value in PERSONALITY_ROLE_PROFILES;
}

function formatNameList(values: string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function getFitTierLabel(fitScore: number) {
  return getPersonalityFitTier(fitScore);
}
