import "server-only";

import type { QueryResultRow } from "pg";

import {
  createLocalPpapSubmission,
  getLocalPpapSubmission,
  listLocalPpapSubmissionSummaries,
  listLocalPpapSubmissions,
} from "@/lib/local-ppap-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type {
  PpapAssessmentScores,
  PpapBandLabel,
  PpapCandidateSubmissionRecord,
  PpapSubmissionSummary,
} from "@/types/ppap";

export async function listPpapSubmissions(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return listLocalPpapSubmissions(workspaceId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  try {
    const result = await queryPostgres<PpapSubmissionRow>(
      `
        SELECT
          id,
          created_at,
          workspace_id,
          full_name,
          email,
          role_applied,
          brand,
          responses,
          scores,
          overall_score,
          band,
          admin_report,
          candidate_summary,
          social_desirability_flag,
          ai_provider,
          ai_provider_detail
        FROM candidates
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `,
      [normalizedWorkspaceId]
    );

    return result.rows.map(toRecord);
  } catch (error) {
    console.warn("[ppap-store] Falling back to local submissions:", formatStoreWarning(error));
    return listLocalPpapSubmissions(workspaceId);
  }
}

export async function listPpapSubmissionSummaries(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return listLocalPpapSubmissionSummaries(workspaceId);
  }

  const submissions = await listPpapSubmissions(workspaceId);
  return submissions.map(toSummary);
}

export async function getPpapSubmission(
  workspaceId: string,
  submissionId: string
) {
  if (!isPostgresConfigured()) {
    return getLocalPpapSubmission(workspaceId, submissionId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const trimmedSubmissionId = submissionId.trim();

  if (!trimmedSubmissionId) {
    return null;
  }

  try {
    const result = await queryPostgres<PpapSubmissionRow>(
      `
        SELECT
          id,
          created_at,
          workspace_id,
          full_name,
          email,
          role_applied,
          brand,
          responses,
          scores,
          overall_score,
          band,
          admin_report,
          candidate_summary,
          social_desirability_flag,
          ai_provider,
          ai_provider_detail
        FROM candidates
        WHERE workspace_id = $1
          AND id = $2
        LIMIT 1
      `,
      [normalizedWorkspaceId, trimmedSubmissionId]
    );
    const row = result.rows[0];

    return row ? toRecord(row) : null;
  } catch (error) {
    console.warn("[ppap-store] Falling back to local submission lookup:", formatStoreWarning(error));
    return getLocalPpapSubmission(workspaceId, submissionId);
  }
}

export async function createPpapSubmission(
  record: PpapCandidateSubmissionRecord
) {
  if (!isPostgresConfigured()) {
    return createLocalPpapSubmission(record);
  }

  try {
    const result = await queryPostgres<PpapSubmissionRow>(
      `
        INSERT INTO candidates (
          id,
          created_at,
          workspace_id,
          full_name,
          email,
          role_applied,
          brand,
          responses,
          scores,
          overall_score,
          band,
          admin_report,
          candidate_summary,
          social_desirability_flag,
          ai_provider,
          ai_provider_detail
        )
        VALUES (
          $1::uuid,
          $2::timestamptz,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9::jsonb,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16
        )
        RETURNING
          id,
          created_at,
          workspace_id,
          full_name,
          email,
          role_applied,
          brand,
          responses,
          scores,
          overall_score,
          band,
          admin_report,
          candidate_summary,
          social_desirability_flag,
          ai_provider,
          ai_provider_detail
      `,
      [
        record.id,
        record.createdAt,
        sanitizeWorkspaceId(record.workspaceId),
        record.fullName,
        record.email,
        record.roleApplied,
        record.brand,
        JSON.stringify(record.responses),
        JSON.stringify(record.scores),
        record.overallScore,
        record.band,
        record.adminReport,
        record.candidateSummary,
        record.socialDesirabilityFlag,
        record.aiProvider,
        record.aiProviderDetail,
      ]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("PPAP submission could not be saved.");
    }

    return toRecord(row);
  } catch (error) {
    console.warn("[ppap-store] Falling back to local submission save:", formatStoreWarning(error));
    return createLocalPpapSubmission(record);
  }
}

function toRecord(row: PpapSubmissionRow): PpapCandidateSubmissionRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    createdAt: toIsoString(row.created_at),
    fullName: row.full_name,
    email: normalizeNullableString(row.email),
    roleApplied: row.role_applied,
    brand: row.brand as PpapCandidateSubmissionRecord["brand"],
    responses: normalizeResponses(row.responses),
    scores: normalizeScores(row.scores),
    overallScore:
      typeof row.overall_score === "number"
        ? row.overall_score
        : Number(row.overall_score),
    band: normalizeBand(row.band),
    adminReport: row.admin_report,
    candidateSummary: row.candidate_summary,
    socialDesirabilityFlag: Boolean(row.social_desirability_flag),
    aiProvider: normalizeAiProvider(row.ai_provider),
    aiProviderDetail: normalizeString(row.ai_provider_detail),
  };
}

function toSummary(record: PpapCandidateSubmissionRecord): PpapSubmissionSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    fullName: record.fullName,
    email: record.email,
    roleApplied: record.roleApplied,
    brand: record.brand,
    overallScore: record.overallScore,
    band: record.band,
    socialDesirabilityFlag: record.socialDesirabilityFlag,
    aiProvider: record.aiProvider,
  };
}

function normalizeAiProvider(value: unknown) {
  if (value === "gemini" || value === "huggingface" || value === "local") {
    return value;
  }

  return "local";
}

function normalizeBand(value: unknown): PpapBandLabel {
  if (
    value === "STRONG SIGNAL" ||
    value === "POSITIVE SIGNAL" ||
    value === "MIXED SIGNAL" ||
    value === "WEAK SIGNAL"
  ) {
    return value as PpapBandLabel;
  }

  return "WEAK SIGNAL";
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeResponses(value: unknown) {
  const json = normalizeJsonObject(value);
  const responses: Record<string, number> = {};

  for (const [key, rawValue] of Object.entries(json)) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      continue;
    }

    responses[key] = clamp(Math.round(rawValue), 1, 5);
  }

  return responses;
}

function normalizeScores(value: unknown) {
  const json = normalizeJsonObject(value) as Partial<PpapAssessmentScores>;

  return {
    ...json,
    tendencyScores: Array.isArray(json.tendencyScores) ? json.tendencyScores : [],
    questionScores: Array.isArray(json.questionScores) ? json.questionScores : [],
    overallScore:
      typeof json.overallScore === "number"
        ? json.overallScore
        : Number(json.overallScore || 0),
    band: normalizeBand(json.band),
    socialDesirabilityFlag: Boolean(json.socialDesirabilityFlag),
  } as PpapAssessmentScores;
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatStoreWarning(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type PpapSubmissionRow = QueryResultRow & {
  ai_provider: string;
  ai_provider_detail: string;
  admin_report: string;
  band: string;
  brand: string;
  candidate_summary: string;
  created_at: Date | string;
  email: string | null;
  full_name: string;
  id: string;
  overall_score: number | string;
  responses: Record<string, unknown>;
  role_applied: string;
  scores: Record<string, unknown>;
  social_desirability_flag: boolean;
  workspace_id: string;
};
