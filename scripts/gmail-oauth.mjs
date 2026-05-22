import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";

const port = Number(process.env.GMAIL_OAUTH_PORT || 5173);
const redirectPath = "/oauth2callback";
const redirectUri = `http://127.0.0.1:${port}${redirectPath}`;
const scope = "https://www.googleapis.com/auth/gmail.send";

loadDotEnv(".env.local");
loadDotEnv(".env");

const clientId = process.env.GOOGLE_MAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    [
      "Missing GOOGLE_MAIL_CLIENT_ID or GOOGLE_MAIL_CLIENT_SECRET.",
      "Add them to .env.local first, then run npm run gmail:oauth again.",
    ].join("\n")
  );
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scope);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", redirectUri);

  if (requestUrl.pathname !== redirectPath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const error = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");

  if (error || !code) {
    response.writeHead(400, { "Content-Type": "text/html" });
    response.end(`<h1>OAuth failed</h1><p>${escapeHtml(error || "Missing code")}</p>`);
    server.close();
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokenPayload = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenPayload.refresh_token) {
      throw new Error(
        tokenPayload.error_description ||
          tokenPayload.error ||
          "Google did not return a refresh token."
      );
    }

    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      "<h1>Gmail OAuth complete</h1><p>You can close this tab and return to your terminal.</p>"
    );

    console.log("\nGmail refresh token generated:\n");
    console.log(tokenPayload.refresh_token);
    console.log("\nAdd this to .env.local and Vercel/Render as:");
    console.log(`GOOGLE_MAIL_REFRESH_TOKEN=${tokenPayload.refresh_token}\n`);
  } catch (tokenError) {
    response.writeHead(500, { "Content-Type": "text/html" });
    response.end(`<h1>Token exchange failed</h1><p>${escapeHtml(tokenError.message)}</p>`);
    console.error("\nToken exchange failed:");
    console.error(tokenError.message);
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("Gmail OAuth helper is ready.");
  console.log(`\nRedirect URI:\n${redirectUri}`);
  console.log(
    "\nIf Google says redirect_uri_mismatch, add the Redirect URI above to your Google OAuth client."
  );
  console.log("\nOpen this URL to authorize Gmail sending:\n");
  console.log(authUrl.toString());
  openBrowser(authUrl.toString());
});

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function openBrowser(url) {
  const escapedUrl = url.replace(/"/g, '\\"');
  const command =
    process.platform === "win32"
      ? `start "" "${escapedUrl}"`
      : process.platform === "darwin"
        ? `open "${escapedUrl}"`
        : `xdg-open "${escapedUrl}"`;

  exec(command, () => undefined);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
