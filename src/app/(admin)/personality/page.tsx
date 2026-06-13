import type { Metadata } from "next";

import PersonalityAssessmentPage from "@/components/analyzer/PersonalityAssessmentPage";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Personality Assessment",
  description:
    "Run a Hogan-inspired work-style assessment and review bright side, derailers, and values signals.",
};

export default async function PersonalityPage() {
  const access = await requireWorkspaceFeaturePageAccess(
    "/personality",
    "personality_assessment"
  );

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Personality Assessment is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  return <PersonalityAssessmentPage />;
}
