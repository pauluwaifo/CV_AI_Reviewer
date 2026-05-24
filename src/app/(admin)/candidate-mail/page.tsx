import type { Metadata } from "next";

import CandidateMailPage from "@/components/analyzer/CandidateMailPage";
import { getAppOrigin } from "@/lib/app-origin";
import {
  getHiringFormDetail,
  listHiringForms,
} from "@/lib/hiring-funnel-store";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Candidate Mail",
  description: "Compose, approve, and send rejection or follow-up emails to candidates.",
};

export default async function CandidateMailWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{
    form?: string | string[];
    application?: string | string[];
  }>;
}) {
  const access = await requireWorkspaceFeaturePageAccess("/candidate-mail", "candidate_mail");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Candidate Mail is currently locked"
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
    <CandidateMailPage
      initialForms={initialForms}
      initialSelectedForm={initialSelectedForm}
      initialSelectedFormId={initialSelectedFormId}
      sessionRole={access.session.role}
      sessionEmail={access.session.email}
    />
  );
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? "" : value?.trim() ?? "";
}
