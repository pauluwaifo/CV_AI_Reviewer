import { NextResponse } from "next/server";

import { verifyAuthChallenge } from "@/lib/auth-challenge-store";
import {
  applyWorkspaceSessionCookie,
  createWorkspaceSession,
  type WorkspaceAuthenticationResult,
} from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<{
      challengeId: string;
      verificationCode: string;
    }>;
    const challengeId =
      typeof payload.challengeId === "string" ? payload.challengeId.trim() : "";
    const verificationCode =
      typeof payload.verificationCode === "string"
        ? payload.verificationCode.trim()
        : "";

    if (!challengeId || !verificationCode) {
      return NextResponse.json(
        { error: "Enter the 6-digit sign-in code to continue." },
        { status: 400 }
      );
    }

    const challenge = await verifyAuthChallenge({
      challengeId,
      purpose: "workspace-signin",
      verificationCode,
    });
    const signInPayload = parseSignInChallengePayload(challenge.payload);
    const [{ token, maxAgeSeconds, session }, settings] = await Promise.all([
      createWorkspaceSession(signInPayload.authentication, signInPayload.keepSignedIn),
      getWorkspaceSettings(signInPayload.authentication.workspaceId),
    ]);
    const response = NextResponse.json({
      ok: true,
      nextPath: signInPayload.nextPath,
      session,
      settings,
    });

    applyWorkspaceSessionCookie(response, token, maxAgeSeconds);

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "I couldn't finish that secure sign-in right now." },
      { status: 500 }
    );
  }
}

function parseSignInChallengePayload(value: Record<string, unknown>) {
  const authValue =
    value.authentication && typeof value.authentication === "object"
      ? (value.authentication as Partial<WorkspaceAuthenticationResult>)
      : null;
  const authentication = parseAuthentication(authValue);
  const keepSignedIn = value.keepSignedIn === true;
  const nextPath =
    typeof value.nextPath === "string" && value.nextPath.startsWith("/")
      ? value.nextPath
      : "/pipeline";

  return {
    authentication,
    keepSignedIn,
    nextPath,
  };
}

function parseAuthentication(value: Partial<WorkspaceAuthenticationResult> | null) {
  const workspaceId =
    typeof value?.workspaceId === "string" ? sanitizeWorkspaceId(value.workspaceId) : "";
  const role = value?.role === "member" ? "member" : value?.role === "admin" ? "admin" : null;
  const principalType =
    value?.principalType === "member"
      ? "member"
      : value?.principalType === "shared"
        ? "shared"
        : null;
  const email = typeof value?.email === "string" ? value.email.trim().toLowerCase() : "";
  const memberId =
    typeof value?.memberId === "string" && value.memberId.trim()
      ? value.memberId.trim()
      : null;

  if (!workspaceId || !role || !principalType || !email) {
    throw new Error("That sign-in request is missing secure session details. Start again.");
  }

  return {
    workspaceId,
    role,
    principalType,
    email,
    memberId,
  } satisfies WorkspaceAuthenticationResult;
}
