import "server-only";

import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";

import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export type WorkspaceBillingTransactionStatus =
  | "pending"
  | "success"
  | "failed"
  | "abandoned";

export type WorkspaceBillingTransactionRecord = {
  id: string;
  workspaceId: string;
  reference: string;
  provider: "paystack";
  status: WorkspaceBillingTransactionStatus;
  amountKobo: number;
  currency: string;
  payerEmail: string;
  authorizationUrl: string;
  accessCode: string;
  paidAt: string | null;
  providerPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const localTransactions = new Map<string, WorkspaceBillingTransactionRecord[]>();

export async function createWorkspaceBillingTransaction(input: {
  workspaceId: string;
  reference: string;
  amountKobo: number;
  currency: string;
  payerEmail: string;
  authorizationUrl: string;
  accessCode: string;
  providerPayload?: Record<string, unknown>;
}) {
  const workspaceId = sanitizeWorkspaceId(input.workspaceId);
  const timestamp = new Date().toISOString();
  const record: WorkspaceBillingTransactionRecord = {
    id: randomUUID(),
    workspaceId,
    reference: input.reference.trim(),
    provider: "paystack",
    status: "pending",
    amountKobo: Math.max(0, Math.round(input.amountKobo)),
    currency: input.currency.trim().toUpperCase() || "NGN",
    payerEmail: input.payerEmail.trim().toLowerCase(),
    authorizationUrl: input.authorizationUrl.trim(),
    accessCode: input.accessCode.trim(),
    paidAt: null,
    providerPayload: input.providerPayload ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!isPostgresConfigured()) {
    const existing = localTransactions.get(workspaceId) ?? [];
    localTransactions.set(workspaceId, [record, ...existing]);
    return record;
  }

  const result = await queryPostgres<WorkspaceBillingTransactionRow>(
    `
      INSERT INTO workspace_billing_transactions (
        id,
        workspace_id,
        reference,
        provider,
        status,
        amount_kobo,
        currency,
        payer_email,
        authorization_url,
        access_code,
        provider_payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'paystack', 'pending', $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
      RETURNING *
    `,
    [
      record.id,
      workspaceId,
      record.reference,
      record.amountKobo,
      record.currency,
      record.payerEmail,
      record.authorizationUrl,
      record.accessCode,
      JSON.stringify(record.providerPayload),
    ]
  );

  return toWorkspaceBillingTransactionRecord(result.rows[0]);
}

export async function updateWorkspaceBillingTransactionByReference(
  reference: string,
  updates: Partial<
    Pick<
      WorkspaceBillingTransactionRecord,
      "status" | "authorizationUrl" | "accessCode" | "paidAt" | "providerPayload"
    >
  >
) {
  const normalizedReference = reference.trim();

  if (!isPostgresConfigured()) {
    for (const [workspaceId, records] of localTransactions.entries()) {
      const index = records.findIndex((item) => item.reference === normalizedReference);

      if (index >= 0) {
        const updatedRecord = {
          ...records[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        } satisfies WorkspaceBillingTransactionRecord;
        const nextRecords = [...records];
        nextRecords.splice(index, 1, updatedRecord);
        localTransactions.set(workspaceId, nextRecords);
        return updatedRecord;
      }
    }

    return null;
  }

  const current = await getWorkspaceBillingTransactionByReference(normalizedReference);

  if (!current) {
    return null;
  }

  const result = await queryPostgres<WorkspaceBillingTransactionRow>(
    `
      UPDATE workspace_billing_transactions
      SET status = $2,
          authorization_url = $3,
          access_code = $4,
          paid_at = $5::timestamptz,
          provider_payload = $6::jsonb,
          updated_at = NOW()
      WHERE reference = $1
      RETURNING *
    `,
    [
      normalizedReference,
      updates.status ?? current.status,
      updates.authorizationUrl ?? current.authorizationUrl,
      updates.accessCode ?? current.accessCode,
      updates.paidAt ?? current.paidAt,
      JSON.stringify(updates.providerPayload ?? current.providerPayload),
    ]
  );

  return result.rows[0] ? toWorkspaceBillingTransactionRecord(result.rows[0]) : null;
}

export async function getWorkspaceBillingTransactionByReference(reference: string) {
  const normalizedReference = reference.trim();

  if (!isPostgresConfigured()) {
    for (const records of localTransactions.values()) {
      const match = records.find((item) => item.reference === normalizedReference);
      if (match) {
        return match;
      }
    }

    return null;
  }

  const result = await queryPostgres<WorkspaceBillingTransactionRow>(
    `
      SELECT *
      FROM workspace_billing_transactions
      WHERE reference = $1
      LIMIT 1
    `,
    [normalizedReference]
  );

  return result.rows[0] ? toWorkspaceBillingTransactionRecord(result.rows[0]) : null;
}

export async function listWorkspaceBillingTransactions(workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!isPostgresConfigured()) {
    return [...(localTransactions.get(normalizedWorkspaceId) ?? [])].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  const result = await queryPostgres<WorkspaceBillingTransactionRow>(
    `
      SELECT *
      FROM workspace_billing_transactions
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `,
    [normalizedWorkspaceId]
  );

  return result.rows.map(toWorkspaceBillingTransactionRecord);
}

function toWorkspaceBillingTransactionRecord(
  row: WorkspaceBillingTransactionRow
): WorkspaceBillingTransactionRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    reference: row.reference,
    provider: "paystack",
    status: normalizeTransactionStatus(row.status),
    amountKobo: row.amount_kobo,
    currency: row.currency,
    payerEmail: row.payer_email,
    authorizationUrl: row.authorization_url,
    accessCode: row.access_code,
    paidAt: toIsoString(row.paid_at),
    providerPayload: normalizeProviderPayload(row.provider_payload),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function normalizeTransactionStatus(value: string): WorkspaceBillingTransactionStatus {
  return value === "success" || value === "failed" || value === "abandoned"
    ? value
    : "pending";
}

function normalizeProviderPayload(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type WorkspaceBillingTransactionRow = QueryResultRow & {
  access_code: string;
  amount_kobo: number;
  authorization_url: string;
  created_at: Date | string;
  currency: string;
  id: string;
  paid_at: Date | string | null;
  payer_email: string;
  provider_payload: Record<string, unknown> | null;
  reference: string;
  status: string;
  updated_at: Date | string;
  workspace_id: string;
};
