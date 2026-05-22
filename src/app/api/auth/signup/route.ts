import { NextResponse } from "next/server";

import { createAuthChallenge } from "@/lib/auth-challenge-store";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { hashWorkspaceAccessKey, normalizeNextPath } from "@/lib/workspace-auth";
import {
  buildWorkspaceVerificationCodeEmail,
  sendWorkspaceMail,
} from "@/lib/mail-service";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<{
      workspaceId: string;
      organizationName: string;
      contactEmail: string;
      accessKey: string;
      confirmAccessKey: string;
      keepSignedIn: boolean;
      next: string;
    }>;
    const rawWorkspaceId =
      typeof payload.workspaceId === "string" ? payload.workspaceId : "";
    const workspaceId = rawWorkspaceId.trim()
      ? sanitizeWorkspaceId(rawWorkspaceId)
      : "";
    const organizationName =
      typeof payload.organizationName === "string" ? payload.organizationName.trim() : "";
    const contactEmail =
      typeof payload.contactEmail === "string" ? payload.contactEmail.trim().toLowerCase() : "";
    const accessKey = typeof payload.accessKey === "string" ? payload.accessKey.trim() : "";
    const confirmAccessKey =
      typeof payload.confirmAccessKey === "string"
        ? payload.confirmAccessKey.trim()
        : "";
    const keepSignedIn = payload.keepSignedIn !== false;
    const nextPath = normalizeNextPath(payload.next) === "/"
      ? "/workspace"
      : normalizeNextPath(payload.next);

    if (!workspaceId || !organizationName || !contactEmail || !accessKey) {
      return NextResponse.json(
        {
          error:
            "Enter your organization name, workspace ID, admin email, and access key to create a workspace.",
        },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json(
        { error: "Enter a valid admin email address." },
        { status: 400 }
      );
    }

    if (accessKey.length < 8) {
      return NextResponse.json(
        { error: "Use an access key with at least 8 characters." },
        { status: 400 }
      );
    }

    if (accessKey !== confirmAccessKey) {
      return NextResponse.json(
        { error: "The access key confirmation does not match." },
        { status: 400 }
      );
    }

    const existingWorkspace = await getWorkspaceAccessRecord(workspaceId);

    if (existingWorkspace) {
      return NextResponse.json(
        { error: "That workspace ID is already in use." },
        { status: 409 }
      );
    }

    const challenge = await createAuthChallenge({
      purpose: "workspace-signup",
      workspaceId,
      email: contactEmail,
      payload: {
        workspaceId,
        organizationName,
        contactEmail,
        accessKeyHash: hashWorkspaceAccessKey(accessKey),
        keepSignedIn,
        nextPath,
      },
    });
    const message = buildWorkspaceVerificationCodeEmail({
      appName: `${organizationName} Hiring`,
      organizationName,
      verificationCode: challenge.verificationCode,
      expiresInMinutes: challenge.expiresInMinutes,
    });
    const mailDelivery = await sendWorkspaceMail({
      workspaceId,
      to: contactEmail,
      ...message,
    });

    if (mailDelivery.status !== "sent") {
      throw new Error(
        mailDelivery.reason || "I couldn't send the verification code right now."
      );
    }

    return NextResponse.json({
      ok: true,
      requiresVerification: true,
      challengeId: challenge.challengeId,
      verificationEmail: challenge.email,
      expiresInMinutes: challenge.expiresInMinutes,
    });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes("already in use") ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(
      { error: "I couldn't create that workspace right now." },
      { status: 500 }
    );
  }
}
