import "server-only";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailDeliveryResult =
  | { status: "sent"; provider: "gmail"; messageId: string }
  | { status: "skipped"; reason: string };

const gmailTokenUrl = "https://oauth2.googleapis.com/token";
const gmailSendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function isMailConfigured() {
  return Boolean(
    process.env.GOOGLE_MAIL_CLIENT_ID?.trim() &&
      process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_MAIL_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_MAIL_FROM?.trim()
  );
}

export async function sendMail(input: SendMailInput): Promise<MailDeliveryResult> {
  if (!isMailConfigured()) {
    return {
      status: "skipped",
      reason:
        "Google mail env values are not configured, so no email was sent.",
    };
  }

  const accessToken = await getGoogleAccessToken();
  const raw = encodeGmailMessage({
    ...input,
    from: process.env.GOOGLE_MAIL_FROM?.trim() ?? "",
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

function getBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGoogleAccessToken() {
  const response = await fetch(gmailTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_MAIL_CLIENT_ID?.trim() ?? "",
      client_secret: process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ?? "",
      refresh_token: process.env.GOOGLE_MAIL_REFRESH_TOKEN?.trim() ?? "",
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
