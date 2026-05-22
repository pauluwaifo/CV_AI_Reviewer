export type WorkspaceSessionRole = "admin" | "member";
export type WorkspaceSessionPrincipalType = "shared" | "member";

export type WorkspaceSession = {
  workspaceId: string;
  expiresAt: string;
  issuedAt: string;
  role: WorkspaceSessionRole;
  principalType: WorkspaceSessionPrincipalType;
  email: string;
  memberId: string | null;
};

export type WorkspaceSessionRecord = WorkspaceSession & {
  tokenHash: string;
  createdAt: string;
};
