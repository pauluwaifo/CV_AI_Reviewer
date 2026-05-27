import "server-only";

import type { QueryResultRow } from "pg";

import {
  deleteLocalWorkspaceMailConnection,
  getLocalWorkspaceMailConnection,
  saveLocalWorkspaceMailConnection,
  type WorkspaceMailConnectionRecord,
} from "@/lib/local-workspace-mail-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

type SaveWorkspaceMailConnectionInput =
  | {
      provider: "gmail";
      workspaceId: string;
      fromEmail: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      connectedAccountEmail: string;
      senderIdentity: "primary" | "alias" | "unknown";
    }
  | {
      provider: "smtp";
      workspaceId: string;
      fromEmail: string;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
      smtpUsername: string;
      smtpPassword: string;
    };

export async function getWorkspaceMailConnection(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceMailConnection(workspaceId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceMailConnectionRow>(
    `
      SELECT workspace_id, provider, from_email, client_id, client_secret, refresh_token,
             connected_account_email, sender_identity, smtp_host, smtp_port, smtp_secure,
             smtp_username, smtp_password, created_at, updated_at
      FROM workspace_mail_connections
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const row = result.rows[0];

  return row ? toWorkspaceMailConnectionRecord(row) : null;
}

export async function saveWorkspaceMailConnection(
  input: SaveWorkspaceMailConnectionInput
) {
  if (!isPostgresConfigured()) {
    return saveLocalWorkspaceMailConnection(input);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(input.workspaceId);

  if (input.provider === "smtp") {
    const result = await queryPostgres<WorkspaceMailConnectionRow>(
      `
        INSERT INTO workspace_mail_connections (
          workspace_id,
          provider,
          from_email,
          client_id,
          client_secret,
          refresh_token,
          connected_account_email,
          sender_identity,
          smtp_host,
          smtp_port,
          smtp_secure,
          smtp_username,
          smtp_password,
          created_at,
          updated_at
        )
        VALUES ($1, 'smtp', $2, '', '', '', '', 'smtp', $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (workspace_id) DO UPDATE
        SET provider = EXCLUDED.provider,
            from_email = EXCLUDED.from_email,
            client_id = EXCLUDED.client_id,
            client_secret = EXCLUDED.client_secret,
            refresh_token = EXCLUDED.refresh_token,
            connected_account_email = EXCLUDED.connected_account_email,
            sender_identity = EXCLUDED.sender_identity,
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_secure = EXCLUDED.smtp_secure,
            smtp_username = EXCLUDED.smtp_username,
            smtp_password = EXCLUDED.smtp_password,
            updated_at = NOW()
        RETURNING workspace_id, provider, from_email, client_id, client_secret, refresh_token,
                  connected_account_email, sender_identity, smtp_host, smtp_port, smtp_secure,
                  smtp_username, smtp_password, created_at, updated_at
      `,
      [
        normalizedWorkspaceId,
        input.fromEmail.trim().toLowerCase(),
        input.smtpHost.trim(),
        normalizeSmtpPort(input.smtpPort),
        Boolean(input.smtpSecure),
        input.smtpUsername.trim(),
        input.smtpPassword.trim(),
      ]
    );

    return toWorkspaceMailConnectionRecord(result.rows[0]);
  }

  const result = await queryPostgres<WorkspaceMailConnectionRow>(
    `
      INSERT INTO workspace_mail_connections (
        workspace_id,
        provider,
        from_email,
        client_id,
        client_secret,
        refresh_token,
        connected_account_email,
        sender_identity,
        smtp_host,
        smtp_port,
        smtp_secure,
        smtp_username,
        smtp_password,
        created_at,
        updated_at
      )
      VALUES ($1, 'gmail', $2, $3, $4, $5, $6, $7, '', 587, FALSE, '', '', NOW(), NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET provider = EXCLUDED.provider,
          from_email = EXCLUDED.from_email,
          client_id = EXCLUDED.client_id,
          client_secret = EXCLUDED.client_secret,
          refresh_token = EXCLUDED.refresh_token,
          connected_account_email = EXCLUDED.connected_account_email,
          sender_identity = EXCLUDED.sender_identity,
          smtp_host = EXCLUDED.smtp_host,
          smtp_port = EXCLUDED.smtp_port,
          smtp_secure = EXCLUDED.smtp_secure,
          smtp_username = EXCLUDED.smtp_username,
          smtp_password = EXCLUDED.smtp_password,
          updated_at = NOW()
      RETURNING workspace_id, provider, from_email, client_id, client_secret, refresh_token,
                connected_account_email, sender_identity, smtp_host, smtp_port, smtp_secure,
                smtp_username, smtp_password, created_at, updated_at
    `,
    [
      normalizedWorkspaceId,
      input.fromEmail.trim().toLowerCase(),
      input.clientId.trim(),
      input.clientSecret.trim(),
      input.refreshToken.trim(),
      input.connectedAccountEmail.trim().toLowerCase(),
      normalizeSenderIdentity(input.senderIdentity),
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
  if (row.provider === "smtp") {
    return {
      workspaceId: sanitizeWorkspaceId(row.workspace_id),
      provider: "smtp",
      fromEmail: row.from_email.trim().toLowerCase(),
      smtpHost: row.smtp_host.trim(),
      smtpPort: normalizeSmtpPort(row.smtp_port),
      smtpSecure: Boolean(row.smtp_secure),
      smtpUsername: row.smtp_username.trim(),
      smtpPassword: row.smtp_password,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  return {
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    provider: "gmail",
    fromEmail: row.from_email.trim().toLowerCase(),
    clientId: row.client_id,
    clientSecret: row.client_secret,
    refreshToken: row.refresh_token,
    connectedAccountEmail: row.connected_account_email.trim().toLowerCase(),
    senderIdentity: normalizeSenderIdentity(row.sender_identity),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizeSenderIdentity(
  value: unknown
): "primary" | "alias" | "unknown" {
  return value === "primary" || value === "alias" ? value : "unknown";
}

function normalizeSmtpPort(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
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
  connected_account_email: string;
  sender_identity: string;
  smtp_host: string;
  smtp_port: number | string;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  created_at: Date | string;
  updated_at: Date | string;
};
