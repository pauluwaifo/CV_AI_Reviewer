import { NextResponse } from "next/server";

import { generateOwnerAssistantReply } from "@/lib/document-intelligence";
import { getOwnerSession } from "@/lib/owner-auth";
import type { OwnerAssistantMessage } from "@/lib/owner-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getOwnerSession();

  if (!session) {
    return NextResponse.json(
      { error: "Your owner session expired. Sign in again to use the owner assistant." },
      { status: 401 }
    );
  }

  try {
    const payload = (await request.json().catch(() => null)) as
      | {
          messages?: OwnerAssistantMessage[];
          pathname?: string;
        }
      | null;
    const messages = normalizeMessages(payload?.messages);
    const pathname = normalizeOwnerAssistantPathname(payload?.pathname);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Add a question before sending it to the owner assistant." },
        { status: 400 }
      );
    }

    const response = await generateOwnerAssistantReply({
      context: {
        email: session.email,
        pathname,
      },
      messages,
      provider: "auto",
      workspaceId: session.workspaceId,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't load the owner assistant right now.",
      },
      { status: 500 }
    );
  }
}

function normalizeMessages(value: OwnerAssistantMessage[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (message): message is OwnerAssistantMessage =>
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

function normalizeOwnerAssistantPathname(value: string | undefined) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/owner") ||
    value.startsWith("//")
  ) {
    return "/owner";
  }

  return value;
}
