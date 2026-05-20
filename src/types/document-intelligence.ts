export const documentTypes = ["auto", "cv", "contract", "invoice", "report"] as const;
export type DocumentType = (typeof documentTypes)[number];

export const analysisProviders = ["auto", "gemini", "huggingface"] as const;
export type AnalysisProvider = (typeof analysisProviders)[number];
export type RemoteProvider = Exclude<AnalysisProvider, "auto">;
export type ResolvedProvider = RemoteProvider | "local";
export const uploadSourceKinds = ["pdf", "text", "image"] as const;
export type UploadSourceKind = (typeof uploadSourceKinds)[number];
export const recruiterStatuses = [
  "New",
  "Reviewed",
  "Interview",
  "Hold",
  "Rejected",
  "Shortlisted",
] as const;
export type RecruiterStatus = (typeof recruiterStatuses)[number];

export const maxUploadSizeBytes = 15 * 1024 * 1024;

export interface ScoreBreakdownItem {
  category: string;
  score: number;
  note: string;
}

export interface HiringRecommendation {
  decision: "Shortlist" | "Interview" | "Hold" | "Reject";
  summary: string;
  confidence: "High" | "Medium" | "Low";
}

export interface CandidateProfileField {
  label: string;
  value: string;
}

export interface CandidateProfile {
  name: string;
  headline: string;
  summary: string;
  fields: CandidateProfileField[];
}

export interface RoleCriterionMatch {
  criterion: string;
  status: "matched" | "partial" | "missing";
  evidence: string;
}

export interface RoleMatch {
  summary: string;
  criteria: RoleCriterionMatch[];
}

export interface RoleSetup {
  title: string;
  seniority: string;
  location: string;
  summary: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  interviewFocus: string[];
}

export interface SkillAssessment {
  skill: string;
  category: "must-have" | "nice-to-have" | "general";
  status: "strong" | "partial" | "unclear" | "missing";
  score: number;
  evidence: string;
}

export interface RiskSignal {
  category: string;
  level: "low" | "medium" | "high";
  summary: string;
}

export interface EvidencePoint {
  title: string;
  excerpt: string;
  rationale: string;
  tone: "strength" | "concern" | "neutral";
}

export interface AnalysisScore {
  value: number;
  label: string;
  rationale: string;
  breakdown: ScoreBreakdownItem[];
}

export interface ExtractedFact {
  label: string;
  value: string;
}

export interface AnalysisResult {
  documentType: Exclude<DocumentType, "auto"> | "other";
  summary: string;
  recommendation: HiringRecommendation;
  candidateProfile: CandidateProfile;
  roleMatch: RoleMatch;
  skillAssessments: SkillAssessment[];
  riskSignals: RiskSignal[];
  keyHighlights: string[];
  redFlags: string[];
  recommendedActions: string[];
  evidencePoints: EvidencePoint[];
  interviewQuestions: string[];
  score: AnalysisScore;
  extractedFacts: ExtractedFact[];
  tone: string;
}

export interface AnalysisMeta {
  fileName: string;
  fileSize: number;
  pageCount: number;
  extractedCharacters: number;
  chunkCount: number;
  provider: ResolvedProvider;
  providerDetail?: string;
  inputKind: UploadSourceKind;
  mimeType: string;
  providerWarnings?: string[];
}

export interface AnalysisResponse {
  result: AnalysisResult;
  meta: AnalysisMeta;
  excerpt: string;
}
