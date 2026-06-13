import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type {
  PpapBandLabel,
  PpapCandidateSubmissionRecord,
  PpapSubmissionSummary,
} from "@/types/ppap";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "ppap-submissions.json");

type PpapStoreData = {
  candidates: PpapCandidateSubmissionRecord[];
};

const EMPTY_STORE: PpapStoreData = {
  candidates: [],
};

export async function listLocalPpapSubmissions(workspaceId: string) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store.candidates
    .filter((item) => item.workspaceId === scopedWorkspaceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listLocalPpapSubmissionSummaries(workspaceId: string) {
  const submissions = await listLocalPpapSubmissions(workspaceId);
  return submissions.map(toSummary);
}

export async function getLocalPpapSubmission(
  workspaceId: string,
  submissionId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const trimmedSubmissionId = submissionId.trim();

  if (!trimmedSubmissionId) {
    return null;
  }

  return (
    store.candidates.find(
      (item) =>
        item.id === trimmedSubmissionId && item.workspaceId === scopedWorkspaceId
    ) ?? null
  );
}

export async function createLocalPpapSubmission(
  record: PpapCandidateSubmissionRecord
) {
  const store = await readStore();
  const nextRecord = normalizeRecord(record);

  if (!nextRecord) {
    throw new Error("PPAP submission is invalid.");
  }

  store.candidates = [
    nextRecord,
    ...store.candidates.filter((item) => item.id !== nextRecord.id),
  ];
  await writeStore(store);

  return nextRecord;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<PpapStoreData>;

    return {
      candidates: Array.isArray(parsed.candidates)
        ? parsed.candidates
            .map((item) => normalizeRecord(item))
            .filter((item): item is PpapCandidateSubmissionRecord => item !== null)
        : [],
    } satisfies PpapStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: PpapStoreData) {
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

function normalizeRecord(value: unknown): PpapCandidateSubmissionRecord | null {
  const parsed = value as Partial<PpapCandidateSubmissionRecord>;

  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.createdAt !== "string" ||
    !parsed.createdAt.trim() ||
    typeof parsed.fullName !== "string" ||
    !parsed.fullName.trim() ||
    typeof parsed.roleApplied !== "string" ||
    !parsed.roleApplied.trim() ||
    typeof parsed.brand !== "string" ||
    !parsed.brand.trim() ||
    typeof parsed.responses !== "object" ||
    parsed.responses === null ||
    typeof parsed.scores !== "object" ||
    parsed.scores === null ||
    typeof parsed.overallScore !== "number" ||
    !Number.isFinite(parsed.overallScore) ||
    typeof parsed.adminReport !== "string" ||
    typeof parsed.candidateSummary !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id.trim(),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    createdAt: parsed.createdAt,
    fullName: parsed.fullName.trim(),
    email:
      typeof parsed.email === "string" && parsed.email.trim()
        ? parsed.email.trim().toLowerCase()
        : null,
    roleApplied: parsed.roleApplied.trim(),
    brand: normalizeBrand(parsed.brand),
    responses: parsed.responses as Record<string, number>,
    scores: parsed.scores as PpapCandidateSubmissionRecord["scores"],
    overallScore: parsed.overallScore,
    band:
      typeof parsed.band === "string" && parsed.band.trim()
        ? normalizeBand(parsed.band)
        : parsed.scores && typeof parsed.scores === "object" && "band" in parsed.scores
          ? normalizeBand((parsed.scores as { band?: unknown }).band)
          : "WEAK SIGNAL",
    adminReport: parsed.adminReport.trim(),
    candidateSummary: parsed.candidateSummary.trim(),
    socialDesirabilityFlag: Boolean(parsed.socialDesirabilityFlag),
    aiProvider: normalizeAiProvider(parsed.aiProvider),
    aiProviderDetail:
      typeof parsed.aiProviderDetail === "string" ? parsed.aiProviderDetail.trim() : "",
  };
}

function normalizeBrand(value: string) {
  const normalized = value.trim();

  return normalized === "ICF" ||
    normalized === "YYE" ||
    normalized === "Back Office" ||
    normalized === "Multiple"
    ? normalized
    : "Multiple";
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

function buildEmptyStore(): PpapStoreData {
  return {
    candidates: [],
  };
}
