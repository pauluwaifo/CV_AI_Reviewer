import type { Metadata } from "next";

import OwnerWorkspaceControlsPage from "@/components/workspace/OwnerWorkspaceControlsPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { listWorkspaceControlSettings } from "@/lib/workspace-control-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Controls",
  description:
    "Control module release and billing activation for every workspace from one owner-only page.",
};

export default async function OwnerControlsPage() {
  await requireOwnerPageSession("/owner/controls");

  const snapshot = await getOwnerDashboardSnapshot();
  const controls = await listWorkspaceControlSettings(
    snapshot.workspaces.map((workspace) => workspace.workspaceId)
  );

  return (
    <OwnerWorkspaceControlsPage
      workspaces={snapshot.workspaces}
      initialControls={controls}
      paystackReady={Boolean(
        process.env.PAYSTACK_SECRET_KEY?.trim() &&
          process.env.PAYSTACK_PUBLIC_KEY?.trim()
      )}
    />
  );
}
