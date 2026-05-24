import type { Metadata } from "next";

import WorkspaceAnalyticsPage from "@/components/workspace/WorkspaceAnalyticsPage";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { getAppOrigin } from "@/lib/app-origin";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";
import { getWorkspaceAnalyticsSummary } from "@/lib/workspace-analytics";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Track workspace forms, submissions, pipeline movement, and audit activity.",
};

export default async function AnalyticsPage() {
  const access = await requireWorkspaceFeaturePageAccess("/analytics", "analytics");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Analytics is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  const origin = await getAppOrigin();
  const analytics = await getWorkspaceAnalyticsSummary(access.session.workspaceId, origin);

  return <WorkspaceAnalyticsPage analytics={analytics} />;
}
