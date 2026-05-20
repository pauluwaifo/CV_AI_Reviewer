import { NextResponse } from "next/server";

import {
  applyOwnerSessionCookie,
  authenticateOwnerCredentials,
  createOwnerSession,
  normalizeOwnerNextPath,
} from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<{
      email: string;
      accessKey: string;
      next: string;
    }>;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const accessKey =
      typeof payload.accessKey === "string" ? payload.accessKey.trim() : "";
    const nextPath = normalizeOwnerNextPath(payload.next);

    if (!email || !accessKey) {
      return NextResponse.json(
        { error: "Enter your owner email and access key." },
        { status: 400 }
      );
    }

    if (!authenticateOwnerCredentials(email, accessKey)) {
      return NextResponse.json(
        { error: "The owner email or access key is invalid." },
        { status: 401 }
      );
    }

    const { token, maxAgeSeconds, session } = createOwnerSession(email);
    const response = NextResponse.json({
      ok: true,
      nextPath,
      session,
    });

    applyOwnerSessionCookie(response, token, maxAgeSeconds);

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "I couldn't start the owner session right now." },
      { status: 500 }
    );
  }
}
