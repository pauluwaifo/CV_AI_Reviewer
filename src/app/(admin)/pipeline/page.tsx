import type { Metadata } from "next";

import PipelineDashboardPage from "@/components/analyzer/PipelineDashboardPage";
import { getAppOrigin } from "@/lib/app-origin";
import {
  getHiringFormDetail,
  listHiringForms,
} from "@/lib/hiring-funnel-store";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
  description: "Create public application forms, review incoming resumes, and manage candidate submissions.",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: Promise<{
    form?: string | string[];
    application?: string | string[];
  }>;
}) {
  const access = await requireWorkspaceFeaturePageAccess("/pipeline", "pipeline");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Hiring Pipeline is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  const params = await searchParams;
  const requestedFormId = normalizeSearchParam(params?.form);
  const origin = await getAppOrigin();
  const initialForms = await listHiringForms(origin, access.session.workspaceId).catch(
    () => null
  );
  const initialSelectedFormId =
    initialForms?.some((form) => form.id === requestedFormId)
      ? requestedFormId
      : initialForms?.[0]?.id || "";
  const initialSelectedForm = initialSelectedFormId
    ? await getHiringFormDetail(
        initialSelectedFormId,
        origin,
        access.session.workspaceId
      ).catch(() => null)
    : null;

  return (
    <PipelineDashboardPage
      initialForms={initialForms}
      initialSelectedForm={initialSelectedForm}
      initialSelectedFormId={initialSelectedFormId}
    />
  );
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? "" : value?.trim() ?? "";
}
