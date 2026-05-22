import { NextResponse } from "next/server";

import { createAuthChallenge } from "@/lib/auth-challenge-store";
import {
  authenticateWorkspaceCredentials,
  normalizeNextPath,
} from "@/lib/workspace-auth";
import {
  buildWorkspaceSignInCodeEmail,
  sendWorkspaceMail,
} from "@/lib/mail-service";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<{
      workspaceId: string;
      accessKey: string;
      keepSignedIn: boolean;
      next: string;
    }>;
    const rawWorkspaceId =
      typeof payload.workspaceId === "string" ? payload.workspaceId : "";
    const workspaceId = rawWorkspaceId.trim()
      ? sanitizeWorkspaceId(rawWorkspaceId)
      : "";
    const accessKey = typeof payload.accessKey === "string" ? payload.accessKey : "";
    const keepSignedIn = payload.keepSignedIn === true;
    const nextPath = normalizeNextPath(payload.next);

    if (!workspaceId || !accessKey.trim()) {
      return NextResponse.json(
        { error: "Enter both the workspace ID and access key." },
        { status: 400 }
      );
    }

    const authentication = await authenticateWorkspaceCredentials(
      workspaceId,
      accessKey
    );

    if (!authentication) {
      return NextResponse.json(
        { error: "The workspace ID or access key is invalid." },
        { status: 401 }
      );
    }

    const settings = await getWorkspaceSettings(authentication.workspaceId);
    const challenge = await createAuthChallenge({
      purpose: "workspace-signin",
      workspaceId: authentication.workspaceId,
      email: authentication.email,
      payload: {
        authentication,
        keepSignedIn,
        nextPath,
      },
    });
    const message = buildWorkspaceSignInCodeEmail({
      appName: settings.appName,
      organizationName: settings.organizationName,
      verificationCode: challenge.verificationCode,
      expiresInMinutes: challenge.expiresInMinutes,
    });
    const mailDelivery = await sendWorkspaceMail({
      workspaceId: authentication.workspaceId,
      to: authentication.email,
      ...message,
    });

    if (mailDelivery.status !== "sent") {
      throw new Error(mailDelivery.reason || "I couldn't send the sign-in code right now.");
    }

    return NextResponse.json({
      ok: true,
      requiresTwoFactor: true,
      challengeId: challenge.challengeId,
      verificationEmail: challenge.email,
      expiresInMinutes: challenge.expiresInMinutes,
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "I couldn't start that workspace session right now." },
      { status: 500 }
    );
  }
}
