import "server-only";

import type { QueryResultRow } from "pg";

import {
  deleteLocalWorkspaceIntegrationSettings,
  getLocalWorkspaceIntegrationSettings,
  saveLocalWorkspaceIntegrationSettings,
} from "@/lib/local-workspace-integrations-store";
import {
  isPostgresConfigured,
  queryPostgres,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export type WorkspaceIntegrationEvent =
  | "application.created"
  | "application.workflow.updated"
  | "billing.payment_succeeded"
  | "form.created"
  | "form.deleted"
  | "form.updated"
  | "workspace.member.invited";

export type WorkspaceIntegrationSettings = {
  workspaceId: string;
  enabledEvents: WorkspaceIntegrationEvent[];
  lastDeliveryAttemptAt: string | null;
  lastDeliveryError: string;
  lastDeliveryEvent: string;
  lastDeliveryTarget: "mixed" | "slack" | "webhook" | "";
  slackWebhookUrl: string;
  updatedAt: string;
  webhookSigningSecret: string;
  webhookUrl: string;
};

export const WORKSPACE_INTEGRATION_EVENT_OPTIONS: Array<{
  description: string;
  label: string;
  value: WorkspaceIntegrationEvent;
}> = [
  { value: "application.created", label: "New application", description: "Send candidate submission payloads." },
  { value: "application.workflow.updated", label: "Workflow changes", description: "Send stage, owner, note, and interview updates." },
  { value: "form.created", label: "Form created", description: "Notify other tools when a hiring form is published." },
  { value: "form.updated", label: "Form updated", description: "Sync hiring form changes to downstream tools." },
  { value: "form.deleted", label: "Form deleted", description: "Alert external tools when a form is removed." },
  { value: "workspace.member.invited", label: "Member invited", description: "Track new recruiter seats and invites." },
  { value: "billing.payment_succeeded", label: "Payment succeeded", description: "Notify systems when a workspace subscription is paid." },
] as const;

export async function getWorkspaceIntegrationSettings(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!isPostgresConfigured()) {
    return getLocalWorkspaceIntegrationSettings(normalizedWorkspaceId);
  }

  const result = await queryPostgres<DbWorkspaceIntegrationRow>(
    `
      SELECT settings, updated_at
      FROM workspace_integration_settings
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const row = result.rows[0];

  return parseWorkspaceIntegrationSettings(
    {
      ...(row?.settings ?? {}),
      updatedAt:
        row?.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row?.updated_at,
      workspaceId: normalizedWorkspaceId,
    },
    normalizedWorkspaceId
  );
}

export async function saveWorkspaceIntegrationSettings(
  workspaceId: string,
  value: Partial<WorkspaceIntegrationSettings>
) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const current = await getWorkspaceIntegrationSettings(normalizedWorkspaceId);
  const next = parseWorkspaceIntegrationSettings(
    {
      ...current,
      ...value,
      workspaceId: normalizedWorkspaceId,
      updatedAt: new Date().toISOString(),
    },
    normalizedWorkspaceId
  );

  if (!isPostgresConfigured()) {
    return saveLocalWorkspaceIntegrationSettings(normalizedWorkspaceId, next);
  }

  await queryPostgres(
    `
      INSERT INTO workspace_integration_settings (
        workspace_id,
        settings,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3::timestamptz)
      ON CONFLICT (workspace_id)
      DO UPDATE SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at
    `,
    [
      normalizedWorkspaceId,
      JSON.stringify(next),
      next.updatedAt,
    ]
  );

  return next;
}

export async function markWorkspaceIntegrationDeliveryAttempt(
  workspaceId: string,
  values: Pick<
    WorkspaceIntegrationSettings,
    "lastDeliveryAttemptAt" | "lastDeliveryError" | "lastDeliveryEvent" | "lastDeliveryTarget"
  >
) {
  return saveWorkspaceIntegrationSettings(workspaceId, values);
}

export async function deleteWorkspaceIntegrationSettings(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!isPostgresConfigured()) {
    return deleteLocalWorkspaceIntegrationSettings(normalizedWorkspaceId);
  }

  const result = await queryPostgres(
    `
      DELETE FROM workspace_integration_settings
      WHERE workspace_id = $1
    `,
    [normalizedWorkspaceId]
  );

  return (result.rowCount ?? 0) > 0;
}

function buildDefaultWorkspaceIntegrationSettings(
  workspaceId: string
): WorkspaceIntegrationSettings {
  return {
    workspaceId: sanitizeWorkspaceId(workspaceId),
    enabledEvents: [],
    lastDeliveryAttemptAt: null,
    lastDeliveryError: "",
    lastDeliveryEvent: "",
    lastDeliveryTarget: "",
    slackWebhookUrl: "",
    updatedAt: new Date().toISOString(),
    webhookSigningSecret: "",
    webhookUrl: "",
  };
}

export function parseWorkspaceIntegrationSettings(
  value: unknown,
  workspaceId: string
): WorkspaceIntegrationSettings {
  const parsed = (value ?? {}) as Partial<WorkspaceIntegrationSettings>;
  const fallback = buildDefaultWorkspaceIntegrationSettings(workspaceId);

  return {
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId ?? workspaceId),
    enabledEvents: normalizeEvents(parsed.enabledEvents),
    lastDeliveryAttemptAt: normalizeNullableIsoDate(parsed.lastDeliveryAttemptAt),
    lastDeliveryError:
      typeof parsed.lastDeliveryError === "string" ? parsed.lastDeliveryError.trim() : "",
    lastDeliveryEvent:
      typeof parsed.lastDeliveryEvent === "string" ? parsed.lastDeliveryEvent.trim() : "",
    lastDeliveryTarget:
      parsed.lastDeliveryTarget === "webhook" ||
      parsed.lastDeliveryTarget === "slack" ||
      parsed.lastDeliveryTarget === "mixed"
        ? parsed.lastDeliveryTarget
        : "",
    slackWebhookUrl:
      typeof parsed.slackWebhookUrl === "string"
        ? parsed.slackWebhookUrl.trim()
        : fallback.slackWebhookUrl,
    updatedAt: normalizeNullableIsoDate(parsed.updatedAt) ?? fallback.updatedAt,
    webhookSigningSecret:
      typeof parsed.webhookSigningSecret === "string"
        ? parsed.webhookSigningSecret.trim()
        : fallback.webhookSigningSecret,
    webhookUrl:
      typeof parsed.webhookUrl === "string" ? parsed.webhookUrl.trim() : fallback.webhookUrl,
  };
}

function normalizeEvents(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is WorkspaceIntegrationEvent =>
          typeof item === "string" &&
          WORKSPACE_INTEGRATION_EVENT_OPTIONS.some((option) => option.value === item)
      )
    )
  );
}

function normalizeNullableIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type DbWorkspaceIntegrationRow = QueryResultRow & {
  settings: unknown;
  updated_at: Date | string;
};
