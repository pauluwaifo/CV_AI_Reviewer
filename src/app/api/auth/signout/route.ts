import { NextResponse } from "next/server";

import {
  clearWorkspaceSessionCookie,
  revokeWorkspaceSession,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await revokeWorkspaceSession(request).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  clearWorkspaceSessionCookie(response);
  return response;
}
