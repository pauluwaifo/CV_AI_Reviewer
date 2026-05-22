import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export type AuthChallengePurpose = "workspace-signup" | "workspace-signin";

export type AuthChallengeRecord = {
  id: string;
  purpose: AuthChallengePurpose;
  workspaceId: string;
  email: string;
  codeHash: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

type AuthChallengeStoreData = {
  challenges: AuthChallengeRecord[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "auth-challenges.json");
const EMPTY_STORE: AuthChallengeStoreData = {
  challenges: [],
};

export async function createLocalAuthChallengeRecord(record: AuthChallengeRecord) {
  const store = await readStore();
  const normalized = normalizeRecord(record);

  if (!normalized) {
    throw new Error("The auth challenge record is missing required fields.");
  }

  store.challenges.unshift(normalized);
  await writeStore(store);

  return normalized;
}

export async function getLocalAuthChallengeRecordById(id: string) {
  const store = await readStore();
  const challengeId = id.trim();

  return store.challenges.find((item) => item.id === challengeId) ?? null;
}

export async function incrementLocalAuthChallengeAttempt(id: string) {
  const store = await readStore();
  const challengeId = id.trim();
  const index = store.challenges.findIndex((item) => item.id === challengeId);

  if (index < 0) {
    return null;
  }

  const updatedRecord: AuthChallengeRecord = {
    ...store.challenges[index],
    attemptCount: store.challenges[index].attemptCount + 1,
  };

  store.challenges.splice(index, 1, updatedRecord);
  await writeStore(store);

  return updatedRecord;
}

export async function consumeLocalAuthChallengeRecord(id: string) {
  const store = await readStore();
  const challengeId = id.trim();
  const index = store.challenges.findIndex((item) => item.id === challengeId);

  if (index < 0) {
    return null;
  }

  const updatedRecord: AuthChallengeRecord = {
    ...store.challenges[index],
    consumedAt: new Date().toISOString(),
  };

  store.challenges.splice(index, 1, updatedRecord);
  await writeStore(store);

  return updatedRecord;
}

export async function deleteLocalAuthChallengeRecordById(id: string) {
  const store = await readStore();
  const challengeId = id.trim();
  const nextChallenges = store.challenges.filter((item) => item.id !== challengeId);

  if (nextChallenges.length === store.challenges.length) {
    return false;
  }

  await writeStore({ challenges: nextChallenges });
  return true;
}

export async function clearLocalPendingAuthChallenges({
  purpose,
  workspaceId,
  email,
}: {
  purpose: AuthChallengePurpose;
  workspaceId: string;
  email: string;
}) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const nextChallenges = store.challenges.filter((item) => {
    const expiresAt = new Date(item.expiresAt).getTime();
    const isExpired = Number.isNaN(expiresAt) || expiresAt <= now;
    const isSamePendingChallenge =
      item.purpose === purpose &&
      item.workspaceId === normalizedWorkspaceId &&
      item.email === normalizedEmail &&
      !item.consumedAt &&
      !isExpired;

    return !isSamePendingChallenge;
  });

  if (nextChallenges.length !== store.challenges.length) {
    await writeStore({ challenges: nextChallenges });
  }
}

export async function deleteLocalAuthChallengesByWorkspaceId(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextChallenges = store.challenges.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextChallenges.length === store.challenges.length) {
    return false;
  }

  await writeStore({ challenges: nextChallenges });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<AuthChallengeStoreData>;

    return {
      challenges: Array.isArray(parsed.challenges)
        ? parsed.challenges
            .map((item) => normalizeRecord(item))
            .filter((item): item is AuthChallengeRecord => item !== null)
        : [],
    } satisfies AuthChallengeStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: AuthChallengeStoreData) {
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

function normalizeRecord(value: unknown): AuthChallengeRecord | null {
  const parsed = value as Partial<AuthChallengeRecord>;

  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    (parsed.purpose !== "workspace-signup" && parsed.purpose !== "workspace-signin") ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.email !== "string" ||
    !parsed.email.trim() ||
    typeof parsed.codeHash !== "string" ||
    !parsed.codeHash.trim()
  ) {
    return null;
  }

  return {
    id: parsed.id.trim(),
    purpose: parsed.purpose,
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    email: parsed.email.trim().toLowerCase(),
    codeHash: parsed.codeHash.trim(),
    payload: normalizePayload(parsed.payload),
    attemptCount: normalizePositiveInteger(parsed.attemptCount, 0),
    maxAttempts: normalizePositiveInteger(parsed.maxAttempts, 5),
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim()
        ? parsed.createdAt
        : new Date().toISOString(),
    expiresAt:
      typeof parsed.expiresAt === "string" && parsed.expiresAt.trim()
        ? parsed.expiresAt
        : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    consumedAt:
      typeof parsed.consumedAt === "string" && parsed.consumedAt.trim()
        ? parsed.consumedAt
        : null,
  };
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function buildEmptyStore(): AuthChallengeStoreData {
  return {
    challenges: [],
  };
}
