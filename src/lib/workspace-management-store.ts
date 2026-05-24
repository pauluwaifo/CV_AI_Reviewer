import "server-only";

import { deleteAuthChallengesByWorkspaceId } from "@/lib/auth-challenge-store";
import { deleteCandidateEmailDraftsByWorkspaceId } from "@/lib/candidate-email-store";
import { deleteLocalWorkspaceControlSettings } from "@/lib/local-workspace-control-store";
import { deleteLocalWorkspaceAccessResetRequests } from "@/lib/local-workspace-access-reset-store";
import { deleteLocalWorkspaceAccessRecord } from "@/lib/local-workspace-access-store";
import { deleteLocalWorkspaceAuditEvents } from "@/lib/local-workspace-audit-store";
import { deleteLocalWorkspaceHiringData } from "@/lib/local-hiring-funnel-store";
import { deleteLocalWorkspaceIntegrationSettings } from "@/lib/local-workspace-integrations-store";
import { deleteLocalWorkspaceMailConnection } from "@/lib/local-workspace-mail-store";
import { deleteLocalWorkspaceMembers } from "@/lib/local-workspace-members-store";
import { deleteLocalWorkspaceScreeningSessions } from "@/lib/local-screening-session-store";
import { deleteLocalWorkspaceSettings } from "@/lib/local-workspace-settings-store";
import { isPostgresConfigured, withPostgresTransaction } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import { deleteWorkspaceSessionRecordsByWorkspaceId } from "@/lib/workspace-session-store";

export async function deleteWorkspace(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!normalizedWorkspaceId) {
    throw new Error("A valid workspace ID is required.");
  }

  if (!isPostgresConfigured()) {
    const results = await Promise.all([
      deleteLocalWorkspaceHiringData(normalizedWorkspaceId),
      deleteLocalWorkspaceScreeningSessions(normalizedWorkspaceId),
      deleteWorkspaceSessionRecordsByWorkspaceId(normalizedWorkspaceId),
      deleteLocalWorkspaceMembers(normalizedWorkspaceId),
      deleteLocalWorkspaceAccessResetRequests(normalizedWorkspaceId),
      deleteLocalWorkspaceAccessRecord(normalizedWorkspaceId),
      deleteLocalWorkspaceMailConnection(normalizedWorkspaceId),
      deleteAuthChallengesByWorkspaceId(normalizedWorkspaceId),
      deleteLocalWorkspaceControlSettings(normalizedWorkspaceId),
      deleteLocalWorkspaceIntegrationSettings(normalizedWorkspaceId),
      deleteLocalWorkspaceAuditEvents(normalizedWorkspaceId),
      deleteLocalWorkspaceSettings(normalizedWorkspaceId),
      deleteCandidateEmailDraftsByWorkspaceId(normalizedWorkspaceId),
    ]);

    return results.some(Boolean);
  }

  return withPostgresTransaction(async (client) => {
    const deletions = await Promise.all([
      client.query("DELETE FROM workspace_sessions WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM screening_sessions WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM hiring_applications WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM hiring_forms WHERE workspace_id = $1", [normalizedWorkspaceId]),
      client.query("DELETE FROM uploaded_files WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_members WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_access_reset_requests WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_access_records WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_mail_connections WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_billing_transactions WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_control_settings WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_integration_settings WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_audit_events WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM candidate_email_drafts WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM auth_challenges WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
      client.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
    ]);

    return deletions.some((result) => (result.rowCount ?? 0) > 0);
  });
}
