import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceDemoSession,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { getWorkspaceMailConnectionSummary } from "@/lib/mail-service";
import { createWorkspaceDemoRestrictedResponse } from "@/lib/workspace-demo";
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

  const [connection, workspaceConnection] = await Promise.all([
    getWorkspaceMailConnectionSummary(session.workspaceId),
    getWorkspaceMailConnection(session.workspaceId),
  ]);

  return NextResponse.json({
    connection,
    smtpConnection:
      workspaceConnection?.provider === "smtp"
        ? {
            fromEmail: workspaceConnection.fromEmail,
            host: workspaceConnection.smtpHost,
            port: workspaceConnection.smtpPort,
            secure: workspaceConnection.smtpSecure,
            username: workspaceConnection.smtpUsername,
          }
        : null,
  });
}

export async function PUT(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  if (isWorkspaceDemoSession(session)) {
    return createWorkspaceDemoRestrictedResponse(
      "Connecting a live sender is disabled in the one-time demo."
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      provider: "gmail" | "smtp";
      fromEmail: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      connectedAccountEmail: string;
      senderIdentity: "primary" | "alias" | "unknown";
      smtpHost: string;
      smtpPort: number | string;
      smtpSecure: boolean;
      smtpUsername: string;
      smtpPassword: string;
    }>;
    const provider = payload.provider === "smtp" ? "smtp" : "gmail";
    const fromEmail =
      typeof payload.fromEmail === "string" ? payload.fromEmail.trim().toLowerCase() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return NextResponse.json(
        { error: "Enter a valid company sender email address." },
        { status: 400 }
      );
    }

    if (provider === "smtp") {
      const smtpHost =
        typeof payload.smtpHost === "string" ? payload.smtpHost.trim() : "";
      const smtpUsername =
        typeof payload.smtpUsername === "string" ? payload.smtpUsername.trim() : "";
      const smtpPassword =
        typeof payload.smtpPassword === "string" ? payload.smtpPassword.trim() : "";
      const smtpPort =
        typeof payload.smtpPort === "number"
          ? payload.smtpPort
          : Number.parseInt(typeof payload.smtpPort === "string" ? payload.smtpPort : "", 10);

      if (!smtpHost) {
        return NextResponse.json(
          { error: "Enter the SMTP host for this company sender." },
          { status: 400 }
        );
      }

      if (!Number.isFinite(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
        return NextResponse.json(
          { error: "Enter a valid SMTP port." },
          { status: 400 }
        );
      }

      if (!smtpUsername) {
        return NextResponse.json(
          { error: "Enter the SMTP username for this sender." },
          { status: 400 }
        );
      }

      if (!smtpPassword) {
        return NextResponse.json(
          { error: "Enter the SMTP password or app password for this sender." },
          { status: 400 }
        );
      }

      await saveWorkspaceMailConnection({
        provider: "smtp",
        workspaceId: session.workspaceId,
        fromEmail,
        smtpHost,
        smtpPort,
        smtpSecure: Boolean(payload.smtpSecure),
        smtpUsername,
        smtpPassword,
      });
    } else {
      const existing = await getWorkspaceMailConnection(session.workspaceId);
      const nextClientId =
        typeof payload.clientId === "string" && payload.clientId.trim()
          ? payload.clientId.trim()
          : existing?.provider === "gmail"
            ? existing.clientId
            : "";
      const nextClientSecret =
        typeof payload.clientSecret === "string" && payload.clientSecret.trim()
          ? payload.clientSecret.trim()
          : existing?.provider === "gmail"
            ? existing.clientSecret
            : "";
      const nextRefreshToken =
        typeof payload.refreshToken === "string" && payload.refreshToken.trim()
          ? payload.refreshToken.trim()
          : existing?.provider === "gmail"
            ? existing.refreshToken
            : "";

      if (!nextClientId || !nextClientSecret || !nextRefreshToken) {
        return NextResponse.json(
          {
            error:
              "Use the Google connect button instead, or include the Google client ID, secret, and refresh token.",
          },
          { status: 400 }
        );
      }

      await saveWorkspaceMailConnection({
        provider: "gmail",
        workspaceId: session.workspaceId,
        fromEmail,
        clientId: nextClientId,
        clientSecret: nextClientSecret,
        refreshToken: nextRefreshToken,
        connectedAccountEmail:
          typeof payload.connectedAccountEmail === "string" &&
          payload.connectedAccountEmail.trim()
            ? payload.connectedAccountEmail.trim().toLowerCase()
            : fromEmail,
        senderIdentity:
          payload.senderIdentity === "primary" ||
          payload.senderIdentity === "alias" ||
          payload.senderIdentity === "unknown"
            ? payload.senderIdentity
            : "unknown",
      });
    }

    const [connection, workspaceConnection] = await Promise.all([
      getWorkspaceMailConnectionSummary(session.workspaceId),
      getWorkspaceMailConnection(session.workspaceId),
    ]);

    return NextResponse.json({
      connection,
      smtpConnection:
        workspaceConnection?.provider === "smtp"
          ? {
              fromEmail: workspaceConnection.fromEmail,
              host: workspaceConnection.smtpHost,
              port: workspaceConnection.smtpPort,
              secure: workspaceConnection.smtpSecure,
              username: workspaceConnection.smtpUsername,
            }
          : null,
    });
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

  if (isWorkspaceDemoSession(session)) {
    return createWorkspaceDemoRestrictedResponse(
      "Disconnecting or changing a live sender is disabled in the one-time demo."
    );
  }

  try {
    await deleteWorkspaceMailConnection(session.workspaceId);
    const connection = await getWorkspaceMailConnectionSummary(session.workspaceId);

    return NextResponse.json({ ok: true, connection, smtpConnection: null });
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
