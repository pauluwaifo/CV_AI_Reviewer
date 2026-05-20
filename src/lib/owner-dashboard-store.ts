import "server-only";

import type { QueryResultRow } from "pg";

import { readLocalHiringFunnelStoreForMigration } from "@/lib/local-hiring-funnel-store";
import { readLocalWorkspaceAccessStoreForMigration } from "@/lib/local-workspace-access-store";
import { readLocalWorkspaceSettingsStoreForMigration } from "@/lib/local-workspace-settings-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import {
  listWorkspaceAccessResetRequests,
  type WorkspaceAccessResetRequest,
} from "@/lib/workspace-access-reset-store";
import {
  buildDefaultWorkspaceSettings,
  parseWorkspaceSettings,
  sanitizeWorkspaceId,
} from "@/lib/workspace-settings";

export type OwnerWorkspaceSummary = {
  workspaceId: string;
  organizationName: string;
  appName: string;
  contactEmail: string;
  dashboardAccent: string;
  formAccent: string;
  formsCount: number;
  applicationsCount: number;
  uploadsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OwnerDashboardSnapshot = {
  totals: {
    workspaces: number;
    forms: number;
    applications: number;
    uploads: number;
    accessResetRequests: number;
  };
  accessResetRequests: WorkspaceAccessResetRequest[];
  workspaces: OwnerWorkspaceSummary[];
  storageMode: "postgres" | "local";
};

export async function getOwnerDashboardSnapshot(): Promise<OwnerDashboardSnapshot> {
  if (isPostgresConfigured()) {
    return getPostgresOwnerDashboardSnapshot();
  }

  return getLocalOwnerDashboardSnapshot();
}

async function getPostgresOwnerDashboardSnapshot() {
  const result = await queryPostgres<OwnerWorkspaceRow>(`
    WITH workspace_ids AS (
      SELECT workspace_id FROM workspace_settings
      UNION
      SELECT workspace_id FROM workspace_access_records
      UNION
      SELECT workspace_id FROM hiring_forms
      UNION
      SELECT workspace_id FROM hiring_applications
      UNION
      SELECT workspace_id FROM uploaded_files
    ),
    form_counts AS (
      SELECT workspace_id, COUNT(*)::int AS total
      FROM hiring_forms
      GROUP BY workspace_id
    ),
    application_counts AS (
      SELECT workspace_id, COUNT(*)::int AS total
      FROM hiring_applications
      GROUP BY workspace_id
    ),
    upload_counts AS (
      SELECT workspace_id, COUNT(*)::int AS total
      FROM uploaded_files
      GROUP BY workspace_id
    )
    SELECT
      w.workspace_id,
      s.settings,
      s.updated_at AS settings_updated_at,
      a.contact_email,
      a.created_at AS access_created_at,
      COALESCE(f.total, 0) AS forms_count,
      COALESCE(app.total, 0) AS applications_count,
      COALESCE(u.total, 0) AS uploads_count
    FROM workspace_ids w
    LEFT JOIN workspace_settings s ON s.workspace_id = w.workspace_id
    LEFT JOIN workspace_access_records a ON a.workspace_id = w.workspace_id
    LEFT JOIN form_counts f ON f.workspace_id = w.workspace_id
    LEFT JOIN application_counts app ON app.workspace_id = w.workspace_id
    LEFT JOIN upload_counts u ON u.workspace_id = w.workspace_id
    ORDER BY COALESCE(a.created_at, s.updated_at, NOW()) DESC, w.workspace_id ASC
  `);
  const workspaces = result.rows.map(toOwnerWorkspaceSummary);
  const accessResetRequests = await listWorkspaceAccessResetRequests();

  return {
    totals: buildTotals(workspaces, accessResetRequests),
    accessResetRequests,
    workspaces,
    storageMode: "postgres" as const,
  };
}

async function getLocalOwnerDashboardSnapshot() {
  const [settingsStore, accessStore, hiringStore] = await Promise.all([
    readLocalWorkspaceSettingsStoreForMigration(),
    readLocalWorkspaceAccessStoreForMigration(),
    readLocalHiringFunnelStoreForMigration(),
  ]);
  const workspaceIds = new Set<string>();

  for (const item of settingsStore.workspaces) {
    workspaceIds.add(sanitizeWorkspaceId(item.workspaceId));
  }

  for (const item of accessStore.records) {
    workspaceIds.add(sanitizeWorkspaceId(item.workspaceId));
  }

  for (const item of hiringStore.forms) {
    workspaceIds.add(sanitizeWorkspaceId(item.workspaceId));
  }

  for (const item of hiringStore.applications) {
    workspaceIds.add(sanitizeWorkspaceId(item.workspaceId));
  }

  const workspaces = Array.from(workspaceIds).map((workspaceId) => {
    const settingsRecord = settingsStore.workspaces.find(
      (item) => sanitizeWorkspaceId(item.workspaceId) === workspaceId
    );
    const accessRecord = accessStore.records.find(
      (item) => sanitizeWorkspaceId(item.workspaceId) === workspaceId
    );
    const settings = parseWorkspaceSettings({
      ...buildDefaultWorkspaceSettings(workspaceId),
      ...(settingsRecord?.settings ?? {}),
      workspaceId,
    });
    const forms = hiringStore.forms.filter(
      (item) => sanitizeWorkspaceId(item.workspaceId) === workspaceId
    );
    const applications = hiringStore.applications.filter(
      (item) => sanitizeWorkspaceId(item.workspaceId) === workspaceId
    );
    const uploads = new Set(
      applications
        .map((item) => item.resumeFile.storagePath)
        .filter((storagePath) => storagePath.trim())
    );

    return {
      workspaceId,
      organizationName: settings.organizationName,
      appName: settings.appName,
      contactEmail: accessRecord?.contactEmail ?? "",
      dashboardAccent: settings.dashboardAccent,
      formAccent: settings.formAccent,
      formsCount: forms.length,
      applicationsCount: applications.length,
      uploadsCount: uploads.size,
      createdAt: accessRecord?.createdAt ?? null,
      updatedAt: settingsRecord?.updatedAt ?? accessRecord?.updatedAt ?? null,
    } satisfies OwnerWorkspaceSummary;
  });

  workspaces.sort((left, right) => {
    const leftTime = left.createdAt ?? left.updatedAt ?? "";
    const rightTime = right.createdAt ?? right.updatedAt ?? "";
    return rightTime.localeCompare(leftTime) || left.workspaceId.localeCompare(right.workspaceId);
  });

  const accessResetRequests = await listWorkspaceAccessResetRequests();

  return {
    totals: buildTotals(workspaces, accessResetRequests),
    accessResetRequests,
    workspaces,
    storageMode: "local" as const,
  };
}

function toOwnerWorkspaceSummary(row: OwnerWorkspaceRow): OwnerWorkspaceSummary {
  const workspaceId = sanitizeWorkspaceId(row.workspace_id);
  const settings = parseWorkspaceSettings({
    ...buildDefaultWorkspaceSettings(workspaceId),
    ...(row.settings ?? {}),
    workspaceId,
  });

  return {
    workspaceId,
    organizationName: settings.organizationName,
    appName: settings.appName,
    contactEmail: row.contact_email ?? "",
    dashboardAccent: settings.dashboardAccent,
    formAccent: settings.formAccent,
    formsCount: row.forms_count ?? 0,
    applicationsCount: row.applications_count ?? 0,
    uploadsCount: row.uploads_count ?? 0,
    createdAt: toIsoString(row.access_created_at),
    updatedAt: toIsoString(row.settings_updated_at),
  };
}

function buildTotals(
  workspaces: OwnerWorkspaceSummary[],
  accessResetRequests: WorkspaceAccessResetRequest[]
) {
  return {
    workspaces: workspaces.length,
    forms: workspaces.reduce((sum, item) => sum + item.formsCount, 0),
    applications: workspaces.reduce((sum, item) => sum + item.applicationsCount, 0),
    uploads: workspaces.reduce((sum, item) => sum + item.uploadsCount, 0),
    accessResetRequests: accessResetRequests.filter(
      (request) => request.status === "pending"
    ).length,
  };
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type OwnerWorkspaceRow = QueryResultRow & {
  access_created_at: Date | string | null;
  applications_count: number;
  contact_email: string | null;
  forms_count: number;
  settings: Record<string, unknown> | null;
  settings_updated_at: Date | string | null;
  uploads_count: number;
  workspace_id: string;
};
