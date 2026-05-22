import { NextResponse } from "next/server";

import { generateWorkspaceAssistantReply } from "@/lib/document-intelligence";
import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import type { WorkspaceAssistantMessage } from "@/lib/workspace-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const payload = (await request.json().catch(() => null)) as
      | {
          messages?: WorkspaceAssistantMessage[];
          pathname?: string;
        }
      | null;
    const settings = await getWorkspaceSettings(session.workspaceId);
    const messages = normalizeMessages(payload?.messages);
    const pathname = normalizeAssistantPathname(payload?.pathname);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Add a question before sending it to the workspace assistant." },
        { status: 400 }
      );
    }

    const response = await generateWorkspaceAssistantReply({
      context: {
        appName: settings.appName,
        organizationName: settings.organizationName,
        role: session.role,
        pathname,
      },
      messages,
      provider: "auto",
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't load the workspace assistant right now.",
      },
      { status: 500 }
    );
  }
}

function normalizeMessages(value: WorkspaceAssistantMessage[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (message): message is WorkspaceAssistantMessage =>
        Boolean(
          message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string"
        )
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1_200),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-10);
}

function normalizeAssistantPathname(value: string | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/pipeline";
  }

  return value;
}
