import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export const OWNER_SESSION_COOKIE_NAME = "hiring-owner-session";

const DEFAULT_OWNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type OwnerSessionTokenPayload = {
  email: string;
  expiresAt: number;
  issuedAt: number;
};

export type OwnerSession = {
  email: string;
  expiresAt: string;
  issuedAt: string;
};

export async function getOwnerSession() {
  const cookieStore = await cookies();
  return readOwnerSessionFromCookieValue(
    cookieStore.get(OWNER_SESSION_COOKIE_NAME)?.value ?? null
  );
}

export async function requireOwnerPageSession(nextPath: string) {
  const session = await getOwnerSession();

  if (!session) {
    redirect(`/owner/signin?next=${encodeURIComponent(normalizeOwnerNextPath(nextPath))}`);
  }

  return session;
}

export function authenticateOwnerCredentials(email: string, accessKey: string) {
  const configuredEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const configuredAccessKey = process.env.OWNER_ACCESS_KEY?.trim() ?? "";
  const submittedEmail = email.trim().toLowerCase();
  const submittedAccessKey = accessKey.trim();

  if (!configuredEmail || !configuredAccessKey) {
    throw new Error(
      "OWNER_EMAIL and OWNER_ACCESS_KEY are missing. Add them to your environment before using the owner dashboard."
    );
  }

  return (
    safeDigestEqual(submittedEmail, configuredEmail) &&
    safeDigestEqual(submittedAccessKey, configuredAccessKey)
  );
}

export function createOwnerSession(email: string) {
  const sessionSecret = getOwnerSessionSecret();

  if (!sessionSecret) {
    throw new Error(
      "OWNER_SESSION_SECRET is missing. Add it to your environment before using the owner dashboard."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: OwnerSessionTokenPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: now + DEFAULT_OWNER_SESSION_MAX_AGE_SECONDS,
    issuedAt: now,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  return {
    token: `${encodedPayload}.${signature}`,
    maxAgeSeconds: DEFAULT_OWNER_SESSION_MAX_AGE_SECONDS,
    session: toOwnerSession(payload),
  };
}

export function applyOwnerSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number
) {
  response.cookies.set({
    name: OWNER_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearOwnerSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: OWNER_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function normalizeOwnerNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/owner";
  }

  if (!value.startsWith("/owner")) {
    return "/owner";
  }

  return value;
}

function readOwnerSessionFromCookieValue(cookieValue: string | null) {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, signature] = cookieValue.split(".", 2);

  if (!encodedPayload || !signature) {
    return null;
  }

  const sessionSecret = getOwnerSessionSecret();

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
    ) as Partial<OwnerSessionTokenPayload>;
    const email = typeof decodedPayload.email === "string" ? decodedPayload.email : "";
    const expiresAt =
      typeof decodedPayload.expiresAt === "number" ? decodedPayload.expiresAt : 0;
    const issuedAt =
      typeof decodedPayload.issuedAt === "number" ? decodedPayload.issuedAt : 0;

    if (!email || !expiresAt || !issuedAt) {
      return null;
    }

    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return toOwnerSession({
      email,
      expiresAt,
      issuedAt,
    });
  } catch {
    return null;
  }
}

function getOwnerSessionSecret() {
  const secret =
    process.env.OWNER_SESSION_SECRET?.trim() ||
    process.env.WORKSPACE_SESSION_SECRET?.trim() ||
    "";

  return secret || null;
}

function toOwnerSession(payload: OwnerSessionTokenPayload): OwnerSession {
  return {
    email: payload.email.trim().toLowerCase(),
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    issuedAt: new Date(payload.issuedAt * 1000).toISOString(),
  };
}

function safeDigestEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
