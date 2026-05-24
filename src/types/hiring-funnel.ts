import type {
  AnalysisResponse,
  RoleSetup,
  UploadSourceKind,
} from "@/types/document-intelligence";

export interface WorkspacePublicSnapshot {
  appName: string;
  organizationName: string;
  tagline: string;
  workspaceId: string;
  contactEmail?: string;
  dashboardAccent: string;
  formAccent: string;
  formHeaderImageDataUrl: string;
}

export interface HiringFormQuestion {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export type HiringFormFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "multiple_choice"
  | "checkboxes"
  | "dropdown"
  | "file";

export interface HiringFormField {
  id: string;
  label: string;
  placeholder: string;
  helper: string;
  required: boolean;
  type: HiringFormFieldType;
  options?: string[];
  systemKey?: keyof ApplicantProfile | "resumeFile";
}

export interface HiringFormJdAttachment {
  fileName: string;
  inputKind: UploadSourceKind;
  mimeType: string;
  extractedCharacters: number;
  text: string;
}

export interface HiringFormScreeningPolicy {
  autoFilterLowRoleMatch: boolean;
  minimumRoleMatchScore: number;
}

export interface HiringFormRecord {
  id: string;
  workspaceId: string;
  title: string;
  team: string;
  intro: string;
  analysisGoal: string;
  roleSetup: RoleSetup;
  screeningPolicy: HiringFormScreeningPolicy;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  workspace: WorkspacePublicSnapshot;
  createdAt: string;
  expiresAt: string | null;
  published: boolean;
  jdAttachment: HiringFormJdAttachment | null;
}

export interface ApplicantProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  portfolio: string;
  yearsExperience: string;
  noticePeriod: string;
  salaryExpectation: string;
  coverNote: string;
  customAnswers: Record<string, string>;
}

export interface StoredResumeFile {
  fileName: string;
  mimeType: string;
  size: number;
  inputKind: UploadSourceKind;
  storagePath: string;
}

export type HiringApplicationStage =
  | "new"
  | "reviewing"
  | "shortlisted"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "on_hold";

export type HiringInterviewScorecardRecommendation =
  | "pending"
  | "advance"
  | "lean_advance"
  | "hold"
  | "lean_reject"
  | "reject";

export interface HiringInterviewScorecardCriterion {
  id: string;
  label: string;
  prompt: string;
  score: number | null;
  notes: string;
}

export interface HiringInterviewScorecard {
  recommendation: HiringInterviewScorecardRecommendation;
  overallNotes: string;
  completedAt: string | null;
  updatedAt: string;
  criteria: HiringInterviewScorecardCriterion[];
}

export interface HiringApplicationWorkflow {
  stage: HiringApplicationStage;
  ownerEmail: string;
  recruiterNotes: string;
  nextStep: string;
  tags: string[];
  interviewPlan: string;
  interviewKit: string[];
  interviewDate: string | null;
  interviewScorecard: HiringInterviewScorecard;
  lastContactedAt: string | null;
  automationSummary: string;
  automationLog: string[];
  updatedAt: string;
}

export interface HiringApplicationRecord {
  id: string;
  workspaceId: string;
  formId: string;
  createdAt: string;
  applicant: ApplicantProfile;
  resumeFile: StoredResumeFile;
  analysis: AnalysisResponse;
  workflow: HiringApplicationWorkflow;
}

export interface HiringFunnelStoreData {
  forms: HiringFormRecord[];
  applications: HiringApplicationRecord[];
}

export interface HiringFormListItem extends HiringFormRecord {
  publicUrl: string;
  status: "active" | "expired" | "unpublished";
  applicationCount: number;
  topScore: number | null;
}

export interface HiringFormDetail extends HiringFormListItem {
  applications: HiringApplicationRecord[];
}

export interface PublicHiringForm {
  id: string;
  title: string;
  team: string;
  intro: string;
  roleSetup: RoleSetup;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  workspace: WorkspacePublicSnapshot;
  expiresAt: string | null;
  status: "active" | "expired" | "unpublished";
}
