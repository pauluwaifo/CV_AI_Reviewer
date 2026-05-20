import type { Metadata } from "next";

import PipelineDashboardPage from "@/components/analyzer/PipelineDashboardPage";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
  description: "Create public application forms, review incoming resumes, and manage candidate submissions.",
};

export default async function PipelinePage() {
  await requireWorkspacePageSession("/pipeline");
  return <PipelineDashboardPage />;
}
