import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  getWorkspaceMailConnectionSummary,
} from "@/lib/mail-service";
import {
  deleteWorkspaceMailConnection,
  getWorkspaceMailConnection,
  saveWorkspaceMailConnection,
} from "@/lib/workspace-mail-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  const connection = await getWorkspaceMailConnectionSummary(session.workspaceId);

  return NextResponse.json({ connection });
}

export async function PUT(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      fromEmail: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    }>;
    const fromEmail =
      typeof payload.fromEmail === "string" ? payload.fromEmail.trim().toLowerCase() : "";
    const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
    const clientSecret =
      typeof payload.clientSecret === "string" ? payload.clientSecret.trim() : "";
    const refreshToken =
      typeof payload.refreshToken === "string" ? payload.refreshToken.trim() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return NextResponse.json(
        { error: "Enter a valid company sender email address." },
        { status: 400 }
      );
    }

    const existing = await getWorkspaceMailConnection(session.workspaceId);
    const nextClientId = clientId || existing?.clientId || "";
    const nextClientSecret = clientSecret || existing?.clientSecret || "";
    const nextRefreshToken = refreshToken || existing?.refreshToken || "";

    if (!nextClientId || !nextClientSecret || !nextRefreshToken) {
      return NextResponse.json(
        {
          error:
            "Add the Google client ID, client secret, and refresh token for this workspace sender.",
        },
        { status: 400 }
      );
    }

    await saveWorkspaceMailConnection({
      workspaceId: session.workspaceId,
      fromEmail,
      clientId: nextClientId,
      clientSecret: nextClientSecret,
      refreshToken: nextRefreshToken,
    });
    const connection = await getWorkspaceMailConnectionSummary(session.workspaceId);

    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't save that workspace sender right now.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    await deleteWorkspaceMailConnection(session.workspaceId);
    const connection = await getWorkspaceMailConnectionSummary(session.workspaceId);

    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't disconnect that workspace sender right now.",
      },
      { status: 500 }
    );
  }
}
