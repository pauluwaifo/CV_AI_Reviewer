import type { Metadata } from "next";

import AnalysisResultsPage from "@/components/analyzer/AnalysisResultsPage";
import { listScreeningSessions } from "@/lib/screening-session-store";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Candidate Review",
  description: "Review saved candidate screenings and shared workspace notes.",
};

export default async function ResultsPage() {
  const access = await requireWorkspaceFeaturePageAccess("/results", "results");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Results is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  const initialHistory = await listScreeningSessions(access.session.workspaceId).catch(
    () => null
  );

  return <AnalysisResultsPage initialHistory={initialHistory} />;
}
