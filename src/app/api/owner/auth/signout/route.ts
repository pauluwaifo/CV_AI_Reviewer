import { NextResponse } from "next/server";

import { clearOwnerSessionCookie } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearOwnerSessionCookie(response);
  return response;
}
