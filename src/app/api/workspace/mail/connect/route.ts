import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_MAIL_OAUTH_COOKIE = "workspace-mail-oauth";
const googleWorkspaceMailScopes = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ?? "";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Google mail is not configured on the server yet. Add the global Google client ID and client secret first.",
      },
      { status: 400 }
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      fromEmail: string;
    }>;
    const fromEmail =
      typeof payload.fromEmail === "string" ? payload.fromEmail.trim().toLowerCase() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return NextResponse.json(
        { error: "Enter a valid company sender email address first." },
        { status: 400 }
      );
    }

    const redirectUri = new URL("/api/workspace/mail/callback", request.url).toString();
    const state = randomBytes(24).toString("hex");
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", googleWorkspaceMailScopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("login_hint", fromEmail);
    authUrl.searchParams.set("state", state);

    const response = NextResponse.json({ authUrl: authUrl.toString() });

    response.cookies.set({
      name: WORKSPACE_MAIL_OAUTH_COOKIE,
      value: encodePendingOAuthState({
        state,
        workspaceId: session.workspaceId,
        fromEmail,
        redirectUri,
        createdAt: new Date().toISOString(),
      }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't start the Google inbox connection right now.",
      },
      { status: 500 }
    );
  }
}

function encodePendingOAuthState(value: {
  state: string;
  workspaceId: string;
  fromEmail: string;
  redirectUri: string;
  createdAt: string;
}) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
