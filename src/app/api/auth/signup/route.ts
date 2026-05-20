import { NextResponse } from "next/server";

import { createWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import {
  applyWorkspaceSessionCookie,
  createWorkspaceSession,
  hashWorkspaceAccessKey,
  isProvisionedWorkspace,
  normalizeNextPath,
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

    if (isProvisionedWorkspace(workspaceId)) {
      return NextResponse.json(
        {
          error:
            "That workspace ID is reserved by an existing deployment configuration. Choose a different ID.",
        },
        { status: 409 }
      );
    }

    await createWorkspaceAccessRecord({
      workspaceId,
      contactEmail,
      accessKeyHash: hashWorkspaceAccessKey(accessKey),
    });

    const defaultSettings = buildDefaultWorkspaceSettings(workspaceId);
    const settings = await saveWorkspaceSettings(workspaceId, {
      ...defaultSettings,
      appName: `${organizationName} Hiring`,
      organizationName,
      tagline: `Secure recruiting workspace for ${organizationName}.`,
      workspaceId,
    });
    const { token, maxAgeSeconds, session } = await createWorkspaceSession(
      workspaceId,
      keepSignedIn
    );
    const response = NextResponse.json({
      ok: true,
      nextPath,
      session,
      settings,
    });

    applyWorkspaceSessionCookie(response, token, maxAgeSeconds);

    return response;
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
