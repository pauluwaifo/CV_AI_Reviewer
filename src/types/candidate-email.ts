import type { ResolvedProvider } from "@/types/document-intelligence";
import type { WorkspaceSessionRole } from "@/types/workspace-session";

export type CandidateEmailKind = "rejection" | "follow_up";
export type CandidateEmailStatus = "draft" | "pending_approval" | "sent" | "cancelled";
export type CandidateEmailApprovalChannel = "web" | "email";
export type CandidateEmailDeliverySource = "workspace" | "global" | "none";
export type CandidateEmailDeliveryProvider = "gmail" | "smtp";

export interface CandidateEmailDraftRecord {
  id: string;
  workspaceId: string;
  applicationId: string;
  formId: string;
  candidateName: string;
  candidateEmail: string;
  kind: CandidateEmailKind;
  status: CandidateEmailStatus;
  subject: string;
  body: string;
  prompt: string;
  provider: ResolvedProvider | null;
  providerDetail: string;
  providerWarnings: string[];
  requestedByEmail: string;
  requestedByRole: WorkspaceSessionRole;
  approvalRequestedAt: string | null;
  approvalRequestedByEmail: string;
  approvalTokenHash: string;
  approvalTokenExpiresAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string;
  approvedVia: CandidateEmailApprovalChannel | null;
  sentAt: string | null;
  deliverySource: CandidateEmailDeliverySource | null;
  deliveryProvider: CandidateEmailDeliveryProvider | null;
  deliveryMessageId: string;
  deliveryFromEmail: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}
