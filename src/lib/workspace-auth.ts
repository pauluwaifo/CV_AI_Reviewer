import "server-only";

import {
  createHash,
  createHmac,
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
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const WORKSPACE_SESSION_COOKIE_NAME = "hiring-workspace-session";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const EXTENDED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type WorkspaceSessionTokenPayload = {
  workspaceId: string;
  expiresAt: number;
  issuedAt: number;
};

export type WorkspaceSession = {
  workspaceId: string;
  expiresAt: string;
  issuedAt: string;
};

export async function getWorkspaceSession() {
  const cookieStore = await cookies();
  return readWorkspaceSessionFromCookieValue(
    cookieStore.get(WORKSPACE_SESSION_COOKIE_NAME)?.value ?? null
  );
}

export function getWorkspaceSessionFromRequest(request: Request) {
  const cookieValue = getCookieValue(
    request.headers.get("cookie"),
    WORKSPACE_SESSION_COOKIE_NAME
  );

  return readWorkspaceSessionFromCookieValue(cookieValue);
}

export function requireWorkspaceApiSession(request: Request) {
  const session = getWorkspaceSessionFromRequest(request);

  if (!session) {
    return null;
  }

  return session;
}

export async function requireWorkspacePageSession(nextPath: string) {
  const session = await getWorkspaceSession();

  if (!session) {
    redirect(`/signin?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  return session;
}

export async function createWorkspaceSession(
  workspaceId: string,
  keepSignedIn: boolean
) {
  const sessionSecret = getWorkspaceSessionSecret();

  if (!sessionSecret) {
    throw new Error(
      "WORKSPACE_SESSION_SECRET is missing. Add it to your environment before enabling workspace sign-in."
    );
  }

  const normalizedWorkspaceId = normalizeWorkspaceIdInput(workspaceId);

  if (!normalizedWorkspaceId) {
    throw new Error("A valid workspace ID is required to create a session.");
  }
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = keepSignedIn
    ? EXTENDED_SESSION_MAX_AGE_SECONDS
    : DEFAULT_SESSION_MAX_AGE_SECONDS;
  const payload: WorkspaceSessionTokenPayload = {
    workspaceId: normalizedWorkspaceId,
    expiresAt: now + maxAgeSeconds,
    issuedAt: now,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  return {
    token: `${encodedPayload}.${signature}`,
    maxAgeSeconds,
    session: toWorkspaceSession(payload),
  };
}

export async function authenticateWorkspaceCredentials(
  workspaceId: string,
  accessKey: string
) {
  const normalizedWorkspaceId = normalizeWorkspaceIdInput(workspaceId);
  const trimmedAccessKey = accessKey.trim();

  if (!normalizedWorkspaceId) {
    return false;
  }

  if (!trimmedAccessKey) {
    return false;
  }

  const configuredAccessKey = getProvisionedWorkspaceAccessKeys().get(
    normalizedWorkspaceId
  );

  if (configuredAccessKey) {
    const configuredDigest = createHash("sha256")
      .update(configuredAccessKey)
      .digest();
    const submittedDigest = createHash("sha256").update(trimmedAccessKey).digest();

    return timingSafeEqual(configuredDigest, submittedDigest);
  }

  const managedRecord = await getWorkspaceAccessRecord(normalizedWorkspaceId);

  if (!managedRecord) {
    const members = await listWorkspaceMemberAccessRecords(normalizedWorkspaceId);
    const matchingMember = members.find(
      (member) =>
        member.status !== "revoked" &&
        verifyMemberAccessKey(trimmedAccessKey, member.accessKeyHash)
    );

    if (!matchingMember) {
      return false;
    }

    if (matchingMember.status === "invited") {
      await updateWorkspaceMemberStatus({
        workspaceId: normalizedWorkspaceId,
        memberId: matchingMember.id,
        status: "active",
      }).catch(() => undefined);
    }

    return true;
  }

  if (verifyWorkspaceAccessKey(trimmedAccessKey, managedRecord.accessKeyHash)) {
    return true;
  }

  const members = await listWorkspaceMemberAccessRecords(normalizedWorkspaceId);
  const matchingMember = members.find(
    (member) =>
      member.status !== "revoked" &&
      verifyMemberAccessKey(trimmedAccessKey, member.accessKeyHash)
  );

  if (!matchingMember) {
    return false;
  }

  if (matchingMember.status === "invited") {
    await updateWorkspaceMemberStatus({
      workspaceId: normalizedWorkspaceId,
      memberId: matchingMember.id,
      status: "active",
    }).catch(() => undefined);
  }

  return true;
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

export function isProvisionedWorkspace(workspaceId: string) {
  const normalizedWorkspaceId = normalizeWorkspaceIdInput(workspaceId);

  if (!normalizedWorkspaceId) {
    return false;
  }

  return getProvisionedWorkspaceAccessKeys().has(normalizedWorkspaceId);
}

function readWorkspaceSessionFromCookieValue(cookieValue: string | null) {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, signature] = cookieValue.split(".", 2);

  if (!encodedPayload || !signature) {
    return null;
  }

  const sessionSecret = getWorkspaceSessionSecret();

  if (!sessionSecret) {
    return null;
  }

  const expectedSignature = createHmac("sha256", sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decodedPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<WorkspaceSessionTokenPayload>;
    const workspaceId = normalizeWorkspaceIdInput(decodedPayload.workspaceId);
    const expiresAt =
      typeof decodedPayload.expiresAt === "number" ? decodedPayload.expiresAt : 0;
    const issuedAt =
      typeof decodedPayload.issuedAt === "number" ? decodedPayload.issuedAt : 0;

    if (!workspaceId || !expiresAt || !issuedAt) {
      return null;
    }

    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return toWorkspaceSession({
      workspaceId,
      expiresAt,
      issuedAt,
    });
  } catch {
    return null;
  }
}

function toWorkspaceSession(payload: WorkspaceSessionTokenPayload): WorkspaceSession {
  return {
    workspaceId: sanitizeWorkspaceId(payload.workspaceId),
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    issuedAt: new Date(payload.issuedAt * 1000).toISOString(),
  };
}

function getWorkspaceSessionSecret() {
  const secret = process.env.WORKSPACE_SESSION_SECRET?.trim();
  return secret || null;
}

function getProvisionedWorkspaceAccessKeys() {
  const rawValue = process.env.WORKSPACE_ACCESS_KEYS?.trim() ?? "";
  const entries = rawValue
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const workspaceKeys = new Map<string, string>();

  for (const entry of entries) {
    const separatorIndex = entry.includes("=")
      ? entry.indexOf("=")
      : entry.indexOf(":");

    if (separatorIndex <= 0) {
      continue;
    }

    const workspaceId = sanitizeWorkspaceId(entry.slice(0, separatorIndex));
    const accessKey = entry.slice(separatorIndex + 1).trim();

    if (!workspaceId || !accessKey) {
      continue;
    }

    workspaceKeys.set(workspaceId, accessKey);
  }

  return workspaceKeys;
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

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
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

function verifyWorkspaceAccessKey(accessKey: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":", 2);

  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = scryptSync(accessKey, salt, 64).toString("hex");

  return safeEqual(derivedKey, expectedHash);
}
