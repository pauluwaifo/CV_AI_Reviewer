import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { saveWorkspaceMailConnection } from "@/lib/workspace-mail-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_MAIL_OAUTH_COOKIE = "workspace-mail-oauth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const gmailSendAsUrl = "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return redirectWithStatus(
      request,
      "auth-required",
      "Sign back into the workspace before connecting Google mail."
    );
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  const cookieValue = getCookieValue(request.headers.get("cookie"), WORKSPACE_MAIL_OAUTH_COOKIE);
  const pending = decodePendingOAuthState(cookieValue);

  if (!pending) {
    return redirectWithStatus(
      request,
      "expired",
      "That Google inbox connection expired. Start the connection again."
    );
  }

  if (pending.workspaceId !== session.workspaceId) {
    return redirectWithStatus(
      request,
      "mismatch",
      "That Google inbox connection belongs to a different workspace."
    );
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const error = url.searchParams.get("error")?.trim() ?? "";

  if (error) {
    return redirectWithStatus(request, "denied", "Google authorization was cancelled.");
  }

  if (!state || state !== pending.state || !code) {
    return redirectWithStatus(
      request,
      "invalid",
      "Google did not return a valid authorization response."
    );
  }

  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ?? "";

  if (!clientId || !clientSecret) {
    return redirectWithStatus(
      request,
      "server-missing",
      "Google mail is not configured on the server yet."
    );
  }

  try {
    const tokenResponse = await fetch(googleTokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
      }),
    });
    const tokenPayload = (await tokenResponse.json().catch(() => null)) as
      | {
          access_token?: string;
          refresh_token?: string;
          error_description?: string;
          error?: string;
        }
      | null;

    if (
      !tokenResponse.ok ||
      !tokenPayload?.refresh_token ||
      !tokenPayload.access_token
    ) {
      throw new Error(
        tokenPayload?.error_description ||
          tokenPayload?.error ||
          "Google did not return a refresh token."
      );
    }

    const senderVerification = await verifyGoogleWorkspaceSender({
      accessToken: tokenPayload.access_token,
      requestedFromEmail: pending.fromEmail,
    });

    await saveWorkspaceMailConnection({
      provider: "gmail",
      workspaceId: session.workspaceId,
      fromEmail: pending.fromEmail,
      clientId,
      clientSecret,
      refreshToken: tokenPayload.refresh_token,
      connectedAccountEmail: senderVerification.connectedAccountEmail,
      senderIdentity: senderVerification.senderIdentity,
    });

    return redirectWithStatus(
      request,
      "connected",
      senderVerification.senderIdentity === "alias"
        ? `Google inbox connected. ${pending.fromEmail} is verified as an alias on ${senderVerification.connectedAccountEmail}.`
        : `Google inbox connected for ${pending.fromEmail}.`
    );
  } catch (connectError) {
    return redirectWithStatus(
      request,
      "error",
      connectError instanceof Error
        ? connectError.message
        : "I couldn't finish the Google inbox connection."
    );
  }
}

function redirectWithStatus(request: Request, status: string, message: string) {
  const url = new URL("/workspace", request.url);

  url.searchParams.set("tab", "team");
  url.searchParams.set("mail", status);
  url.searchParams.set("mail_message", message);

  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: WORKSPACE_MAIL_OAUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

async function verifyGoogleWorkspaceSender({
  accessToken,
  requestedFromEmail,
}: {
  accessToken: string;
  requestedFromEmail: string;
}) {
  const response = await fetch(gmailSendAsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        sendAs?: Array<{
          sendAsEmail?: string;
          isPrimary?: boolean;
          isDefault?: boolean;
          verificationStatus?: string;
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok || !Array.isArray(payload?.sendAs) || payload.sendAs.length === 0) {
    throw new Error(
      payload?.error?.message ||
        "Google could not verify the mailbox or alias for this workspace sender."
    );
  }

  const normalizedRequestedEmail = requestedFromEmail.trim().toLowerCase();
  const primaryIdentity =
    payload.sendAs.find((item) => item.isPrimary) ??
    payload.sendAs.find((item) => item.isDefault) ??
    payload.sendAs[0];
  const matchingIdentity = payload.sendAs.find((item) => {
    const sendAsEmail = item.sendAsEmail?.trim().toLowerCase() ?? "";
    return (
      sendAsEmail === normalizedRequestedEmail &&
      (!item.verificationStatus || item.verificationStatus.toLowerCase() === "accepted")
    );
  });

  if (!matchingIdentity) {
    const connectedAccountEmail =
      primaryIdentity?.sendAsEmail?.trim().toLowerCase() || "the connected Google account";

    throw new Error(
      `${requestedFromEmail} is not the primary Google mailbox or a verified Send mail as alias on ${connectedAccountEmail}. Add it as a Google alias, or use SMTP for this custom-domain sender.`
    );
  }

  return {
    connectedAccountEmail:
      primaryIdentity?.sendAsEmail?.trim().toLowerCase() ||
      matchingIdentity.sendAsEmail?.trim().toLowerCase() ||
      normalizedRequestedEmail,
    senderIdentity: matchingIdentity.isPrimary ? ("primary" as const) : ("alias" as const),
  };
}

function decodePendingOAuthState(cookieValue: string | null) {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8")) as Partial<{
      state: string;
      workspaceId: string;
      fromEmail: string;
      redirectUri: string;
      createdAt: string;
    }>;

    if (
      typeof parsed.state !== "string" ||
      !parsed.state.trim() ||
      typeof parsed.workspaceId !== "string" ||
      !parsed.workspaceId.trim() ||
      typeof parsed.fromEmail !== "string" ||
      !parsed.fromEmail.trim() ||
      typeof parsed.redirectUri !== "string" ||
      !parsed.redirectUri.trim()
    ) {
      return null;
    }

    return {
      state: parsed.state.trim(),
      workspaceId: parsed.workspaceId.trim(),
      fromEmail: parsed.fromEmail.trim().toLowerCase(),
      redirectUri: parsed.redirectUri.trim(),
      createdAt: parsed.createdAt ?? "",
    };
  } catch {
    return null;
  }
}

function getCookieValue(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === cookieName) {
      return rest.join("=") || null;
    }
  }

  return null;
}
