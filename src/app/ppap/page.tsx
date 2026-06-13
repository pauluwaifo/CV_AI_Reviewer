import type { Metadata } from "next";

import PpapAssessmentPage from "@/components/ppap/PpapAssessmentPage";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const metadata: Metadata = {
  title: "PPAP Assessment",
  description: "Complete the PPAP personality assessment and receive a developmental summary.",
};

export default async function PpapPage({
  searchParams,
}: {
  searchParams?: Promise<{
    workspace?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const workspaceId = sanitizeWorkspaceId(normalizeSearchParam(params?.workspace));
  const settings = await getWorkspaceSettings(workspaceId);

  return <PpapAssessmentPage settings={settings} workspaceId={workspaceId} />;
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? "" : value?.trim() ?? "";
}
