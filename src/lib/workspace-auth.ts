import "server-only";

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import {
  listWorkspaceMemberAccessRecords,
  updateWorkspaceMemberStatus,
  verifyMemberAccessKey,
} from "@/lib/workspace-members-store";
import {
  createWorkspaceSessionRecord,
  deleteWorkspaceSessionRecordByTokenHash,
  getWorkspaceSessionRecordByTokenHash,
} from "@/lib/workspace-session-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type {
  WorkspaceSession,
  WorkspaceSessionPrincipalType,
  WorkspaceSessionRecord,
  WorkspaceSessionRole,
} from "@/types/workspace-session";

export const WORKSPACE_SESSION_COOKIE_NAME = "hiring-workspace-session";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const EXTENDED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export type {
  WorkspaceSession,
  WorkspaceSessionPrincipalType,
  WorkspaceSessionRole,
} from "@/types/workspace-session";

export type WorkspaceAuthenticationResult = {
  workspaceId: string;
  role: WorkspaceSessionRole;
  principalType: WorkspaceSessionPrincipalType;
  email: string;
  memberId: string | null;
};

export async function getWorkspaceSession() {
  const cookieStore = await cookies();
  return readWorkspaceSessionFromCookieValue(
    cookieStore.get(WORKSPACE_SESSION_COOKIE_NAME)?.value ?? null
  );
}

export async function getWorkspaceSessionFromRequest(request: Request) {
  const cookieValue = getCookieValue(
    request.headers.get("cookie"),
    WORKSPACE_SESSION_COOKIE_NAME
  );

  return readWorkspaceSessionFromCookieValue(cookieValue);
}

export async function requireWorkspaceApiSession(request: Request) {
  const session = await getWorkspaceSessionFromRequest(request);

  if (!session) {
    return null;
  }

  return session;
}

export async function requireWorkspacePageSession(
  nextPath: string,
  options?: {
    role?: WorkspaceSessionRole;
  }
) {
  const session = await getWorkspaceSession();

  if (!session) {
    redirect(`/signin?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  if (options?.role && !workspaceSessionHasRole(session, options.role)) {
    redirect("/pipeline");
  }

  return session;
}

export async function createWorkspaceSession(
  auth: Pick<
    WorkspaceAuthenticationResult,
    "workspaceId" | "role" | "principalType" | "email" | "memberId"
  >,
  keepSignedIn: boolean,
  options?: {
    maxAgeSeconds?: number;
  }
) {
  const normalizedWorkspaceId = normalizeWorkspaceIdInput(auth.workspaceId);

  if (!normalizedWorkspaceId) {
    throw new Error("A valid workspace ID is required to create a session.");
  }
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds =
    options?.maxAgeSeconds && Number.isFinite(options.maxAgeSeconds)
      ? Math.max(60, Math.floor(options.maxAgeSeconds))
      : keepSignedIn
        ? EXTENDED_SESSION_MAX_AGE_SECONDS
        : DEFAULT_SESSION_MAX_AGE_SECONDS;
  const token = `ws_${randomBytes(32).toString("base64url")}`;
  const issuedAt = new Date(now * 1000).toISOString();
  const expiresAt = new Date((now + maxAgeSeconds) * 1000).toISOString();
  const session: WorkspaceSession = {
    workspaceId: normalizedWorkspaceId,
    role: normalizeWorkspaceRole(auth.role),
    principalType: normalizeWorkspacePrincipalType(auth.principalType),
    email: normalizeWorkspaceSessionEmail(auth.email),
    memberId: normalizeWorkspaceSessionMemberId(auth.memberId),
    issuedAt,
    expiresAt,
  };
  const record: WorkspaceSessionRecord = {
    ...session,
    tokenHash: hashWorkspaceSessionToken(token),
    createdAt: issuedAt,
  };

  await createWorkspaceSessionRecord(record);

  return {
    token,
    maxAgeSeconds,
    session,
  };
}

export async function authenticateWorkspaceCredentials(
  workspaceId: string,
  accessKey: string
) {
  const normalizedWorkspaceId = normalizeWorkspaceIdInput(workspaceId);
  const trimmedAccessKey = accessKey.trim();

  if (!normalizedWorkspaceId) {
    return null;
  }

  if (!trimmedAccessKey) {
    return null;
  }

  const managedRecord = await getWorkspaceAccessRecord(normalizedWorkspaceId);
  if (managedRecord && verifyWorkspaceAccessKey(trimmedAccessKey, managedRecord.accessKeyHash)) {
    return buildSharedWorkspaceAuthenticationResult(
      normalizedWorkspaceId,
      managedRecord.contactEmail
    );
  }

  return authenticateWorkspaceMember(normalizedWorkspaceId, trimmedAccessKey);
}

export function createWorkspaceUnauthorizedResponse() {
  return NextResponse.json(
    {
      error:
        "Sign in to an authorized workspace before accessing admin tools or candidate records.",
    },
    { status: 401 }
  );
}

export function createWorkspaceForbiddenResponse() {
  return NextResponse.json(
    {
      error:
        "You need workspace admin access to manage settings, member invites, or shared security controls.",
    },
    { status: 403 }
  );
}

export function isWorkspaceAdminSession(
  session: Pick<WorkspaceSession, "role"> | null | undefined
) {
  return workspaceSessionHasRole(session, "admin");
}

export function isWorkspaceDemoSession(
  session: Pick<WorkspaceSession, "principalType"> | null | undefined
) {
  return session?.principalType === "demo";
}

export function applyWorkspaceSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number
) {
  response.cookies.set({
    name: WORKSPACE_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearWorkspaceSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: WORKSPACE_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function normalizeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function hashWorkspaceAccessKey(accessKey: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(accessKey, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export async function revokeWorkspaceSession(request: Request) {
  const token = getCookieValue(
    request.headers.get("cookie"),
    WORKSPACE_SESSION_COOKIE_NAME
  );

  if (!token) {
    return false;
  }

  return deleteWorkspaceSessionRecordByTokenHash(hashWorkspaceSessionToken(token));
}

async function readWorkspaceSessionFromCookieValue(cookieValue: string | null) {
  if (!cookieValue) {
    return null;
  }

  const record = await getWorkspaceSessionRecordByTokenHash(
    hashWorkspaceSessionToken(cookieValue)
  );

  if (!record) {
    return null;
  }

  return {
    workspaceId: sanitizeWorkspaceId(record.workspaceId),
    expiresAt: record.expiresAt,
    issuedAt: record.issuedAt,
    role: normalizeWorkspaceRole(record.role),
    principalType: normalizeWorkspacePrincipalType(record.principalType),
    email: normalizeWorkspaceSessionEmail(record.email),
    memberId: normalizeWorkspaceSessionMemberId(record.memberId),
  };
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = segment.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    return rawValueParts.join("=") || null;
  }

  return null;
}

function hashWorkspaceSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeWorkspaceIdInput(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return sanitizeWorkspaceId(value);
}

function normalizeWorkspaceRole(value: unknown): WorkspaceSessionRole {
  return value === "member" ? "member" : "admin";
}

function normalizeWorkspacePrincipalType(
  value: unknown
): WorkspaceSessionPrincipalType {
  if (value === "member") {
    return "member";
  }

  if (value === "demo") {
    return "demo";
  }

  return "shared";
}

function normalizeWorkspaceSessionEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeWorkspaceSessionMemberId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workspaceSessionHasRole(
  session: Pick<WorkspaceSession, "role"> | null | undefined,
  requiredRole: WorkspaceSessionRole
) {
  if (!session) {
    return false;
  }

  const rank = {
    member: 1,
    admin: 2,
  } satisfies Record<WorkspaceSessionRole, number>;

  return rank[session.role] >= rank[requiredRole];
}

function buildSharedWorkspaceAuthenticationResult(
  workspaceId: string,
  email?: string
): WorkspaceAuthenticationResult {
  return {
    workspaceId,
    role: "admin",
    principalType: "shared",
    email: normalizeWorkspaceSessionEmail(email),
    memberId: null,
  };
}

async function authenticateWorkspaceMember(
  workspaceId: string,
  accessKey: string
): Promise<WorkspaceAuthenticationResult | null> {
  const members = await listWorkspaceMemberAccessRecords(workspaceId);
  const matchingMember = members.find(
    (member) =>
      member.status !== "revoked" &&
      verifyMemberAccessKey(accessKey, member.accessKeyHash)
  );

  if (!matchingMember) {
    return null;
  }

  if (matchingMember.status === "invited") {
    await updateWorkspaceMemberStatus({
      workspaceId,
      memberId: matchingMember.id,
      status: "active",
    }).catch(() => undefined);
  }

  return {
    workspaceId,
    role: matchingMember.role,
    principalType: "member",
    email: normalizeWorkspaceSessionEmail(matchingMember.email),
    memberId: matchingMember.id,
  };
}

function verifyWorkspaceAccessKey(accessKey: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":", 2);

  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = scryptSync(accessKey, salt, 64).toString("hex");

  return safeEqual(derivedKey, expectedHash);
}
