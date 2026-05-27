import "server-only";

import * as net from "node:net";
import * as tls from "node:tls";

type SendSmtpMailInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SmtpMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

type SmtpResponse = {
  code: number;
  lines: string[];
};

type SmtpCapabilities = {
  authMechanisms: string[];
  supportsStartTls: boolean;
};

type SocketLike = net.Socket | tls.TLSSocket;

export async function sendSmtpMail(
  config: SmtpMailConfig,
  input: SendSmtpMailInput
) {
  const connection = await SmtpConnection.connect(config);

  try {
    const greeting = await connection.readResponse();
    assertSmtpResponse(greeting, [220], "The SMTP server did not accept the connection.");

    let capabilities = await sendEhlo(connection, input.from);

    if (!config.secure && capabilities.supportsStartTls) {
      await connection.sendCommand("STARTTLS");
      const startTlsResponse = await connection.readResponse();
      assertSmtpResponse(
        startTlsResponse,
        [220],
        "The SMTP server could not start a secure TLS session."
      );

      await connection.upgradeToTls(config.host);
      capabilities = await sendEhlo(connection, input.from);
    }

    await authenticateSmtp(connection, capabilities, config);
    await sendEnvelope(connection, input);

    return {
      messageId: extractSmtpMessageId(await sendMessageData(connection, input)),
    };
  } finally {
    await connection.quit().catch(() => undefined);
  }
}

async function sendEhlo(connection: SmtpConnection, fromEmail: string) {
  await connection.sendCommand(`EHLO ${buildEhloName(fromEmail)}`);
  const response = await connection.readResponse();
  assertSmtpResponse(response, [250], "The SMTP server rejected the EHLO handshake.");
  return parseSmtpCapabilities(response);
}

async function authenticateSmtp(
  connection: SmtpConnection,
  capabilities: SmtpCapabilities,
  config: SmtpMailConfig
) {
  if (!config.username.trim() || !config.password.trim()) {
    throw new Error("Add the SMTP username and password before saving this sender.");
  }

  const mechanisms = capabilities.authMechanisms.map((item) => item.toUpperCase());

  if (mechanisms.includes("PLAIN")) {
    const token = Buffer.from(
      `\u0000${config.username}\u0000${config.password}`,
      "utf8"
    ).toString("base64");
    await connection.sendCommand(`AUTH PLAIN ${token}`);
    const response = await connection.readResponse();
    assertSmtpResponse(response, [235], "The SMTP username or password was rejected.");
    return;
  }

  if (mechanisms.includes("LOGIN")) {
    await connection.sendCommand("AUTH LOGIN");
    const loginResponse = await connection.readResponse();
    assertSmtpResponse(
      loginResponse,
      [334],
      "The SMTP server does not support LOGIN authentication for this sender."
    );

    await connection.sendCommand(Buffer.from(config.username, "utf8").toString("base64"));
    const usernameResponse = await connection.readResponse();
    assertSmtpResponse(usernameResponse, [334], "The SMTP username was rejected.");

    await connection.sendCommand(Buffer.from(config.password, "utf8").toString("base64"));
    const passwordResponse = await connection.readResponse();
    assertSmtpResponse(passwordResponse, [235], "The SMTP password was rejected.");
    return;
  }

  throw new Error(
    "This SMTP server does not advertise AUTH PLAIN or AUTH LOGIN. Use a supported relay."
  );
}

async function sendEnvelope(
  connection: SmtpConnection,
  input: SendSmtpMailInput
) {
  await connection.sendCommand(`MAIL FROM:<${input.from}>`);
  assertSmtpResponse(
    await connection.readResponse(),
    [250],
    "The SMTP server rejected the sender address."
  );

  await connection.sendCommand(`RCPT TO:<${input.to}>`);
  assertSmtpResponse(
    await connection.readResponse(),
    [250, 251],
    "The SMTP server rejected the candidate email address."
  );
}

async function sendMessageData(
  connection: SmtpConnection,
  input: SendSmtpMailInput
) {
  await connection.sendCommand("DATA");
  assertSmtpResponse(
    await connection.readResponse(),
    [354],
    "The SMTP server would not accept the message body."
  );

  const message = buildMimeMessage(input);
  await connection.sendRaw(`${dotStuffMessage(message)}\r\n.\r\n`);

  const response = await connection.readResponse();
  assertSmtpResponse(response, [250], "The SMTP server did not accept the email payload.");
  return response;
}

function buildMimeMessage({
  from,
  to,
  subject,
  text,
  html,
}: SendSmtpMailInput) {
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${
    from.split("@")[1] || "workspace.mail"
  }>`;
  const date = new Date().toUTCString();

  if (!html) {
    return [
      `Date: ${date}`,
      `Message-ID: ${messageId}`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeMimeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
    ].join("\r\n");
  }

  const boundary = `workspace_mail_${Date.now().toString(36)}`;

  return [
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function dotStuffMessage(value: string) {
  return value
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function encodeMimeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function parseSmtpCapabilities(response: SmtpResponse): SmtpCapabilities {
  const authMechanisms = new Set<string>();
  let supportsStartTls = false;

  for (const line of response.lines) {
    const capability = line.replace(/^\d{3}[- ]?/, "").trim();

    if (!capability) {
      continue;
    }

    if (capability.toUpperCase() === "STARTTLS") {
      supportsStartTls = true;
      continue;
    }

    if (capability.toUpperCase().startsWith("AUTH ")) {
      for (const mechanism of capability.slice(5).split(/\s+/)) {
        if (mechanism) {
          authMechanisms.add(mechanism.toUpperCase());
        }
      }
    }
  }

  return {
    authMechanisms: Array.from(authMechanisms),
    supportsStartTls,
  };
}

function buildEhloName(fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.trim();
  return domain || "localhost";
}

function assertSmtpResponse(
  response: SmtpResponse,
  expectedCodes: number[],
  message: string
) {
  if (expectedCodes.includes(response.code)) {
    return;
  }

  const detail = response.lines.at(-1)?.replace(/^\d{3}[- ]?/, "").trim();
  throw new Error(detail ? `${message} ${detail}` : message);
}

function extractSmtpMessageId(response: SmtpResponse) {
  const lastLine = response.lines.at(-1) ?? "";
  const queueIdMatch = lastLine.match(/queued as\s+([^\s]+)/i);
  return queueIdMatch?.[1] ?? "";
}

class SmtpConnection {
  private socket: SocketLike;
  private buffer = "";
  private currentLines: string[] = [];
  private queuedResponses: SmtpResponse[] = [];
  private pendingReads: Array<{
    resolve: (value: SmtpResponse) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private readonly dataListener = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    this.flushBuffer();
  };
  private readonly errorListener = (error: Error) => {
    while (this.pendingReads.length > 0) {
      this.pendingReads.shift()?.reject(error);
    }
  };

  private constructor(socket: SocketLike) {
    this.socket = socket;
    this.attachListeners(socket);
  }

  static async connect(config: SmtpMailConfig) {
    const socket = config.secure
      ? await openTlsSocket(config.host, config.port)
      : await openTcpSocket(config.host, config.port);

    return new SmtpConnection(socket);
  }

  async sendCommand(command: string) {
    await this.sendRaw(`${command}\r\n`);
  }

  async sendRaw(data: string) {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(data, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async readResponse() {
    if (this.queuedResponses.length > 0) {
      return this.queuedResponses.shift() as SmtpResponse;
    }

    return new Promise<SmtpResponse>((resolve, reject) => {
      this.pendingReads.push({ resolve, reject });
    });
  }

  async upgradeToTls(host: string) {
    const previousSocket = this.socket;
    this.detachListeners(previousSocket);

    const upgradedSocket = await upgradeSocketToTls(previousSocket, host);
    this.socket = upgradedSocket;
    this.attachListeners(upgradedSocket);
  }

  async quit() {
    try {
      await this.sendCommand("QUIT");
      await this.readResponse().catch(() => undefined);
    } finally {
      this.detachListeners(this.socket);
      this.socket.end();
      this.socket.destroy();
    }
  }

  private attachListeners(socket: SocketLike) {
    socket.on("data", this.dataListener);
    socket.on("error", this.errorListener);
  }

  private detachListeners(socket: SocketLike) {
    socket.off("data", this.dataListener);
    socket.off("error", this.errorListener);
  }

  private flushBuffer() {
    let lineBreakIndex = this.buffer.indexOf("\n");

    while (lineBreakIndex >= 0) {
      const rawLine = this.buffer.slice(0, lineBreakIndex);
      this.buffer = this.buffer.slice(lineBreakIndex + 1);
      this.pushLine(rawLine.replace(/\r$/, ""));
      lineBreakIndex = this.buffer.indexOf("\n");
    }
  }

  private pushLine(line: string) {
    if (!line && this.currentLines.length === 0) {
      return;
    }

    this.currentLines.push(line);

    if (!/^\d{3} /.test(line)) {
      return;
    }

    const response: SmtpResponse = {
      code: Number.parseInt(line.slice(0, 3), 10),
      lines: [...this.currentLines],
    };

    this.currentLines = [];

    if (this.pendingReads.length > 0) {
      this.pendingReads.shift()?.resolve(response);
      return;
    }

    this.queuedResponses.push(response);
  }
}

function openTcpSocket(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function openTlsSocket(host: string, port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
    });

    socket.once("secureConnect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function upgradeSocketToTls(socket: SocketLike, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const upgradedSocket = tls.connect({
      socket,
      servername: host,
    });

    upgradedSocket.once("secureConnect", () => {
      upgradedSocket.off("error", reject);
      resolve(upgradedSocket);
    });
    upgradedSocket.once("error", reject);
  });
}
