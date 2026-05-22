import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  createLocalScreeningSession,
  deleteLocalScreeningSession,
  listLocalScreeningSessions,
  readLocalScreeningSessionStoreForMigration,
  updateLocalScreeningSessionWorkflow,
} from "@/lib/local-screening-session-store";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import type { StoredAnalysisSession } from "@/types/analysis-session";
import {
  analysisProviders,
  documentTypes,
  recruiterStatuses,
  type AnalysisProvider,
  type DocumentType,
  type RecruiterStatus,
  type RoleSetup,
} from "@/types/document-intelligence";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

let screeningSessionsSeedPromise: Promise<void> | null = null;

export async function listScreeningSessions(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return listLocalScreeningSessions(workspaceId);
  }

  await ensureScreeningSessionsSeeded();

  const result = await queryPostgres<ScreeningSessionRow>(
    `
      SELECT
        id,
        workspace_id,
        analysis_goal,
        created_at,
        document_type,
        provider,
        recruiter_notes,
        recruiter_status,
        role_setup,
        response
      FROM screening_sessions
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `,
    [sanitizeWorkspaceId(workspaceId)]
  );

  return result.rows.map(toStoredAnalysisSession);
}

export async function createScreeningSession({
  workspaceId,
  analysisGoal,
  documentType,
  provider,
  roleSetup,
  response,
}: {
  workspaceId: string;
  analysisGoal: string;
  documentType: DocumentType;
  provider: AnalysisProvider;
  roleSetup: RoleSetup;
  response: StoredAnalysisSession["response"];
}) {
  if (!isPostgresConfigured()) {
    return createLocalScreeningSession({
      workspaceId,
      analysisGoal,
      documentType,
      provider,
      roleSetup,
      response,
    });
  }

  await ensureScreeningSessionsSeeded();

  const screeningId = randomUUID();
  const result = await queryPostgres<ScreeningSessionRow>(
    `
      INSERT INTO screening_sessions (
        id,
        workspace_id,
        analysis_goal,
        created_at,
        document_type,
        provider,
        recruiter_notes,
        recruiter_status,
        role_setup,
        response,
        updated_at
      )
      VALUES (
        $1, $2, $3, NOW(), $4, $5, '', 'New', $6::jsonb, $7::jsonb, NOW()
      )
      RETURNING
        id,
        workspace_id,
        analysis_goal,
        created_at,
        document_type,
        provider,
        recruiter_notes,
        recruiter_status,
        role_setup,
        response
    `,
    [
      screeningId,
      sanitizeWorkspaceId(workspaceId),
      analysisGoal.trim(),
      normalizeDocumentType(documentType),
      normalizeAnalysisProvider(provider),
      JSON.stringify(normalizeRoleSetup(roleSetup)),
      JSON.stringify(response),
    ]
  );

  return toStoredAnalysisSession(result.rows[0]);
}

export async function updateScreeningSessionWorkflow({
  screeningId,
  workspaceId,
  recruiterNotes,
  recruiterStatus,
}: {
  screeningId: string;
  workspaceId: string;
  recruiterNotes: string;
  recruiterStatus: RecruiterStatus;
}) {
  if (!isPostgresConfigured()) {
    return updateLocalScreeningSessionWorkflow({
      screeningId,
      workspaceId,
      recruiterNotes,
      recruiterStatus,
    });
  }

  await ensureScreeningSessionsSeeded();

  const result = await queryPostgres<ScreeningSessionRow>(
    `
      UPDATE screening_sessions
      SET recruiter_notes = $3,
          recruiter_status = $4,
          updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING
        id,
        workspace_id,
        analysis_goal,
        created_at,
        document_type,
        provider,
        recruiter_notes,
        recruiter_status,
        role_setup,
        response
    `,
    [
      screeningId,
      sanitizeWorkspaceId(workspaceId),
      recruiterNotes,
      normalizeRecruiterStatus(recruiterStatus),
    ]
  );

  return result.rows[0] ? toStoredAnalysisSession(result.rows[0]) : null;
}

export async function deleteScreeningSession(
  screeningId: string,
  workspaceId: string
) {
  if (!isPostgresConfigured()) {
    return deleteLocalScreeningSession(screeningId, workspaceId);
  }

  await ensureScreeningSessionsSeeded();

  const result = await queryPostgres<{ id: string }>(
    `
      DELETE FROM screening_sessions
      WHERE id = $1 AND workspace_id = $2
      RETURNING id
    `,
    [screeningId, sanitizeWorkspaceId(workspaceId)]
  );

  return Boolean(result.rows[0]);
}

async function ensureScreeningSessionsSeeded() {
  if (screeningSessionsSeedPromise) {
    return screeningSessionsSeedPromise;
  }

  screeningSessionsSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM screening_sessions"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalScreeningSessionStoreForMigration();

    for (const session of localStore.sessions) {
      await client.query(
        `
          INSERT INTO screening_sessions (
            id,
            workspace_id,
            analysis_goal,
            created_at,
            document_type,
            provider,
            recruiter_notes,
            recruiter_status,
            role_setup,
            response,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9::jsonb, $10::jsonb, NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          session.id,
          sanitizeWorkspaceId(session.workspaceId),
          session.analysisGoal,
          session.createdAt,
          normalizeDocumentType(session.documentType),
          normalizeAnalysisProvider(session.provider),
          session.recruiterNotes,
          normalizeRecruiterStatus(session.recruiterStatus),
          JSON.stringify(normalizeRoleSetup(session.roleSetup)),
          JSON.stringify(session.response),
        ]
      );
    }
  });

  return screeningSessionsSeedPromise;
}

function toStoredAnalysisSession(row: ScreeningSessionRow): StoredAnalysisSession {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    analysisGoal: row.analysis_goal ?? "",
    createdAt: toIsoString(row.created_at),
    documentType: normalizeDocumentType(row.document_type),
    provider: normalizeAnalysisProvider(row.provider),
    recruiterNotes: row.recruiter_notes ?? "",
    recruiterStatus: normalizeRecruiterStatus(row.recruiter_status),
    roleSetup: normalizeRoleSetup(row.role_setup),
    response: row.response as StoredAnalysisSession["response"],
  };
}

function normalizeDocumentType(value: unknown): DocumentType {
  return (documentTypes as readonly string[]).includes(String(value))
    ? (value as DocumentType)
    : "cv";
}

function normalizeAnalysisProvider(value: unknown): AnalysisProvider {
  return (analysisProviders as readonly string[]).includes(String(value))
    ? (value as AnalysisProvider)
    : "auto";
}

function normalizeRecruiterStatus(value: unknown): RecruiterStatus {
  return (recruiterStatuses as readonly string[]).includes(String(value))
    ? (value as RecruiterStatus)
    : "New";
}

function normalizeRoleSetup(value: unknown): RoleSetup {
  const parsed = (value ?? {}) as Partial<RoleSetup>;

  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    seniority: typeof parsed.seniority === "string" ? parsed.seniority : "",
    location: typeof parsed.location === "string" ? parsed.location : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    mustHaveSkills: Array.isArray(parsed.mustHaveSkills)
      ? parsed.mustHaveSkills.filter((item): item is string => typeof item === "string")
      : [],
    niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills)
      ? parsed.niceToHaveSkills.filter((item): item is string => typeof item === "string")
      : [],
    interviewFocus: Array.isArray(parsed.interviewFocus)
      ? parsed.interviewFocus.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ScreeningSessionRow = QueryResultRow & {
  analysis_goal: string | null;
  created_at: Date | string;
  document_type: string;
  id: string;
  provider: string;
  recruiter_notes: string | null;
  recruiter_status: string | null;
  response: unknown;
  role_setup: unknown;
  workspace_id: string;
};
