import type { Metadata } from "next";

import { cookies } from "next/headers";

import AnalyzerHomePage from "@/components/analyzer/AnalyzerHomePage";
import {
  getWorkspaceSession,
  isWorkspaceDemoSession,
} from "@/lib/workspace-auth";
import { WORKSPACE_DEMO_COOKIE_NAME } from "@/lib/workspace-demo";

export const metadata: Metadata = {
  title: "Hiring Workspace",
  description:
    "A professional multi-workspace recruiting homepage for AI screening, public applicant intake, and shortlist review.",
};

export default async function HomePage() {
  const session = await getWorkspaceSession();
  const cookieStore = await cookies();
  const hasUsedDemo = Boolean(cookieStore.get(WORKSPACE_DEMO_COOKIE_NAME)?.value);

  return (
    <AnalyzerHomePage
      isAuthenticated={Boolean(session)}
      canManageWorkspace={session?.role === "admin"}
      canStartDemo={!hasUsedDemo}
      hasUsedDemo={hasUsedDemo}
      isDemoSession={isWorkspaceDemoSession(session)}
    />
  );
}
