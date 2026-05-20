import type { Metadata } from "next";

import AnalysisResultsPage from "@/components/analyzer/AnalysisResultsPage";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Candidate Review",
  description: "Review the latest candidate screening result.",
};

export default async function ResultsPage() {
  await requireWorkspacePageSession("/results");
  return <AnalysisResultsPage />;
}
