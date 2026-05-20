import type { Metadata } from "next";

import OwnerDashboardPage from "@/components/workspace/OwnerDashboardPage";
import { getOwnerDashboardSnapshot } from "@/lib/owner-dashboard-store";
import { requireOwnerPageSession } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Dashboard",
  description:
    "Private platform owner dashboard for monitoring company workspaces and tenant activity.",
};

export default async function OwnerPage() {
  const [session, snapshot] = await Promise.all([
    requireOwnerPageSession("/owner"),
    getOwnerDashboardSnapshot(),
  ]);

  return <OwnerDashboardPage ownerEmail={session.email} snapshot={snapshot} />;
}
