import type {
  AnalysisProvider,
  AnalysisResponse,
  DocumentType,
  RecruiterStatus,
  RoleSetup,
} from "@/types/document-intelligence";

export interface StoredAnalysisSession {
  id: string;
  workspaceId: string;
  analysisGoal: string;
  createdAt: string;
  documentType: DocumentType;
  provider: AnalysisProvider;
  recruiterNotes: string;
  recruiterStatus: RecruiterStatus;
  roleSetup: RoleSetup;
  response: AnalysisResponse;
}
