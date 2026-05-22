import type { Metadata } from "next";

import OwnerDashboardPage from "@/components/workspace/OwnerDashboardPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Workspaces",
  description:
    "Workspace registry and tenant lifecycle controls for the platform owner.",
};

export default async function OwnerWorkspacesPage() {
  await requireOwnerPageSession("/owner/workspaces");
  const snapshot = await getOwnerDashboardSnapshot();

  return <OwnerDashboardPage section="workspaces" snapshot={snapshot} />;
}
