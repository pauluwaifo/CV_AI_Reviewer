import "server-only";

import {
  getHiringFormDetail,
  listHiringForms,
} from "@/lib/hiring-funnel-store";
import { describeHiringApplicationStage } from "@/lib/hiring-application-workflow";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import type { HiringApplicationRecord } from "@/types/hiring-funnel";

type WorkspaceOperationPriority = "high" | "medium" | "low";

type WorkspaceOperationItem = {
  applicationId: string;
  candidateName: string;
  description: string;
  dueAt: string | null;
  formId: string;
  formTitle: string;
  id: string;
  kind:
    | "follow_up_overdue"
    | "follow_up_due"
    | "interview_upcoming"
    | "stale_review"
    | "unassigned";
  mailHref: string;
  nextStep: string;
  ownerEmail: string;
  priority: WorkspaceOperationPriority;
  reviewHref: string;
  stageLabel: string;
  title: string;
};

export type WorkspaceOperationsSnapshot = {
  sections: {
    interviews: WorkspaceOperationItem[];
    overdue: WorkspaceOperationItem[];
    stale: WorkspaceOperationItem[];
    unassigned: WorkspaceOperationItem[];
    upcoming: WorkspaceOperationItem[];
  };
  totals: {
    activeCandidates: number;
    interviewsSoon: number;
    overdue: number;
    stale: number;
    unassigned: number;
    upcoming: number;
  };
};

export type WorkspaceOperationsSummary = Awaited<
  ReturnType<typeof getWorkspaceOperationsSummary>
>;

export async function getWorkspaceOperationsSummary(
  workspaceId: string,
  origin: string
) {
  const forms = await listHiringForms(origin, workspaceId);
  const formDetails = await Promise.all(
    forms.map((form) => getHiringFormDetail(form.id, origin, workspaceId))
  );
  const applications = formDetails.flatMap((form) => form?.applications ?? []);
  const formTitles = Object.fromEntries(
    formDetails
      .filter(Boolean)
      .map((form) => [form!.id, form!.title] as const)
  );

  return buildWorkspaceOperationsSnapshot({
    applications,
    formTitles,
    workspaceId,
  });
}

export function buildWorkspaceOperationsSnapshot({
  applications,
  formTitles,
  workspaceId,
}: {
  applications: HiringApplicationRecord[];
  formTitles: Record<string, string>;
  workspaceId: string;
}): WorkspaceOperationsSnapshot {
  const sections: WorkspaceOperationsSnapshot["sections"] = {
    interviews: [],
    overdue: [],
    stale: [],
    unassigned: [],
    upcoming: [],
  };

  applications.forEach((application) => {
    if (isClosedStage(application.workflow.stage)) {
      return;
    }

    const candidateName =
      application.applicant.fullName.trim() || application.resumeFile.fileName;
    const formTitle = formTitles[application.formId] || "Hiring form";
    const stageLabel = describeHiringApplicationStage(application.workflow.stage);
    const reviewHref = appendWorkspaceQuery(
      `/pipeline?form=${encodeURIComponent(application.formId)}&application=${encodeURIComponent(application.id)}`,
      workspaceId
    );
    const mailHref = appendWorkspaceQuery(
      `/candidate-mail?form=${encodeURIComponent(application.formId)}&application=${encodeURIComponent(application.id)}`,
      workspaceId
    );

    const shared = {
      applicationId: application.id,
      candidateName,
      formId: application.formId,
      formTitle,
      mailHref,
      nextStep: application.workflow.nextStep,
      ownerEmail: application.workflow.ownerEmail,
      reviewHref,
      stageLabel,
    };

    if (!application.workflow.ownerEmail.trim()) {
      sections.unassigned.push({
        ...shared,
        description: `${candidateName} is still unassigned in ${stageLabel}.`,
        dueAt: null,
        id: `unassigned:${application.id}`,
        kind: "unassigned",
        priority: "medium",
        title: "Assign an owner",
      });
    }

    if (application.workflow.interviewDate && !application.workflow.interviewScorecard.completedAt) {
      const timing = classifyRelativeDate(application.workflow.interviewDate, 36);

      if (timing === "upcoming" || timing === "overdue") {
        sections.interviews.push({
          ...shared,
          description: `${candidateName} has an interview scheduled soon and still needs the scorecard completed.`,
          dueAt: application.workflow.interviewDate,
          id: `interview:${application.id}`,
          kind: "interview_upcoming",
          priority: timing === "overdue" ? "high" : "medium",
          title: "Prepare or finish interview review",
        });
      }
    }

    if (application.workflow.followUpAt) {
      const timing = classifyRelativeDate(application.workflow.followUpAt, 36);

      if (timing === "overdue") {
        sections.overdue.push({
          ...shared,
          description: `${candidateName} has a follow-up reminder that is now overdue.`,
          dueAt: application.workflow.followUpAt,
          id: `follow-up-overdue:${application.id}`,
          kind: "follow_up_overdue",
          priority: "high",
          title: "Overdue follow-up",
        });
      } else if (timing === "upcoming") {
        sections.upcoming.push({
          ...shared,
          description: `${candidateName} is due for follow-up soon.`,
          dueAt: application.workflow.followUpAt,
          id: `follow-up-upcoming:${application.id}`,
          kind: "follow_up_due",
          priority: "medium",
          title: "Follow-up due soon",
        });
      }
    }

    if (isWorkflowStale(application)) {
      sections.stale.push({
        ...shared,
        description: `${candidateName} has not been contacted recently, so the review may be stalling.`,
        dueAt: application.workflow.lastContactedAt || application.createdAt,
        id: `stale:${application.id}`,
        kind: "stale_review",
        priority: "low",
        title: "Review is going stale",
      });
    }
  });

  sections.overdue.sort(compareOperationItems);
  sections.upcoming.sort(compareOperationItems);
  sections.interviews.sort(compareOperationItems);
  sections.unassigned.sort(compareOperationItems);
  sections.stale.sort(compareOperationItems);

  return {
    sections,
    totals: {
      activeCandidates: applications.filter(
        (application) => !isClosedStage(application.workflow.stage)
      ).length,
      interviewsSoon: sections.interviews.length,
      overdue: sections.overdue.length,
      stale: sections.stale.length,
      unassigned: sections.unassigned.length,
      upcoming: sections.upcoming.length,
    },
  };
}

function compareOperationItems(
  left: WorkspaceOperationItem,
  right: WorkspaceOperationItem
) {
  const leftTime = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;

  return leftTime - rightTime || left.candidateName.localeCompare(right.candidateName);
}

function classifyRelativeDate(value: string, upcomingWindowHours: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return "none" as const;
  }

  const delta = time - Date.now();

  if (delta < 0) {
    return "overdue" as const;
  }

  return delta <= upcomingWindowHours * 60 * 60 * 1000 ? ("upcoming" as const) : ("none" as const);
}

function isClosedStage(stage: HiringApplicationRecord["workflow"]["stage"]) {
  return stage === "hired" || stage === "rejected";
}

function isWorkflowStale(application: HiringApplicationRecord) {
  const stage = application.workflow.stage;

  if (!["reviewing", "shortlisted", "interview", "offer", "on_hold"].includes(stage)) {
    return false;
  }

  const reference =
    application.workflow.lastContactedAt ||
    application.workflow.followUpAt ||
    application.workflow.interviewDate ||
    application.createdAt;
  const time = new Date(reference).getTime();

  if (Number.isNaN(time)) {
    return false;
  }

  return Date.now() - time >= 4 * 24 * 60 * 60 * 1000;
}
