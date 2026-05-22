import "server-only";

import { deleteLocalWorkspaceAccessResetRequests } from "@/lib/local-workspace-access-reset-store";
import { deleteLocalWorkspaceAccessRecord } from "@/lib/local-workspace-access-store";
import { deleteLocalWorkspaceHiringData } from "@/lib/local-hiring-funnel-store";
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
      deleteLocalWorkspaceSettings(normalizedWorkspaceId),
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
      client.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [
        normalizedWorkspaceId,
      ]),
    ]);

    return deletions.some((result) => (result.rowCount ?? 0) > 0);
  });
}
