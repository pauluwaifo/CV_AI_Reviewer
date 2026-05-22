import "server-only";

import type { QueryResultRow } from "pg";

import {
  deleteLocalWorkspaceMailConnection,
  getLocalWorkspaceMailConnection,
  saveLocalWorkspaceMailConnection,
  type WorkspaceMailConnectionRecord,
} from "@/lib/local-workspace-mail-store";
import {
  isPostgresConfigured,
  queryPostgres,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export async function getWorkspaceMailConnection(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceMailConnection(workspaceId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceMailConnectionRow>(
    `
      SELECT workspace_id, provider, from_email, client_id, client_secret, refresh_token,
             created_at, updated_at
      FROM workspace_mail_connections
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const row = result.rows[0];

  return row ? toWorkspaceMailConnectionRecord(row) : null;
}

export async function saveWorkspaceMailConnection({
  workspaceId,
  fromEmail,
  clientId,
  clientSecret,
  refreshToken,
}: {
  workspaceId: string;
  fromEmail: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  if (!isPostgresConfigured()) {
    return saveLocalWorkspaceMailConnection({
      workspaceId,
      fromEmail,
      clientId,
      clientSecret,
      refreshToken,
    });
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceMailConnectionRow>(
    `
      INSERT INTO workspace_mail_connections (
        workspace_id,
        provider,
        from_email,
        client_id,
        client_secret,
        refresh_token,
        created_at,
        updated_at
      )
      VALUES ($1, 'gmail', $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET provider = EXCLUDED.provider,
          from_email = EXCLUDED.from_email,
          client_id = EXCLUDED.client_id,
          client_secret = EXCLUDED.client_secret,
          refresh_token = EXCLUDED.refresh_token,
          updated_at = NOW()
      RETURNING workspace_id, provider, from_email, client_id, client_secret, refresh_token,
                created_at, updated_at
    `,
    [
      normalizedWorkspaceId,
      fromEmail.trim().toLowerCase(),
      clientId.trim(),
      clientSecret.trim(),
      refreshToken.trim(),
    ]
  );

  return toWorkspaceMailConnectionRecord(result.rows[0]);
}

export async function deleteWorkspaceMailConnection(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalWorkspaceMailConnection(workspaceId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres(
    `
      DELETE FROM workspace_mail_connections
      WHERE workspace_id = $1
    `,
    [normalizedWorkspaceId]
  );

  return (result.rowCount ?? 0) > 0;
}

function toWorkspaceMailConnectionRecord(
  row: WorkspaceMailConnectionRow
): WorkspaceMailConnectionRecord {
  return {
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    provider: "gmail",
    fromEmail: row.from_email.trim().toLowerCase(),
    clientId: row.client_id,
    clientSecret: row.client_secret,
    refreshToken: row.refresh_token,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type WorkspaceMailConnectionRow = QueryResultRow & {
  workspace_id: string;
  provider: string;
  from_email: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  created_at: Date | string;
  updated_at: Date | string;
};
