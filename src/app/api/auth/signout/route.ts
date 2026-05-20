import { NextResponse } from "next/server";

import { clearWorkspaceSessionCookie } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearWorkspaceSessionCookie(response);
  return response;
}
