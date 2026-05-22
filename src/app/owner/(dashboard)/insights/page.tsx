import type { Metadata } from "next";

import OwnerDashboardPage from "@/components/workspace/OwnerDashboardPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Insights",
  description:
    "Platform health, adoption signals, and activity insights for the owner dashboard.",
};

export default async function OwnerInsightsPage() {
  await requireOwnerPageSession("/owner/insights");
  const snapshot = await getOwnerDashboardSnapshot();

  return <OwnerDashboardPage section="insights" snapshot={snapshot} />;
}
