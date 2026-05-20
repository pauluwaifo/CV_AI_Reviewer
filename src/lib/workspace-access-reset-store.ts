import "server-only";

import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";

import {
  createLocalWorkspaceAccessResetRequest,
  listLocalWorkspaceAccessResetRequests,
  readLocalWorkspaceAccessResetRequestStoreForMigration,
  updateLocalWorkspaceAccessResetRequestStatus,
  type WorkspaceAccessResetRequest,
  type WorkspaceAccessResetRequestStatus,
} from "@/lib/local-workspace-access-reset-store";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

let seedPromise: Promise<void> | null = null;

export type {
  WorkspaceAccessResetRequest,
  WorkspaceAccessResetRequestStatus,
} from "@/lib/local-workspace-access-reset-store";

export async function listWorkspaceAccessResetRequests() {
  if (!isPostgresConfigured()) {
    return listLocalWorkspaceAccessResetRequests();
  }

  await ensureSeeded();

  const result = await queryPostgres<ResetRequestRow>(`
    SELECT id, workspace_id, contact_email, status, note, created_at, resolved_at, resolved_by
    FROM workspace_access_reset_requests
    ORDER BY created_at DESC
  `);

  return result.rows.map(toResetRequest);
}

export async function createWorkspaceAccessResetRequest({
  workspaceId,
  contactEmail,
  note,
}: {
  workspaceId: string;
  contactEmail: string;
  note: string;
}) {
  const id = randomUUID();

  if (!isPostgresConfigured()) {
    return createLocalWorkspaceAccessResetRequest({
      id,
      workspaceId,
      contactEmail,
      note,
    });
  }

  await ensureSeeded();

  const result = await queryPostgres<ResetRequestRow>(
    `
      INSERT INTO workspace_access_reset_requests (
        id, workspace_id, contact_email, status, note, created_at, resolved_at, resolved_by
      )
      VALUES ($1, $2, $3, 'pending', $4, NOW(), NULL, '')
      RETURNING id, workspace_id, contact_email, status, note, created_at, resolved_at, resolved_by
    `,
    [id, sanitizeWorkspaceId(workspaceId), contactEmail.trim().toLowerCase(), note.trim()]
  );

  return toResetRequest(result.rows[0]);
}

export async function updateWorkspaceAccessResetRequestStatus({
  requestId,
  status,
  resolvedBy,
}: {
  requestId: string;
  status: WorkspaceAccessResetRequestStatus;
  resolvedBy: string;
}) {
  if (!isPostgresConfigured()) {
    return updateLocalWorkspaceAccessResetRequestStatus({
      requestId,
      status,
      resolvedBy,
    });
  }

  await ensureSeeded();

  const result = await queryPostgres<ResetRequestRow>(
    `
      UPDATE workspace_access_reset_requests
      SET status = $2,
          resolved_at = NOW(),
          resolved_by = $3
      WHERE id = $1
      RETURNING id, workspace_id, contact_email, status, note, created_at, resolved_at, resolved_by
    `,
    [requestId, status, resolvedBy]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error("Reset request was not found.");
  }

  return toResetRequest(row);
}

async function ensureSeeded() {
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM workspace_access_reset_requests"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalWorkspaceAccessResetRequestStoreForMigration();

    for (const request of localStore.requests) {
      await client.query(
        `
          INSERT INTO workspace_access_reset_requests (
            id, workspace_id, contact_email, status, note, created_at, resolved_at, resolved_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          request.id,
          request.workspaceId,
          request.contactEmail,
          request.status,
          request.note,
          request.createdAt,
          request.resolvedAt,
          request.resolvedBy,
        ]
      );
    }
  });

  return seedPromise;
}

function toResetRequest(row: ResetRequestRow): WorkspaceAccessResetRequest {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    contactEmail: row.contact_email,
    status:
      row.status === "resolved" || row.status === "rejected" ? row.status : "pending",
    note: row.note || "",
    createdAt: toIsoString(row.created_at),
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    resolvedBy: row.resolved_by || "",
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ResetRequestRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  contact_email: string;
  status: string;
  note: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
  resolved_by: string;
};
