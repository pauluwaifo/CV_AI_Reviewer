import "server-only";

import { getWorkspaceMailConnection } from "@/lib/workspace-mail-store";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailDeliveryResult =
  | {
      status: "sent";
      provider: "gmail";
      source: "workspace" | "global";
      fromEmail: string;
      messageId: string;
    }
  | { status: "skipped"; reason: string; source: "workspace" | "global" | "none" };

export type WorkspaceMailConnectionSummary = {
  provider: "gmail";
  source: "workspace" | "global" | "none";
  fromEmail: string;
  hasWorkspaceConnection: boolean;
  updatedAt: string | null;
};

const gmailTokenUrl = "https://oauth2.googleapis.com/token";
const gmailSendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function isGlobalMailConfigured() {
  return Boolean(
    process.env.GOOGLE_MAIL_CLIENT_ID?.trim() &&
      process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_MAIL_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_MAIL_FROM?.trim()
  );
}

export async function getWorkspaceMailConnectionSummary(
  workspaceId: string
): Promise<WorkspaceMailConnectionSummary> {
  const workspaceConfig = await getWorkspaceMailConnection(workspaceId);

  if (workspaceConfig) {
    return {
      provider: "gmail",
      source: "workspace",
      fromEmail: workspaceConfig.fromEmail,
      hasWorkspaceConnection: true,
      updatedAt: workspaceConfig.updatedAt,
    };
  }

  if (isGlobalMailConfigured()) {
    return {
      provider: "gmail",
      source: "global",
      fromEmail: process.env.GOOGLE_MAIL_FROM?.trim().toLowerCase() ?? "",
      hasWorkspaceConnection: false,
      updatedAt: null,
    };
  }

  return {
    provider: "gmail",
    source: "none",
    fromEmail: "",
    hasWorkspaceConnection: false,
    updatedAt: null,
  };
}

export async function sendWorkspaceMail({
  workspaceId,
  ...input
}: SendMailInput & {
  workspaceId: string;
}): Promise<MailDeliveryResult> {
  const config = await resolveMailConfig(workspaceId);

  if (!config) {
    return {
      status: "skipped",
      source: "none",
      reason:
        "No workspace sender or global Google mail fallback is configured, so no email was sent.",
    };
  }

  const accessToken = await getGoogleAccessToken(config);
  const raw = encodeGmailMessage({
    ...input,
    from: config.fromEmail,
  });

  const response = await fetch(gmailSendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Google Mail could not send that email."
    );
  }

  return {
    status: "sent",
    provider: "gmail",
    source: config.source,
    fromEmail: config.fromEmail,
    messageId: payload?.id || "",
  };
}

export function buildWorkspaceInviteEmail({
  appName,
  organizationName,
  workspaceId,
  role,
  accessKey,
  signInUrl,
}: {
  appName: string;
  organizationName: string;
  workspaceId: string;
  role: string;
  accessKey: string;
  signInUrl: string;
}) {
  const subject = `${organizationName} invited you to ${appName}`;
  const text = [
    `You have been invited to ${organizationName}'s workspace on ${appName}.`,
    "",
    `Role: ${role}`,
    `Workspace ID: ${workspaceId}`,
    `Access key: ${accessKey}`,
    "",
    `Sign in: ${signInUrl}`,
    "",
    "Keep this access key private. The workspace admin can revoke it anytime.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(organizationName)} invited you to ${escapeHtml(appName)}</h2>
      <p>You have been invited as <strong>${escapeHtml(role)}</strong>.</p>
      <div style="border:1px solid #d1d5db;border-radius:12px;padding:16px;margin:16px 0;background:#f9fafb">
        <p><strong>Workspace ID:</strong> ${escapeHtml(workspaceId)}</p>
        <p><strong>Access key:</strong> ${escapeHtml(accessKey)}</p>
      </div>
      <p><a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Open workspace sign in</a></p>
      <p style="font-size:13px;color:#6b7280">Keep this access key private. The workspace admin can revoke it anytime.</p>
    </div>
  `;

  return { subject, text, html };
}

export function buildWorkspaceVerificationCodeEmail({
  appName,
  organizationName,
  verificationCode,
  expiresInMinutes,
}: {
  appName: string;
  organizationName: string;
  verificationCode: string;
  expiresInMinutes: number;
}) {
  const subject = `Verify your ${appName} workspace email`;
  const intro = `Use this code to finish creating ${organizationName}'s workspace on ${appName}.`;

  return buildOneTimeCodeEmail({
    subject,
    heading: `Verify ${organizationName}`,
    intro,
    verificationCode,
    expiresInMinutes,
    footer: "Only enter this code on the workspace verification screen.",
  });
}

export function buildWorkspaceSignInCodeEmail({
  appName,
  organizationName,
  verificationCode,
  expiresInMinutes,
}: {
  appName: string;
  organizationName: string;
  verificationCode: string;
  expiresInMinutes: number;
}) {
  const subject = `${appName} sign-in code`;
  const intro = `Use this code to complete secure sign-in for ${organizationName}.`;

  return buildOneTimeCodeEmail({
    subject,
    heading: `Sign in to ${organizationName}`,
    intro,
    verificationCode,
    expiresInMinutes,
    footer: "If you did not request this sign-in code, ignore this email.",
  });
}

function getBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildOneTimeCodeEmail({
  subject,
  heading,
  intro,
  verificationCode,
  expiresInMinutes,
  footer,
}: {
  subject: string;
  heading: string;
  intro: string;
  verificationCode: string;
  expiresInMinutes: number;
  footer: string;
}) {
  const text = [
    heading,
    "",
    intro,
    "",
    `Verification code: ${verificationCode}`,
    `Expires in: ${expiresInMinutes} minutes`,
    "",
    footer,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
      <p>${escapeHtml(intro)}</p>
      <div style="border:1px solid #d1d5db;border-radius:14px;padding:18px;margin:18px 0;background:#f9fafb;text-align:center">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#6b7280">Verification code</p>
        <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:0.35em;color:#111827">${escapeHtml(verificationCode)}</p>
        <p style="margin:12px 0 0;font-size:13px;color:#6b7280">Expires in ${escapeHtml(String(expiresInMinutes))} minutes</p>
      </div>
      <p style="font-size:13px;color:#6b7280">${escapeHtml(footer)}</p>
    </div>
  `;

  return { subject, text, html };
}

async function resolveMailConfig(workspaceId: string) {
  const workspaceConfig = await getWorkspaceMailConnection(workspaceId);

  if (workspaceConfig) {
    return {
      source: "workspace" as const,
      fromEmail: workspaceConfig.fromEmail,
      clientId: workspaceConfig.clientId,
      clientSecret: workspaceConfig.clientSecret,
      refreshToken: workspaceConfig.refreshToken,
    };
  }

  if (!isGlobalMailConfigured()) {
    return null;
  }

  return {
    source: "global" as const,
    fromEmail: process.env.GOOGLE_MAIL_FROM?.trim().toLowerCase() ?? "",
    clientId: process.env.GOOGLE_MAIL_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ?? "",
    refreshToken: process.env.GOOGLE_MAIL_REFRESH_TOKEN?.trim() ?? "",
  };
}

async function getGoogleAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch(gmailTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error_description?: string; error?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Google Mail access token request failed."
    );
  }

  return payload.access_token;
}

function encodeGmailMessage({
  from,
  to,
  subject,
  text,
  html,
}: SendMailInput & { from: string }) {
  const boundary = `mail_boundary_${Date.now()}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : "Content-Type: text/plain; charset=UTF-8",
  ];

  if (!html) {
    return getBase64Url([...headers, "", text].join("\r\n"));
  }

  return getBase64Url(
    [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n")
  );
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
