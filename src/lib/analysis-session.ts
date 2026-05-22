import type {
  AnalysisResponse,
  AnalysisProvider,
  DocumentType,
  RecruiterStatus,
  RoleSetup,
} from "@/types/document-intelligence";
import type { StoredAnalysisSession } from "@/types/analysis-session";
import {
  getWorkspaceScopedStorageKey,
  getWorkspaceStorageNamespaceFromWindow,
} from "@/lib/workspace-settings";

const LATEST_STORAGE_KEY = "briefboard:last-analysis";
const HISTORY_STORAGE_KEY = "briefboard:analysis-history";
const MAX_HISTORY_ITEMS = 8;
const listeners = new Set<() => void>();
let cachedLatestRawSession: string | null | undefined;
let cachedLatestParsedSession: StoredAnalysisSession | null = null;
let cachedHistoryRawSession: string | null | undefined;
let cachedHistoryParsedSession: StoredAnalysisSession[] | null = null;
let hasAttachedStorageListener = false;

export function saveAnalysisSession(
  session: Omit<StoredAnalysisSession, "id"> | StoredAnalysisSession
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedSession: StoredAnalysisSession = {
    ...session,
    id: ("id" in session && typeof session.id === "string" ? session.id : "") || buildAnalysisSessionId(session),
  };
  const serialized = JSON.stringify(normalizedSession);

  cachedLatestRawSession = serialized;
  cachedLatestParsedSession = normalizedSession;
  window.sessionStorage.setItem(getLatestStorageKey(), serialized);

  const history = loadAnalysisHistory() ?? [];
  const nextHistory = [normalizedSession, ...history.filter((item) => item.id !== normalizedSession.id)]
    .slice(0, MAX_HISTORY_ITEMS);
  const serializedHistory = JSON.stringify(nextHistory);
  cachedHistoryRawSession = serializedHistory;
  cachedHistoryParsedSession = nextHistory;
  window.localStorage.setItem(getHistoryStorageKey(), serializedHistory);
  emitChange();
}

export function loadAnalysisSession() {
  return parseAnalysisSessionSnapshot(getAnalysisSessionStorageSnapshot());
}

export function getAnalysisSessionStorageSnapshot() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.sessionStorage.getItem(getLatestStorageKey());
}

export function parseAnalysisSessionSnapshot(
  raw: string | null | undefined
): StoredAnalysisSession | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === cachedLatestRawSession) {
    return cachedLatestParsedSession;
  }

  if (!raw) {
    cachedLatestRawSession = null;
    cachedLatestParsedSession = null;
    return null;
  }

  try {
    const parsed = normalizeStoredSession(JSON.parse(raw));
    cachedLatestRawSession = raw;
    cachedLatestParsedSession = parsed;
    return parsed;
  } catch {
    window.sessionStorage.removeItem(getLatestStorageKey());
    cachedLatestRawSession = null;
    cachedLatestParsedSession = null;
    return null;
  }
}

export function clearAnalysisSession() {
  if (typeof window === "undefined") {
    return;
  }

  cachedLatestRawSession = null;
  cachedLatestParsedSession = null;
  window.sessionStorage.removeItem(getLatestStorageKey());
  emitChange();
}

export function setLatestAnalysisSession(
  session: Omit<StoredAnalysisSession, "id"> | StoredAnalysisSession
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedSession: StoredAnalysisSession = {
    ...session,
    id: ("id" in session && typeof session.id === "string" ? session.id : "") || buildAnalysisSessionId(session),
  };
  const serialized = JSON.stringify(normalizedSession);
  cachedLatestRawSession = serialized;
  cachedLatestParsedSession = normalizedSession;
  window.sessionStorage.setItem(getLatestStorageKey(), serialized);
  emitChange();
}

export function loadAnalysisHistory() {
  return parseAnalysisHistorySnapshot(getAnalysisHistoryStorageSnapshot());
}

export function getAnalysisHistoryStorageSnapshot() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem(getHistoryStorageKey());
}

export function parseAnalysisHistorySnapshot(
  raw: string | null | undefined
): StoredAnalysisSession[] | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === cachedHistoryRawSession) {
    return cachedHistoryParsedSession;
  }

  if (!raw) {
    cachedHistoryRawSession = null;
    cachedHistoryParsedSession = [];
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? parsed
          .map((item) => normalizeStoredSession(item))
          .filter((item): item is StoredAnalysisSession => Boolean(item))
      : [];

    cachedHistoryRawSession = raw;
    cachedHistoryParsedSession = normalized;
    return normalized;
  } catch {
    window.localStorage.removeItem(getHistoryStorageKey());
    cachedHistoryRawSession = null;
    cachedHistoryParsedSession = [];
    return [];
  }
}

export function clearAnalysisHistory() {
  if (typeof window === "undefined") {
    return;
  }

  cachedHistoryRawSession = null;
  cachedHistoryParsedSession = [];
  window.localStorage.removeItem(getHistoryStorageKey());
  emitChange();
}

export function deleteAnalysisHistoryItem(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const latest = loadAnalysisSession();
  const history = loadAnalysisHistory() ?? [];
  const nextHistory = history.filter((item) => item.id !== sessionId);
  const serializedHistory = JSON.stringify(nextHistory);

  cachedHistoryRawSession = serializedHistory;
  cachedHistoryParsedSession = nextHistory;
  window.localStorage.setItem(getHistoryStorageKey(), serializedHistory);

  if (latest?.id === sessionId) {
    cachedLatestRawSession = null;
    cachedLatestParsedSession = null;
    window.sessionStorage.removeItem(getLatestStorageKey());
  }

  emitChange();
}

export function updateAnalysisSessionWorkflow(
  sessionId: string,
  updates: Partial<Pick<StoredAnalysisSession, "recruiterNotes" | "recruiterStatus">>
) {
  if (typeof window === "undefined") {
    return;
  }

  const latest = loadAnalysisSession();
  const history = loadAnalysisHistory() ?? [];

  const nextLatest =
    latest && latest.id === sessionId
      ? normalizeStoredSession({
          ...latest,
          ...updates,
        })
      : latest;

  const nextHistory = history.map((item) =>
    item.id === sessionId
      ? normalizeStoredSession({
          ...item,
          ...updates,
        })
      : item
  );

  if (nextLatest) {
    const serializedLatest = JSON.stringify(nextLatest);
    cachedLatestRawSession = serializedLatest;
    cachedLatestParsedSession = nextLatest;
    window.sessionStorage.setItem(getLatestStorageKey(), serializedLatest);
  }

  const serializedHistory = JSON.stringify(nextHistory);
  cachedHistoryRawSession = serializedHistory;
  cachedHistoryParsedSession = nextHistory;
  window.localStorage.setItem(getHistoryStorageKey(), serializedHistory);
  emitChange();
}

export function subscribeAnalysisSession(listener: () => void) {
  listeners.add(listener);
  attachStorageListener();

  return () => {
    listeners.delete(listener);
  };
}

export function getServerAnalysisSessionSnapshot() {
  return undefined;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function attachStorageListener() {
  if (typeof window === "undefined" || hasAttachedStorageListener) {
    return;
  }

  window.addEventListener("storage", handleStorageChange);
  hasAttachedStorageListener = true;
}

function handleStorageChange(event: StorageEvent) {
  if (
    event.key === getLatestStorageKey() ||
    event.key === getHistoryStorageKey()
  ) {
    emitChange();
  }
}

function normalizeStoredSession(value: unknown): StoredAnalysisSession {
  const parsed = value as Partial<StoredAnalysisSession>;

  return {
    id: parsed.id || buildAnalysisSessionId(parsed),
    workspaceId:
      typeof parsed.workspaceId === "string" && parsed.workspaceId.trim()
        ? parsed.workspaceId
        : getWorkspaceStorageNamespaceFromWindow(),
    analysisGoal: typeof parsed.analysisGoal === "string" ? parsed.analysisGoal : "",
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    documentType:
      typeof parsed.documentType === "string"
        ? (parsed.documentType as DocumentType)
        : "cv",
    provider:
      typeof parsed.provider === "string"
        ? (parsed.provider as AnalysisProvider)
        : "auto",
    recruiterNotes:
      typeof parsed.recruiterNotes === "string" ? parsed.recruiterNotes : "",
    recruiterStatus:
      typeof parsed.recruiterStatus === "string"
        ? (parsed.recruiterStatus as RecruiterStatus)
        : "New",
    roleSetup: normalizeRoleSetup(parsed.roleSetup),
    response: parsed.response as AnalysisResponse,
  };
}

function buildAnalysisSessionId(value: Partial<StoredAnalysisSession>) {
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "unknown";
  const fileName =
    typeof value.response?.meta?.fileName === "string"
      ? value.response.meta.fileName
      : "candidate";

  return `${createdAt}:${fileName}`;
}

function getLatestStorageKey() {
  return getWorkspaceScopedStorageKey(
    LATEST_STORAGE_KEY,
    getWorkspaceStorageNamespaceFromWindow()
  );
}

function getHistoryStorageKey() {
  return getWorkspaceScopedStorageKey(
    HISTORY_STORAGE_KEY,
    getWorkspaceStorageNamespaceFromWindow()
  );
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
