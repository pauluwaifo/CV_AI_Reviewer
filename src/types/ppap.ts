export const ppapTendencyIds = [
  "good_natured",
  "growth_mindset",
  "energy_adaptability",
  "team_player",
  "ownership_accountability",
] as const;

export type PpapTendencyId = (typeof ppapTendencyIds)[number];

export const ppapBandLabels = [
  "STRONG SIGNAL",
  "POSITIVE SIGNAL",
  "MIXED SIGNAL",
  "WEAK SIGNAL",
] as const;

export type PpapBandLabel = (typeof ppapBandLabels)[number];

export const ppapBrandOptions = ["ICF", "YYE", "Back Office", "Multiple"] as const;

export type PpapBrand = (typeof ppapBrandOptions)[number];

export type PpapQuestion = {
  id: number;
  tendencyId: PpapTendencyId;
  prompt: string;
  reverseScored: boolean;
};

export type PpapTendencyDefinition = {
  id: PpapTendencyId;
  label: string;
  description: string;
  candidateLabel: string;
};

export type PpapQuestionScore = {
  id: number;
  prompt: string;
  tendencyId: PpapTendencyId;
  response: number;
  adjustedResponse: number;
  reverseScored: boolean;
};

export type PpapTendencyScore = {
  id: PpapTendencyId;
  label: string;
  percentage: number;
  adjustedSum: number;
  band: PpapBandLabel;
  questionIds: number[];
};

export type PpapAssessmentScores = {
  tendencyScores: PpapTendencyScore[];
  overallScore: number;
  band: PpapBandLabel;
  socialDesirabilityFlag: boolean;
  questionScores: PpapQuestionScore[];
};

export type PpapCandidateIntake = {
  fullName: string;
  email: string;
  roleApplied: string;
  brand: PpapBrand;
  workspaceId: string;
};

export type PpapCandidateSubmissionRecord = {
  id: string;
  workspaceId: string;
  createdAt: string;
  fullName: string;
  email: string | null;
  roleApplied: string;
  brand: PpapBrand;
  responses: Record<string, number>;
  scores: PpapAssessmentScores;
  overallScore: number;
  band: PpapBandLabel;
  adminReport: string;
  candidateSummary: string;
  socialDesirabilityFlag: boolean;
  aiProvider: "gemini" | "huggingface" | "local";
  aiProviderDetail: string;
};

export type PpapSubmissionSummary = Pick<
  PpapCandidateSubmissionRecord,
  | "id"
  | "createdAt"
  | "fullName"
  | "email"
  | "roleApplied"
  | "brand"
  | "overallScore"
  | "band"
  | "socialDesirabilityFlag"
  | "aiProvider"
>;

export const PPAP_TENDENCIES: Record<PpapTendencyId, PpapTendencyDefinition> = {
  good_natured: {
    id: "good_natured",
    label: "Good-Natured",
    description: "Warmth, respect, and calm behaviour under pressure.",
    candidateLabel: "How you treat people and regulate your tone",
  },
  growth_mindset: {
    id: "growth_mindset",
    label: "Growth Mindset",
    description: "Receptivity to feedback, self-awareness, and willingness to change.",
    candidateLabel: "How you handle feedback and improvement",
  },
  energy_adaptability: {
    id: "energy_adaptability",
    label: "Energy & Adaptability",
    description: "Positive presence, enthusiasm, and openness to change.",
    candidateLabel: "How you show up when the work shifts",
  },
  team_player: {
    id: "team_player",
    label: "Team Player",
    description: "Collective orientation, proactive communication, and shared credit.",
    candidateLabel: "How you behave with teammates",
  },
  ownership_accountability: {
    id: "ownership_accountability",
    label: "Ownership & Accountability",
    description: "Personal responsibility, follow-through, and ownership.",
    candidateLabel: "How you handle mistakes and commitments",
  },
};

export const PPAP_QUESTIONS: PpapQuestion[] = [
  {
    id: 1,
    tendencyId: "good_natured",
    prompt: "I adjust how I speak to people depending on how they seem to be feeling in the moment.",
    reverseScored: false,
  },
  {
    id: 2,
    tendencyId: "good_natured",
    prompt: "When someone frustrates me at work, I usually address it calmly rather than reacting immediately.",
    reverseScored: false,
  },
  {
    id: 3,
    tendencyId: "good_natured",
    prompt: "I find it easy to remain polite and professional even when I strongly disagree with someone.",
    reverseScored: false,
  },
  {
    id: 4,
    tendencyId: "good_natured",
    prompt: "I often get impatient when people don't meet my standards and find it hard not to show it.",
    reverseScored: true,
  },
  {
    id: 5,
    tendencyId: "good_natured",
    prompt: "People who work with me would say I make the environment more pleasant, not more tense.",
    reverseScored: false,
  },
  {
    id: 6,
    tendencyId: "good_natured",
    prompt: "I believe how you treat people matters just as much as the results you produce.",
    reverseScored: false,
  },
  {
    id: 7,
    tendencyId: "growth_mindset",
    prompt: "When I receive critical feedback, my first instinct is to understand it, not defend myself.",
    reverseScored: false,
  },
  {
    id: 8,
    tendencyId: "growth_mindset",
    prompt: "I actively seek out areas where I can improve rather than waiting to be told what to fix.",
    reverseScored: false,
  },
  {
    id: 9,
    tendencyId: "growth_mindset",
    prompt: "I have changed my approach to something important based on feedback I initially disagreed with.",
    reverseScored: false,
  },
  {
    id: 10,
    tendencyId: "growth_mindset",
    prompt: "I find it difficult to accept that a method I've used for a long time might not be the best way.",
    reverseScored: true,
  },
  {
    id: 11,
    tendencyId: "growth_mindset",
    prompt: "I see a difficult challenge as something that will make me better, not something to avoid.",
    reverseScored: false,
  },
  {
    id: 12,
    tendencyId: "growth_mindset",
    prompt: "I am comfortable not knowing something and saying so, rather than pretending I understand.",
    reverseScored: false,
  },
  {
    id: 13,
    tendencyId: "energy_adaptability",
    prompt: "I bring energy to the spaces I work in - people tend to feel my presence in a positive way.",
    reverseScored: false,
  },
  {
    id: 14,
    tendencyId: "energy_adaptability",
    prompt: "When a new system or process is introduced, I engage with it genuinely rather than grudgingly.",
    reverseScored: false,
  },
  {
    id: 15,
    tendencyId: "energy_adaptability",
    prompt: "I tend to approach work with enthusiasm, even for tasks that aren't the most exciting.",
    reverseScored: false,
  },
  {
    id: 16,
    tendencyId: "energy_adaptability",
    prompt: "I find frequent changes at work stressful and prefer things to stay predictable.",
    reverseScored: true,
  },
  {
    id: 17,
    tendencyId: "energy_adaptability",
    prompt: "People around me would say I raise the energy of a room, not drain it.",
    reverseScored: false,
  },
  {
    id: 18,
    tendencyId: "energy_adaptability",
    prompt: "I can motivate myself on difficult or slow days without needing someone to push me.",
    reverseScored: false,
  },
  {
    id: 19,
    tendencyId: "team_player",
    prompt: "When my team is struggling, I step in without being asked, even if it's outside my area.",
    reverseScored: false,
  },
  {
    id: 20,
    tendencyId: "team_player",
    prompt: "I share information and knowledge freely - I don't hold back things that would help others.",
    reverseScored: false,
  },
  {
    id: 21,
    tendencyId: "team_player",
    prompt: "I genuinely feel satisfied when the team wins, even if my personal contribution was small.",
    reverseScored: false,
  },
  {
    id: 22,
    tendencyId: "team_player",
    prompt: "I prefer to focus on my own work and let others manage theirs.",
    reverseScored: true,
  },
  {
    id: 23,
    tendencyId: "team_player",
    prompt: "I communicate proactively with teammates - I don't wait to be chased for updates.",
    reverseScored: false,
  },
  {
    id: 24,
    tendencyId: "team_player",
    prompt: "I make it a point to acknowledge my teammates' contributions, not just my own.",
    reverseScored: false,
  },
  {
    id: 25,
    tendencyId: "ownership_accountability",
    prompt: "When something goes wrong in my area, my first move is to fix it and understand what happened - not to explain why it wasn't my fault.",
    reverseScored: false,
  },
  {
    id: 26,
    tendencyId: "ownership_accountability",
    prompt: "I hold myself to my own standards even when no one is checking.",
    reverseScored: false,
  },
  {
    id: 27,
    tendencyId: "ownership_accountability",
    prompt: "I take personal responsibility for the performance of the team or function I lead, not just my individual tasks.",
    reverseScored: false,
  },
  {
    id: 28,
    tendencyId: "ownership_accountability",
    prompt: "When I make a mistake, I tend to minimise it or focus on external reasons for what went wrong.",
    reverseScored: true,
  },
  {
    id: 29,
    tendencyId: "ownership_accountability",
    prompt: "I follow through on commitments consistently - people who depend on me rarely have to chase me.",
    reverseScored: false,
  },
  {
    id: 30,
    tendencyId: "ownership_accountability",
    prompt: "I would rather raise a concern early and be wrong than stay quiet and let something go off track.",
    reverseScored: false,
  },
];
