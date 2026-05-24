import type { Metadata } from "next";

import WorkspaceBillingPage from "@/components/workspace/WorkspaceBillingPage";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";
import { getWorkspaceBillingSummary } from "@/lib/workspace-billing";

export const metadata: Metadata = {
  title: "Billing",
  description:
    "View workspace billing status, Paystack checkout readiness, and recent payment activity.",
};

export default async function BillingPage() {
  const session = await requireWorkspacePageSession("/billing", { role: "admin" });
  const summary = await getWorkspaceBillingSummary(session.workspaceId);

  return <WorkspaceBillingPage initialSummary={summary} />;
}
