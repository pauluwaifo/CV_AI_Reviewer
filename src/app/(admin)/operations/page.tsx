import type { Metadata } from "next";

import WorkspaceOperationsPage from "@/components/workspace/WorkspaceOperationsPage";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { getAppOrigin } from "@/lib/app-origin";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";
import { getWorkspaceOperationsSummary } from "@/lib/workspace-operations";

export const metadata: Metadata = {
  title: "Operations",
  description: "Work through recruiter follow-ups, ownership gaps, interviews, and stale candidate reviews.",
};

export default async function OperationsPage() {
  const access = await requireWorkspaceFeaturePageAccess("/operations", "operations");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Operations is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  const origin = await getAppOrigin();
  const operations = await getWorkspaceOperationsSummary(
    access.session.workspaceId,
    origin
  );

  return <WorkspaceOperationsPage operations={operations} />;
}
