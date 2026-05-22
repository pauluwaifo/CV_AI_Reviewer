import type { Metadata } from "next";

import OwnerDashboardPage from "@/components/workspace/OwnerDashboardPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Overview",
  description:
    "Overview dashboard for the platform owner across every company workspace.",
};

export default async function OwnerOverviewPage() {
  await requireOwnerPageSession("/owner");
  const snapshot = await getOwnerDashboardSnapshot();

  return <OwnerDashboardPage section="overview" snapshot={snapshot} />;
}
