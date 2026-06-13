import type { Metadata } from "next";

import PpapDashboardPage from "@/components/ppap/PpapDashboardPage";
import { listPpapSubmissions } from "@/lib/ppap-store";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "PPAP Dashboard",
  description: "Review candidate PPAP submissions, scores, and AI narratives.",
};

export default async function PpapDashboardRoute({
  searchParams,
}: {
  searchParams?: Promise<{
    submission?: string | string[];
  }>;
}) {
  const session = await requireWorkspacePageSession("/ppap-dashboard", {
    role: "admin",
  });
  const submissions = await listPpapSubmissions(session.workspaceId).catch(() => []);
  const params = await searchParams;
  const requestedSubmissionId = normalizeSearchParam(params?.submission);
  const selectedSubmissionId =
    submissions.some((submission) => submission.id === requestedSubmissionId)
      ? requestedSubmissionId
      : submissions[0]?.id || "";

  return (
    <PpapDashboardPage
      submissions={submissions}
      selectedSubmissionId={selectedSubmissionId}
      workspaceId={session.workspaceId}
    />
  );
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? "" : value?.trim() ?? "";
}
