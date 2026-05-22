import type { Metadata } from "next";

import AnalyzerHomePage from "@/components/analyzer/AnalyzerHomePage";
import { getWorkspaceSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Hiring Workspace",
  description:
    "A professional multi-workspace recruiting homepage for AI screening, public applicant intake, and shortlist review.",
};

export default async function HomePage() {
  const session = await getWorkspaceSession();

  return (
    <AnalyzerHomePage
      isAuthenticated={Boolean(session)}
      canManageWorkspace={session?.role === "admin"}
    />
  );
}
