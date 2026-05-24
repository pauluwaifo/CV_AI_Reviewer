import "server-only";

import { getHiringFormDetail, listHiringForms } from "@/lib/hiring-funnel-store";
import { listScreeningSessions } from "@/lib/screening-session-store";
import { listWorkspaceAuditEvents } from "@/lib/workspace-audit-store";

export type WorkspaceAnalyticsSummary = Awaited<ReturnType<typeof getWorkspaceAnalyticsSummary>>;

export async function getWorkspaceAnalyticsSummary(
  workspaceId: string,
  origin: string
) {
  const forms = await listHiringForms(origin, workspaceId);
  const formDetails = await Promise.all(
    forms.map((form) => getHiringFormDetail(form.id, origin, workspaceId))
  );
  const applications = formDetails.flatMap((form) => form?.applications ?? []);
  const screenings = await listScreeningSessions(workspaceId).catch(() => []);
  const auditEvents = await listWorkspaceAuditEvents(workspaceId, 12).catch(() => []);

  const averageScore =
    applications.length > 0
      ? Math.round(
          applications.reduce((sum, application) => sum + application.analysis.result.score.value, 0) /
            applications.length
        )
      : 0;
  const shortlistCount = applications.filter((application) =>
    application.analysis.result.recommendation.decision.toLowerCase().includes("shortlist")
  ).length;
  const interviewReadyCount = applications.filter((application) =>
    ["shortlisted", "interview", "offer", "hired"].includes(application.workflow.stage)
  ).length;
  const scheduledInterviewCount = applications.filter(
    (application) => application.workflow.interviewDate
  ).length;
  const completedInterviewCount = applications.filter(
    (application) => application.workflow.interviewScorecard.completedAt
  ).length;
  const recentSubmissionCount = applications.filter((application) =>
    isWithinDays(application.createdAt, 7)
  ).length;
  const highConfidenceCount = applications.filter((application) =>
    application.analysis.result.recommendation.confidence.toLowerCase().includes("high")
  ).length;
  const stageBreakdown = buildCountBreakdown(
    applications.map((application) => application.workflow.stage)
  );
  const decisionBreakdown = buildCountBreakdown(
    applications.map((application) => normalizeDecision(application.analysis.result.recommendation.decision))
  );
  const sourceBreakdown = buildCountBreakdown(
    applications.map((application) => application.analysis.meta.inputKind.toUpperCase())
  );
  const interviewRecommendationBreakdown = buildCountBreakdown(
    applications
      .map((application) => application.workflow.interviewScorecard.recommendation)
      .filter((item) => item && item !== "pending")
  );
  const topForms = formDetails
    .filter(Boolean)
    .map((form) => {
      const applications = form!.applications;
      const averageScore =
        applications.length > 0
          ? Math.round(
              applications.reduce((sum, application) => sum + application.analysis.result.score.value, 0) /
                applications.length
            )
          : 0;

      return {
        id: form!.id,
        title: form!.title,
        applicationCount: applications.length,
        averageScore,
        shortlistCount: applications.filter((application) =>
          application.workflow.stage === "shortlisted"
        ).length,
        interviewCount: applications.filter((application) =>
          application.workflow.stage === "interview"
        ).length,
      };
    })
    .sort((left, right) => right.applicationCount - left.applicationCount || right.averageScore - left.averageScore)
    .slice(0, 5);

  return {
    auditEvents,
    decisionBreakdown,
    forms: {
      active: forms.filter((form) => form.status === "active").length,
      total: forms.length,
      unpublished: forms.filter((form) => form.status === "unpublished").length,
    },
    highlights: [
      `${shortlistCount} candidate${shortlistCount === 1 ? "" : "s"} are already shortlist-ready.`,
      `${highConfidenceCount} screening${highConfidenceCount === 1 ? "" : "s"} came back with high-confidence recommendations.`,
      `${recentSubmissionCount} new submission${recentSubmissionCount === 1 ? "" : "s"} landed in the last 7 days.`,
      `${completedInterviewCount} interview scorecard${completedInterviewCount === 1 ? "" : "s"} have been completed so far.`,
    ],
    interviews: {
      completed: completedInterviewCount,
      recommendationBreakdown: interviewRecommendationBreakdown,
      scheduled: scheduledInterviewCount,
    },
    screenings: {
      total: screenings.length,
      recent: screenings.filter((session) => isWithinDays(session.createdAt, 7)).length,
    },
    sourceBreakdown,
    stageBreakdown,
    submissions: {
      averageScore,
      interviewReadyCount,
      recent: recentSubmissionCount,
      shortlistRate: applications.length > 0 ? Math.round((shortlistCount / applications.length) * 100) : 0,
      total: applications.length,
    },
    topForms,
  };
}

function buildCountBreakdown(values: string[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const normalized = value.trim() || "Unknown";
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function isWithinDays(value: string, days: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return false;
  }

  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function normalizeDecision(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return "Unknown";
  }

  if (normalized.includes("shortlist")) {
    return "Shortlist";
  }

  if (normalized.includes("reject")) {
    return "Reject";
  }

  if (normalized.includes("hold")) {
    return "Hold";
  }

  return value.trim();
}
