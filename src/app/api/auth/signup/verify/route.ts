import { NextResponse } from "next/server";

import { verifyAuthChallenge } from "@/lib/auth-challenge-store";
import { createWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import {
  applyWorkspaceSessionCookie,
  createWorkspaceSession,
} from "@/lib/workspace-auth";
import { saveWorkspaceSettings } from "@/lib/workspace-settings-store";
import {
  buildDefaultWorkspaceSettings,
  sanitizeWorkspaceId,
} from "@/lib/workspace-settings";

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
        { error: "Enter the 6-digit verification code to finish creating the workspace." },
        { status: 400 }
      );
    }

    const challenge = await verifyAuthChallenge({
      challengeId,
      purpose: "workspace-signup",
      verificationCode,
    });
    const signupPayload = parseSignupChallengePayload(challenge.payload);

    await createWorkspaceAccessRecord({
      workspaceId: signupPayload.workspaceId,
      contactEmail: signupPayload.contactEmail,
      accessKeyHash: signupPayload.accessKeyHash,
    });

    const defaultSettings = buildDefaultWorkspaceSettings(signupPayload.workspaceId);
    const settings = await saveWorkspaceSettings(signupPayload.workspaceId, {
      ...defaultSettings,
      appName: `${signupPayload.organizationName} Hiring`,
      organizationName: signupPayload.organizationName,
      tagline: `Secure recruiting workspace for ${signupPayload.organizationName}.`,
      workspaceId: signupPayload.workspaceId,
    });
    const { token, maxAgeSeconds, session } = await createWorkspaceSession(
      {
        workspaceId: signupPayload.workspaceId,
        role: "admin",
        principalType: "shared",
        email: signupPayload.contactEmail,
        memberId: null,
      },
      signupPayload.keepSignedIn
    );
    const response = NextResponse.json({
      ok: true,
      nextPath: signupPayload.nextPath,
      session,
      settings,
    });

    applyWorkspaceSessionCookie(response, token, maxAgeSeconds);

    return response;
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes("already in use") ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(
      { error: "I couldn't verify that workspace email right now." },
      { status: 500 }
    );
  }
}

function parseSignupChallengePayload(value: Record<string, unknown>) {
  const workspaceId =
    typeof value.workspaceId === "string" ? sanitizeWorkspaceId(value.workspaceId) : "";
  const organizationName =
    typeof value.organizationName === "string" ? value.organizationName.trim() : "";
  const contactEmail =
    typeof value.contactEmail === "string"
      ? value.contactEmail.trim().toLowerCase()
      : "";
  const accessKeyHash =
    typeof value.accessKeyHash === "string" ? value.accessKeyHash.trim() : "";
  const keepSignedIn = value.keepSignedIn === true;
  const nextPath =
    typeof value.nextPath === "string" && value.nextPath.startsWith("/")
      ? value.nextPath
      : "/workspace";

  if (!workspaceId || !organizationName || !contactEmail || !accessKeyHash) {
    throw new Error("That verification request is missing required signup details. Start again.");
  }

  return {
    workspaceId,
    organizationName,
    contactEmail,
    accessKeyHash,
    keepSignedIn,
    nextPath,
  };
}
