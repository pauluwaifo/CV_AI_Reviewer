import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  createLocalWorkspaceAuditEvent,
  deleteLocalWorkspaceAuditEvents,
  listLocalWorkspaceAuditEvents,
} from "@/lib/local-workspace-audit-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export type WorkspaceAuditEvent = {
  action: string;
  actorEmail: string;
  actorRole: "admin" | "member";
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  summary: string;
  targetId: string;
  targetType: string;
  workspaceId: string;
};

export async function listWorkspaceAuditEvents(workspaceId: string, limit = 50) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!isPostgresConfigured()) {
    return listLocalWorkspaceAuditEvents(normalizedWorkspaceId, limit);
  }

  const result = await queryPostgres<DbWorkspaceAuditRow>(
    `
      SELECT *
      FROM workspace_audit_events
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [normalizedWorkspaceId, Math.max(1, limit)]
  );

  return result.rows.map(toWorkspaceAuditEvent);
}

export async function createWorkspaceAuditEvent(
  value: Omit<WorkspaceAuditEvent, "createdAt" | "id">
) {
  const event: WorkspaceAuditEvent = {
    ...value,
    id: randomUUID(),
    workspaceId: sanitizeWorkspaceId(value.workspaceId),
    createdAt: new Date().toISOString(),
  };

  if (!isPostgresConfigured()) {
    return createLocalWorkspaceAuditEvent(event);
  }

  await queryPostgres(
    `
      INSERT INTO workspace_audit_events (
        id,
        workspace_id,
        actor_email,
        actor_role,
        action,
        target_type,
        target_id,
        summary,
        metadata,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9::jsonb, $10::timestamptz
      )
    `,
    [
      event.id,
      event.workspaceId,
      event.actorEmail,
      event.actorRole,
      event.action,
      event.targetType,
      event.targetId,
      event.summary,
      JSON.stringify(event.metadata ?? {}),
      event.createdAt,
    ]
  );

  return event;
}

export async function deleteWorkspaceAuditEvents(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!isPostgresConfigured()) {
    return deleteLocalWorkspaceAuditEvents(normalizedWorkspaceId);
  }

  const result = await queryPostgres(
    `
      DELETE FROM workspace_audit_events
      WHERE workspace_id = $1
    `,
    [normalizedWorkspaceId]
  );

  return (result.rowCount ?? 0) > 0;
}

function toWorkspaceAuditEvent(row: DbWorkspaceAuditRow): WorkspaceAuditEvent {
  return {
    action: row.action,
    actorEmail: row.actor_email,
    actorRole: row.actor_role === "admin" ? "admin" : "member",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    id: row.id,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    summary: row.summary,
    targetId: row.target_id,
    targetType: row.target_type,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
  };
}

type DbWorkspaceAuditRow = QueryResultRow & {
  action: string;
  actor_email: string;
  actor_role: string;
  created_at: Date | string;
  id: string;
  metadata: unknown;
  summary: string;
  target_id: string;
  target_type: string;
  workspace_id: string;
};
