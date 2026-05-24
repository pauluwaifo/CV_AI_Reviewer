import "server-only";

import type { QueryResultRow } from "pg";

import {
  createLocalCandidateEmailDraft,
  deleteLocalCandidateEmailDraftsByApplicationId,
  deleteLocalCandidateEmailDraftsByFormId,
  deleteLocalCandidateEmailDraftsByWorkspaceId,
  getLocalCandidateEmailDraft,
  getLocalCandidateEmailDraftByApprovalTokenHash,
  listLocalCandidateEmailDraftsForApplication,
  updateLocalCandidateEmailDraft,
} from "@/lib/local-candidate-email-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type { CandidateEmailDraftRecord } from "@/types/candidate-email";

export async function listCandidateEmailDraftsForApplication(
  workspaceId: string,
  applicationId: string
) {
  if (!isPostgresConfigured()) {
    return listLocalCandidateEmailDraftsForApplication(workspaceId, applicationId);
  }

  const result = await queryPostgres<CandidateEmailDraftRow>(
    `
      SELECT *
      FROM candidate_email_drafts
      WHERE workspace_id = $1 AND application_id = $2
      ORDER BY updated_at DESC, created_at DESC
    `,
    [sanitizeWorkspaceId(workspaceId), applicationId.trim()]
  );

  return result.rows.map(toCandidateEmailDraftRecord);
}

export async function getCandidateEmailDraft(
  draftId: string,
  workspaceId?: string
) {
  if (!isPostgresConfigured()) {
    return getLocalCandidateEmailDraft(draftId, workspaceId);
  }

  const trimmedDraftId = draftId.trim();

  if (!trimmedDraftId) {
    return null;
  }

  const result = workspaceId
    ? await queryPostgres<CandidateEmailDraftRow>(
        `
          SELECT *
          FROM candidate_email_drafts
          WHERE id = $1 AND workspace_id = $2
          LIMIT 1
        `,
        [trimmedDraftId, sanitizeWorkspaceId(workspaceId)]
      )
    : await queryPostgres<CandidateEmailDraftRow>(
        `
          SELECT *
          FROM candidate_email_drafts
          WHERE id = $1
          LIMIT 1
        `,
        [trimmedDraftId]
      );

  return result.rows[0] ? toCandidateEmailDraftRecord(result.rows[0]) : null;
}

export async function getCandidateEmailDraftByApprovalTokenHash(
  approvalTokenHash: string
) {
  if (!isPostgresConfigured()) {
    return getLocalCandidateEmailDraftByApprovalTokenHash(approvalTokenHash);
  }

  const trimmedTokenHash = approvalTokenHash.trim();

  if (!trimmedTokenHash) {
    return null;
  }

  const result = await queryPostgres<CandidateEmailDraftRow>(
    `
      SELECT *
      FROM candidate_email_drafts
      WHERE approval_token_hash = $1
      LIMIT 1
    `,
    [trimmedTokenHash]
  );

  return result.rows[0] ? toCandidateEmailDraftRecord(result.rows[0]) : null;
}

export async function createCandidateEmailDraft(record: CandidateEmailDraftRecord) {
  if (!isPostgresConfigured()) {
    return createLocalCandidateEmailDraft(record);
  }

  const normalized = normalizeCandidateEmailDraftRecord(record);
  const result = await queryPostgres<CandidateEmailDraftRow>(
    `
      INSERT INTO candidate_email_drafts (
        id,
        workspace_id,
        application_id,
        form_id,
        candidate_name,
        candidate_email,
        kind,
        status,
        subject,
        body,
        prompt,
        provider,
        provider_detail,
        provider_warnings,
        requested_by_email,
        requested_by_role,
        approval_requested_at,
        approval_requested_by_email,
        approval_token_hash,
        approval_token_expires_at,
        approved_at,
        approved_by_email,
        approved_via,
        sent_at,
        delivery_source,
        delivery_provider,
        delivery_message_id,
        delivery_from_email,
        last_error,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb, $15, $16, $17::timestamptz, $18,
        $19, $20::timestamptz, $21::timestamptz, $22, $23, $24::timestamptz, $25,
        $26, $27, $28, $29, $30::timestamptz, $31::timestamptz
      )
      RETURNING *
    `,
    toInsertValues(normalized)
  );

  return toCandidateEmailDraftRecord(result.rows[0]);
}

export async function saveCandidateEmailDraft(record: CandidateEmailDraftRecord) {
  if (!isPostgresConfigured()) {
    return updateLocalCandidateEmailDraft(record);
  }

  const normalized = normalizeCandidateEmailDraftRecord(record);
  const result = await queryPostgres<CandidateEmailDraftRow>(
    `
      INSERT INTO candidate_email_drafts (
        id,
        workspace_id,
        application_id,
        form_id,
        candidate_name,
        candidate_email,
        kind,
        status,
        subject,
        body,
        prompt,
        provider,
        provider_detail,
        provider_warnings,
        requested_by_email,
        requested_by_role,
        approval_requested_at,
        approval_requested_by_email,
        approval_token_hash,
        approval_token_expires_at,
        approved_at,
        approved_by_email,
        approved_via,
        sent_at,
        delivery_source,
        delivery_provider,
        delivery_message_id,
        delivery_from_email,
        last_error,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb, $15, $16, $17::timestamptz, $18,
        $19, $20::timestamptz, $21::timestamptz, $22, $23, $24::timestamptz, $25,
        $26, $27, $28, $29, $30::timestamptz, $31::timestamptz
      )
      ON CONFLICT (id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          application_id = EXCLUDED.application_id,
          form_id = EXCLUDED.form_id,
          candidate_name = EXCLUDED.candidate_name,
          candidate_email = EXCLUDED.candidate_email,
          kind = EXCLUDED.kind,
          status = EXCLUDED.status,
          subject = EXCLUDED.subject,
          body = EXCLUDED.body,
          prompt = EXCLUDED.prompt,
          provider = EXCLUDED.provider,
          provider_detail = EXCLUDED.provider_detail,
          provider_warnings = EXCLUDED.provider_warnings,
          requested_by_email = EXCLUDED.requested_by_email,
          requested_by_role = EXCLUDED.requested_by_role,
          approval_requested_at = EXCLUDED.approval_requested_at,
          approval_requested_by_email = EXCLUDED.approval_requested_by_email,
          approval_token_hash = EXCLUDED.approval_token_hash,
          approval_token_expires_at = EXCLUDED.approval_token_expires_at,
          approved_at = EXCLUDED.approved_at,
          approved_by_email = EXCLUDED.approved_by_email,
          approved_via = EXCLUDED.approved_via,
          sent_at = EXCLUDED.sent_at,
          delivery_source = EXCLUDED.delivery_source,
          delivery_provider = EXCLUDED.delivery_provider,
          delivery_message_id = EXCLUDED.delivery_message_id,
          delivery_from_email = EXCLUDED.delivery_from_email,
          last_error = EXCLUDED.last_error,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    toInsertValues(normalized)
  );

  return toCandidateEmailDraftRecord(result.rows[0]);
}

export async function deleteCandidateEmailDraftsByWorkspaceId(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalCandidateEmailDraftsByWorkspaceId(workspaceId);
  }

  const result = await queryPostgres(
    `
      DELETE FROM candidate_email_drafts
      WHERE workspace_id = $1
    `,
    [sanitizeWorkspaceId(workspaceId)]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function deleteCandidateEmailDraftsByApplicationId(
  workspaceId: string,
  applicationId: string
) {
  if (!isPostgresConfigured()) {
    return deleteLocalCandidateEmailDraftsByApplicationId(workspaceId, applicationId);
  }

  const result = await queryPostgres(
    `
      DELETE FROM candidate_email_drafts
      WHERE workspace_id = $1 AND application_id = $2
    `,
    [sanitizeWorkspaceId(workspaceId), applicationId.trim()]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function deleteCandidateEmailDraftsByFormId(
  workspaceId: string,
  formId: string
) {
  if (!isPostgresConfigured()) {
    return deleteLocalCandidateEmailDraftsByFormId(workspaceId, formId);
  }

  const result = await queryPostgres(
    `
      DELETE FROM candidate_email_drafts
      WHERE workspace_id = $1 AND form_id = $2
    `,
    [sanitizeWorkspaceId(workspaceId), formId.trim()]
  );

  return (result.rowCount ?? 0) > 0;
}

function normalizeCandidateEmailDraftRecord(
  record: CandidateEmailDraftRecord
): CandidateEmailDraftRecord {
  const createdAt = record.createdAt?.trim() || new Date().toISOString();
  const updatedAt = record.updatedAt?.trim() || createdAt;

  return {
    ...record,
    workspaceId: sanitizeWorkspaceId(record.workspaceId),
    applicationId: record.applicationId.trim(),
    formId: record.formId.trim(),
    candidateName: record.candidateName.trim(),
    candidateEmail: record.candidateEmail.trim().toLowerCase(),
    kind: record.kind === "follow_up" ? "follow_up" : "rejection",
    status:
      record.status === "pending_approval" ||
      record.status === "sent" ||
      record.status === "cancelled"
        ? record.status
        : "draft",
    subject: record.subject.trim(),
    body: record.body,
    prompt: record.prompt.trim(),
    provider:
      record.provider === "gemini" ||
      record.provider === "huggingface" ||
      record.provider === "local"
        ? record.provider
        : null,
    providerDetail: record.providerDetail.trim(),
    providerWarnings: Array.isArray(record.providerWarnings)
      ? record.providerWarnings.filter((item) => typeof item === "string")
      : [],
    requestedByEmail: record.requestedByEmail.trim().toLowerCase(),
    requestedByRole: record.requestedByRole === "admin" ? "admin" : "member",
    approvalRequestedAt: record.approvalRequestedAt?.trim() || null,
    approvalRequestedByEmail: record.approvalRequestedByEmail.trim().toLowerCase(),
    approvalTokenHash: record.approvalTokenHash.trim(),
    approvalTokenExpiresAt: record.approvalTokenExpiresAt?.trim() || null,
    approvedAt: record.approvedAt?.trim() || null,
    approvedByEmail: record.approvedByEmail.trim().toLowerCase(),
    approvedVia:
      record.approvedVia === "web" || record.approvedVia === "email"
        ? record.approvedVia
        : null,
    sentAt: record.sentAt?.trim() || null,
    deliverySource:
      record.deliverySource === "workspace" ||
      record.deliverySource === "global" ||
      record.deliverySource === "none"
        ? record.deliverySource
        : null,
    deliveryProvider: record.deliveryProvider === "gmail" ? "gmail" : null,
    deliveryMessageId: record.deliveryMessageId.trim(),
    deliveryFromEmail: record.deliveryFromEmail.trim().toLowerCase(),
    lastError: record.lastError.trim(),
    createdAt,
    updatedAt,
  };
}

function toInsertValues(record: CandidateEmailDraftRecord) {
  return [
    record.id,
    record.workspaceId,
    record.applicationId,
    record.formId,
    record.candidateName,
    record.candidateEmail,
    record.kind,
    record.status,
    record.subject,
    record.body,
    record.prompt,
    record.provider,
    record.providerDetail,
    JSON.stringify(record.providerWarnings),
    record.requestedByEmail,
    record.requestedByRole,
    record.approvalRequestedAt,
    record.approvalRequestedByEmail,
    record.approvalTokenHash,
    record.approvalTokenExpiresAt,
    record.approvedAt,
    record.approvedByEmail,
    record.approvedVia,
    record.sentAt,
    record.deliverySource,
    record.deliveryProvider,
    record.deliveryMessageId,
    record.deliveryFromEmail,
    record.lastError,
    record.createdAt,
    record.updatedAt,
  ];
}

function toCandidateEmailDraftRecord(row: CandidateEmailDraftRow): CandidateEmailDraftRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    applicationId: row.application_id,
    formId: row.form_id,
    candidateName: row.candidate_name ?? "",
    candidateEmail: row.candidate_email ?? "",
    kind: row.kind === "follow_up" ? "follow_up" : "rejection",
    status:
      row.status === "pending_approval" ||
      row.status === "sent" ||
      row.status === "cancelled"
        ? row.status
        : "draft",
    subject: row.subject ?? "",
    body: row.body ?? "",
    prompt: row.prompt ?? "",
    provider:
      row.provider === "gemini" ||
      row.provider === "huggingface" ||
      row.provider === "local"
        ? row.provider
        : null,
    providerDetail: row.provider_detail ?? "",
    providerWarnings: Array.isArray(row.provider_warnings)
      ? row.provider_warnings.filter((item): item is string => typeof item === "string")
      : [],
    requestedByEmail: row.requested_by_email ?? "",
    requestedByRole: row.requested_by_role === "admin" ? "admin" : "member",
    approvalRequestedAt: toNullableIsoString(row.approval_requested_at),
    approvalRequestedByEmail: row.approval_requested_by_email ?? "",
    approvalTokenHash: row.approval_token_hash ?? "",
    approvalTokenExpiresAt: toNullableIsoString(row.approval_token_expires_at),
    approvedAt: toNullableIsoString(row.approved_at),
    approvedByEmail: row.approved_by_email ?? "",
    approvedVia:
      row.approved_via === "web" || row.approved_via === "email"
        ? row.approved_via
        : null,
    sentAt: toNullableIsoString(row.sent_at),
    deliverySource:
      row.delivery_source === "workspace" ||
      row.delivery_source === "global" ||
      row.delivery_source === "none"
        ? row.delivery_source
        : null,
    deliveryProvider: row.delivery_provider === "gmail" ? "gmail" : null,
    deliveryMessageId: row.delivery_message_id ?? "",
    deliveryFromEmail: row.delivery_from_email ?? "",
    lastError: row.last_error ?? "",
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoString(value: string | Date | null) {
  if (!value) {
    return null;
  }

  return toIsoString(value);
}

type CandidateEmailDraftRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  application_id: string;
  form_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  kind: string;
  status: string;
  subject: string | null;
  body: string | null;
  prompt: string | null;
  provider: string | null;
  provider_detail: string | null;
  provider_warnings: unknown;
  requested_by_email: string | null;
  requested_by_role: string | null;
  approval_requested_at: string | Date | null;
  approval_requested_by_email: string | null;
  approval_token_hash: string | null;
  approval_token_expires_at: string | Date | null;
  approved_at: string | Date | null;
  approved_by_email: string | null;
  approved_via: string | null;
  sent_at: string | Date | null;
  delivery_source: string | null;
  delivery_provider: string | null;
  delivery_message_id: string | null;
  delivery_from_email: string | null;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};
