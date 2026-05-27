import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceDemoSession,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { prepareWorkspaceBillingCheckout } from "@/lib/workspace-billing";
import { createWorkspaceDemoRestrictedResponse } from "@/lib/workspace-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  if (isWorkspaceDemoSession(session)) {
    return createWorkspaceDemoRestrictedResponse(
      "Billing checkout is disabled in the one-time demo."
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      billingInterval: "monthly" | "yearly";
      email: string;
      firstName: string;
      intent: "current" | "upgrade";
      lastName: string;
      planKey: string;
      phone: string;
    }>;
    const checkout = await prepareWorkspaceBillingCheckout({
      customer: {
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
      },
      billingInterval: payload.billingInterval,
      intent: payload.intent === "upgrade" ? "upgrade" : "current",
      planKey: payload.planKey,
      requesterEmail: session.email,
      workspaceId: session.workspaceId,
    });

    return NextResponse.json(checkout);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't initialize workspace billing right now.",
      },
      { status: 500 }
    );
  }
}
