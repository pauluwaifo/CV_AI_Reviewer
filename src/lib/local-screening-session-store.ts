import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

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

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "screening-sessions.json");

type ScreeningSessionStoreData = {
  sessions: StoredAnalysisSession[];
};

const EMPTY_STORE: ScreeningSessionStoreData = {
  sessions: [],
};

export async function listLocalScreeningSessions(workspaceId: string) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store.sessions
    .filter((session) => session.workspaceId === scopedWorkspaceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createLocalScreeningSession({
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
  const store = await readStore();
  const session: StoredAnalysisSession = {
    id: randomUUID(),
    workspaceId: sanitizeWorkspaceId(workspaceId),
    analysisGoal,
    createdAt: new Date().toISOString(),
    documentType: normalizeDocumentType(documentType),
    provider: normalizeAnalysisProvider(provider),
    recruiterNotes: "",
    recruiterStatus: "New",
    roleSetup: normalizeRoleSetup(roleSetup),
    response,
  };

  store.sessions.unshift(session);
  await writeStore(store);

  return session;
}

export async function updateLocalScreeningSessionWorkflow({
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
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const index = store.sessions.findIndex(
    (session) =>
      session.id === screeningId && session.workspaceId === scopedWorkspaceId
  );

  if (index < 0) {
    return null;
  }

  const updated: StoredAnalysisSession = {
    ...store.sessions[index],
    recruiterNotes,
    recruiterStatus: normalizeRecruiterStatus(recruiterStatus),
  };
  store.sessions.splice(index, 1, updated);
  await writeStore(store);
  return updated;
}

export async function deleteLocalScreeningSession(
  screeningId: string,
  workspaceId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextSessions = store.sessions.filter(
    (session) =>
      !(session.id === screeningId && session.workspaceId === scopedWorkspaceId)
  );

  if (nextSessions.length === store.sessions.length) {
    return false;
  }

  await writeStore({
    sessions: nextSessions,
  });

  return true;
}

export async function readLocalScreeningSessionStoreForMigration() {
  return readStore();
}

export async function deleteLocalWorkspaceScreeningSessions(workspaceId: string) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextSessions = store.sessions.filter(
    (session) => session.workspaceId !== scopedWorkspaceId
  );

  if (nextSessions.length === store.sessions.length) {
    return false;
  }

  await writeStore({ sessions: nextSessions });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<ScreeningSessionStoreData>;

    return {
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map((item) => normalizeStoredSession(item))
            .filter((item): item is StoredAnalysisSession => item !== null)
        : [],
    } satisfies ScreeningSessionStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return EMPTY_STORE;
  }
}

async function writeStore(store: ScreeningSessionStoreData) {
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

function normalizeStoredSession(value: unknown): StoredAnalysisSession | null {
  const parsed = value as Partial<StoredAnalysisSession>;

  if (!parsed || typeof parsed.id !== "string" || !parsed.id.trim()) {
    return null;
  }

  return {
    id: parsed.id.trim(),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    analysisGoal: typeof parsed.analysisGoal === "string" ? parsed.analysisGoal : "",
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    documentType: normalizeDocumentType(parsed.documentType),
    provider: normalizeAnalysisProvider(parsed.provider),
    recruiterNotes:
      typeof parsed.recruiterNotes === "string" ? parsed.recruiterNotes : "",
    recruiterStatus: normalizeRecruiterStatus(parsed.recruiterStatus),
    roleSetup: normalizeRoleSetup(parsed.roleSetup),
    response: parsed.response as StoredAnalysisSession["response"],
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
