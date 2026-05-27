import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceDemoSession,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  getWorkspaceBillingSummary,
  verifyWorkspaceBillingCheckout,
} from "@/lib/workspace-billing";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { createWorkspaceDemoRestrictedResponse } from "@/lib/workspace-demo";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";

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
      "Billing verification is disabled in the one-time demo."
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      reference: string;
    }>;
    const reference = typeof payload.reference === "string" ? payload.reference.trim() : "";

    if (!reference) {
      return NextResponse.json(
        { error: "A Paystack reference is required for verification." },
        { status: 400 }
      );
    }

    const result = await verifyWorkspaceBillingCheckout(reference);
    const summary = await getWorkspaceBillingSummary(session.workspaceId);
    const transaction = result.transaction;

    if (transaction && (transaction.status === "success" || summary.controls.billing.status === "active")) {
      await createWorkspaceAuditEvent({
        action: "billing.payment_succeeded",
        actorEmail: session.email,
        actorRole: session.role,
        metadata: {
          amountKobo: transaction.amountKobo,
          reference: transaction.reference,
          status: transaction.status,
        },
        summary: `Workspace payment verified for ${transaction.reference}.`,
        targetId: transaction.id,
        targetType: "billing_transaction",
        workspaceId: session.workspaceId,
      }).catch(() => undefined);
      await emitWorkspaceIntegrationEvent(session.workspaceId, "billing.payment_succeeded", {
        amountKobo: transaction.amountKobo,
        billingUrl: `${new URL(request.url).origin}${appendWorkspaceQuery("/billing", session.workspaceId)}`,
        planName: summary.controls.billing.planName,
        reference: transaction.reference,
        status: transaction.status,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      billing: summary,
      transaction: result.transaction,
      verification: result.verification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't verify that workspace payment right now.",
      },
      { status: 500 }
    );
  }
}
