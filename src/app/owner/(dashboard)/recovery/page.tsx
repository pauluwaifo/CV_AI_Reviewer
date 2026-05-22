import type { Metadata } from "next";

import OwnerDashboardPage from "@/components/workspace/OwnerDashboardPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Recovery",
  description:
    "Access recovery and key reset management for the platform owner.",
};

export default async function OwnerRecoveryPage() {
  await requireOwnerPageSession("/owner/recovery");
  const snapshot = await getOwnerDashboardSnapshot();

  return <OwnerDashboardPage section="recovery" snapshot={snapshot} />;
}
