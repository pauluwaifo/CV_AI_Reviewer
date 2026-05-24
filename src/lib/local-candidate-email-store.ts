import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CandidateEmailDraftRecord } from "@/types/candidate-email";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "candidate-email-drafts.json");

type CandidateEmailStoreData = {
  drafts: CandidateEmailDraftRecord[];
};

const EMPTY_STORE: CandidateEmailStoreData = {
  drafts: [],
};

export async function listLocalCandidateEmailDraftsForApplication(
  workspaceId: string,
  applicationId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store.drafts
    .filter(
      (item) =>
        item.workspaceId === scopedWorkspaceId && item.applicationId === applicationId.trim()
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getLocalCandidateEmailDraft(
  draftId: string,
  workspaceId?: string
) {
  const store = await readStore();
  const trimmedDraftId = draftId.trim();

  if (!trimmedDraftId) {
    return null;
  }

  if (!workspaceId) {
    return store.drafts.find((item) => item.id === trimmedDraftId) ?? null;
  }

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  return (
    store.drafts.find(
      (item) => item.id === trimmedDraftId && item.workspaceId === scopedWorkspaceId
    ) ?? null
  );
}

export async function getLocalCandidateEmailDraftByApprovalTokenHash(
  approvalTokenHash: string
) {
  const store = await readStore();
  const trimmedTokenHash = approvalTokenHash.trim();

  if (!trimmedTokenHash) {
    return null;
  }

  return (
    store.drafts.find((item) => item.approvalTokenHash === trimmedTokenHash) ?? null
  );
}

export async function createLocalCandidateEmailDraft(record: CandidateEmailDraftRecord) {
  const store = await readStore();
  const nextRecord = normalizeRecord(record);

  if (!nextRecord) {
    throw new Error("Candidate email draft is invalid.");
  }

  store.drafts = [nextRecord, ...store.drafts.filter((item) => item.id !== nextRecord.id)];
  await writeStore(store);
  return nextRecord;
}

export async function updateLocalCandidateEmailDraft(record: CandidateEmailDraftRecord) {
  const store = await readStore();
  const nextRecord = normalizeRecord(record);

  if (!nextRecord) {
    throw new Error("Candidate email draft is invalid.");
  }

  const nextDrafts = store.drafts.filter((item) => item.id !== nextRecord.id);

  nextDrafts.unshift(nextRecord);
  await writeStore({ drafts: nextDrafts });
  return nextRecord;
}

export async function deleteLocalCandidateEmailDraftsByWorkspaceId(workspaceId: string) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextDrafts = store.drafts.filter((item) => item.workspaceId !== scopedWorkspaceId);

  if (nextDrafts.length === store.drafts.length) {
    return false;
  }

  await writeStore({ drafts: nextDrafts });
  return true;
}

export async function deleteLocalCandidateEmailDraftsByApplicationId(
  workspaceId: string,
  applicationId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const trimmedApplicationId = applicationId.trim();
  const nextDrafts = store.drafts.filter(
    (item) =>
      !(
        item.workspaceId === scopedWorkspaceId &&
        item.applicationId === trimmedApplicationId
      )
  );

  if (nextDrafts.length === store.drafts.length) {
    return false;
  }

  await writeStore({ drafts: nextDrafts });
  return true;
}

export async function deleteLocalCandidateEmailDraftsByFormId(
  workspaceId: string,
  formId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const trimmedFormId = formId.trim();
  const nextDrafts = store.drafts.filter(
    (item) => !(item.workspaceId === scopedWorkspaceId && item.formId === trimmedFormId)
  );

  if (nextDrafts.length === store.drafts.length) {
    return false;
  }

  await writeStore({ drafts: nextDrafts });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<CandidateEmailStoreData>;

    return {
      drafts: Array.isArray(parsed.drafts)
        ? parsed.drafts
            .map((item) => normalizeRecord(item))
            .filter((item): item is CandidateEmailDraftRecord => item !== null)
        : [],
    } satisfies CandidateEmailStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: CandidateEmailStoreData) {
  await ensureStoreReady();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function ensureStoreReady() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await stat(STORE_FILE);
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }
}

function normalizeRecord(value: unknown): CandidateEmailDraftRecord | null {
  const parsed = value as Partial<CandidateEmailDraftRecord>;

  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.applicationId !== "string" ||
    !parsed.applicationId.trim() ||
    typeof parsed.formId !== "string" ||
    !parsed.formId.trim() ||
    typeof parsed.candidateEmail !== "string" ||
    !parsed.candidateEmail.trim() ||
    typeof parsed.subject !== "string" ||
    typeof parsed.body !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id.trim(),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    applicationId: parsed.applicationId.trim(),
    formId: parsed.formId.trim(),
    candidateName:
      typeof parsed.candidateName === "string" ? parsed.candidateName.trim() : "",
    candidateEmail: parsed.candidateEmail.trim().toLowerCase(),
    kind: parsed.kind === "follow_up" ? "follow_up" : "rejection",
    status:
      parsed.status === "pending_approval" || parsed.status === "sent" || parsed.status === "cancelled"
        ? parsed.status
        : "draft",
    subject: parsed.subject.trim(),
    body: parsed.body,
    prompt: typeof parsed.prompt === "string" ? parsed.prompt.trim() : "",
    provider:
      parsed.provider === "gemini" ||
      parsed.provider === "huggingface" ||
      parsed.provider === "local"
        ? parsed.provider
        : null,
    providerDetail:
      typeof parsed.providerDetail === "string" ? parsed.providerDetail.trim() : "",
    providerWarnings: Array.isArray(parsed.providerWarnings)
      ? parsed.providerWarnings.filter((item): item is string => typeof item === "string")
      : [],
    requestedByEmail:
      typeof parsed.requestedByEmail === "string"
        ? parsed.requestedByEmail.trim().toLowerCase()
        : "",
    requestedByRole: parsed.requestedByRole === "admin" ? "admin" : "member",
    approvalRequestedAt:
      typeof parsed.approvalRequestedAt === "string" && parsed.approvalRequestedAt.trim()
        ? parsed.approvalRequestedAt
        : null,
    approvalRequestedByEmail:
      typeof parsed.approvalRequestedByEmail === "string"
        ? parsed.approvalRequestedByEmail.trim().toLowerCase()
        : "",
    approvalTokenHash:
      typeof parsed.approvalTokenHash === "string" ? parsed.approvalTokenHash.trim() : "",
    approvalTokenExpiresAt:
      typeof parsed.approvalTokenExpiresAt === "string" && parsed.approvalTokenExpiresAt.trim()
        ? parsed.approvalTokenExpiresAt
        : null,
    approvedAt:
      typeof parsed.approvedAt === "string" && parsed.approvedAt.trim()
        ? parsed.approvedAt
        : null,
    approvedByEmail:
      typeof parsed.approvedByEmail === "string"
        ? parsed.approvedByEmail.trim().toLowerCase()
        : "",
    approvedVia: parsed.approvedVia === "web" || parsed.approvedVia === "email"
      ? parsed.approvedVia
      : null,
    sentAt:
      typeof parsed.sentAt === "string" && parsed.sentAt.trim() ? parsed.sentAt : null,
    deliverySource:
      parsed.deliverySource === "workspace" ||
      parsed.deliverySource === "global" ||
      parsed.deliverySource === "none"
        ? parsed.deliverySource
        : null,
    deliveryProvider: parsed.deliveryProvider === "gmail" ? "gmail" : null,
    deliveryMessageId:
      typeof parsed.deliveryMessageId === "string" ? parsed.deliveryMessageId.trim() : "",
    deliveryFromEmail:
      typeof parsed.deliveryFromEmail === "string"
        ? parsed.deliveryFromEmail.trim().toLowerCase()
        : "",
    lastError: typeof parsed.lastError === "string" ? parsed.lastError.trim() : "",
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim()
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString(),
  };
}

function buildEmptyStore(): CandidateEmailStoreData {
  return {
    drafts: [],
  };
}
