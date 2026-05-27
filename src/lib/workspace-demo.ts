import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createCandidateEmailDraft } from "@/lib/candidate-email-store";
import {
  createHiringApplication,
  createHiringForm,
  listHiringForms,
  saveUploadedBinary,
  updateHiringApplicationWorkflow,
} from "@/lib/hiring-funnel-store";
import {
  createWorkspaceAccessRecord,
  getWorkspaceAccessRecord,
} from "@/lib/workspace-access-store";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import {
  applyWorkspaceSessionCookie,
  createWorkspaceSession,
  hashWorkspaceAccessKey,
  isWorkspaceDemoSession,
  type WorkspaceSession,
} from "@/lib/workspace-auth";
import { saveWorkspaceControlSettings } from "@/lib/workspace-control-store";
import { createScreeningSession, listScreeningSessions } from "@/lib/screening-session-store";
import {
  getWorkspacePublicSnapshot,
} from "@/lib/workspace-settings";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/workspace-settings-store";
import { BASE_WORKSPACE_BILLING_PLAN_KEY } from "@/lib/workspace-controls";
import type { CandidateEmailDraftRecord } from "@/types/candidate-email";
import type { AnalysisResponse, RoleSetup } from "@/types/document-intelligence";
import type { ApplicantProfile, HiringApplicationRecord } from "@/types/hiring-funnel";

export const WORKSPACE_DEMO_COOKIE_NAME = "hiring-workspace-demo";
export const WORKSPACE_DEMO_DURATION_SECONDS = 60 * 30;

const WORKSPACE_DEMO_LOCKOUT_SECONDS = 60 * 60 * 24 * 365;
const WORKSPACE_DEMO_WORKSPACE_PREFIX = "demo-lab";
const WORKSPACE_DEMO_CONTACT_EMAIL = "demo@northstarlabs.example";
const WORKSPACE_DEMO_SESSION_EMAIL = "visitor@northstarlabs.example";
const WORKSPACE_DEMO_BASE_URL = "https://demo.local";

export function getWorkspaceDemoCookieValue(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = segment.trim().split("=");

    if (rawName !== WORKSPACE_DEMO_COOKIE_NAME) {
      continue;
    }

    return rawValueParts.join("=") || null;
  }

  return null;
}

export function applyWorkspaceDemoCookie(response: NextResponse) {
  response.cookies.set({
    name: WORKSPACE_DEMO_COOKIE_NAME,
    value: "used",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKSPACE_DEMO_LOCKOUT_SECONDS,
  });
}

export function createWorkspaceDemoUnavailableResponse(
  message = "This browser has already used its one-time product demo. Create a workspace or sign in to continue."
) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function createWorkspaceDemoRestrictedResponse(
  message = "This action is disabled in the one-time demo. Create a real workspace to continue."
) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function startWorkspaceDemo() {
  const workspaceId = `${WORKSPACE_DEMO_WORKSPACE_PREFIX}-${randomBytes(6).toString("hex")}`;

  await seedWorkspaceDemoWorkspace(workspaceId);

  return createWorkspaceSession(
    {
      workspaceId,
      role: "admin",
      principalType: "demo",
      email: WORKSPACE_DEMO_SESSION_EMAIL,
      memberId: null,
    },
    false,
    {
      maxAgeSeconds: WORKSPACE_DEMO_DURATION_SECONDS,
    }
  );
}

export function applyWorkspaceDemoSessionCookies(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number
) {
  applyWorkspaceSessionCookie(response, token, maxAgeSeconds);
  applyWorkspaceDemoCookie(response);
}

export function shouldBlockWorkspaceDemoAction(session: WorkspaceSession | null | undefined) {
  return isWorkspaceDemoSession(session);
}

async function seedWorkspaceDemoWorkspace(workspaceId: string) {
  const [existingForms, existingScreenings] = await Promise.all([
    listHiringForms(WORKSPACE_DEMO_BASE_URL, workspaceId).catch(() => []),
    listScreeningSessions(workspaceId).catch(() => []),
  ]);

  if (existingForms.length > 0 || existingScreenings.length > 0) {
    return;
  }

  await saveWorkspaceSettings(workspaceId, {
    appName: "HR Board Demo",
    organizationName: "Northstar Labs",
    tagline:
      "A guided recruiting workspace with seeded candidates, forms, workflows, analytics, and results.",
    formAccent: "#0f766e",
  });

  await saveWorkspaceControlSettings(workspaceId, {
    billing: {
      enabled: true,
      provider: "paystack",
      currency: "NGN",
      monthlyAmountKobo: 145_000,
      monthlyPlanCode: "demo-growth-monthly",
      yearlyAmountKobo: 1_450_000,
      yearlyPlanCode: "demo-growth-yearly",
      interval: "monthly",
      planName: "Workspace Growth",
      planCode: "demo-growth-monthly",
      amountKobo: 145_000,
      activePlanKey: BASE_WORKSPACE_BILLING_PLAN_KEY,
      activePlanKind: "current",
      status: "active",
      customerEmail: WORKSPACE_DEMO_CONTACT_EMAIL,
      lastReference: "demo-seeded-reference",
      lastPaidAt: addRelativeDays(-18),
      upgradePlans: [
        {
          key: "scale",
          name: "Workspace Scale",
          monthlyAmountKobo: 245_000,
          monthlyPlanCode: "demo-scale-monthly",
          yearlyAmountKobo: 2_450_000,
          yearlyPlanCode: "demo-scale-yearly",
        },
      ],
    },
  });

  const accessRecord = await getWorkspaceAccessRecord(workspaceId);

  if (!accessRecord) {
    await createWorkspaceAccessRecord({
      workspaceId,
      contactEmail: WORKSPACE_DEMO_CONTACT_EMAIL,
      accessKeyHash: hashWorkspaceAccessKey(`demo-${randomBytes(12).toString("hex")}`),
    }).catch(() => undefined);
  }

  const workspace = getWorkspacePublicSnapshot(await getWorkspaceSettings(workspaceId));

  const frontendRole: RoleSetup = {
    title: "Frontend Engineer",
    seniority: "Mid-level",
    location: "Hybrid, Lagos",
    summary:
      "Ship polished recruiter-facing product flows, collaborate with design, and improve performance across the hiring workspace.",
    mustHaveSkills: ["React", "TypeScript", "Product thinking"],
    niceToHaveSkills: ["Accessibility", "Design systems", "Next.js"],
    interviewFocus: [
      "How the candidate breaks ambiguous product requirements into shippable work",
      "Evidence of thoughtful UI architecture and frontend ownership",
      "Tradeoffs between speed, polish, and maintainability",
    ],
  };
  const peopleOpsRole: RoleSetup = {
    title: "People Operations Manager",
    seniority: "Senior",
    location: "Remote, West Africa",
    summary:
      "Own candidate communication, interview coordination, and operational rhythm across a growing cross-functional hiring team.",
    mustHaveSkills: ["Stakeholder management", "Process design", "Candidate experience"],
    niceToHaveSkills: ["ATS operations", "Employer branding", "Analytics"],
    interviewFocus: [
      "How the candidate builds reliable coordination systems under hiring pressure",
      "Examples of improving candidate communication or interview turnaround time",
      "How they use metrics to spot breakdowns in the process",
    ],
  };

  const frontendForm = await createHiringForm({
    workspaceId,
    workspace,
    title: "Frontend Engineer",
    team: "Product Engineering",
    intro:
      "We are hiring a frontend engineer to improve candidate workflows, pipeline visibility, and recruiter productivity.",
    analysisGoal:
      "Prioritize strong UI systems thinking, React execution, and evidence of collaborating closely with product or design.",
    roleSetup: frontendRole,
    screeningPolicy: {
      autoFilterLowRoleMatch: true,
      minimumRoleMatchScore: 55,
    },
    customQuestions: [
      {
        id: "portfolio-story",
        label: "Tell us about one frontend system you designed end-to-end.",
        placeholder: "What problem were you solving, and what tradeoffs did you make?",
        required: true,
      },
    ],
    formFields: [
      {
        id: "full-name",
        label: "Full name",
        placeholder: "Candidate name",
        helper: "",
        required: true,
        type: "short_text",
        systemKey: "fullName",
      },
      {
        id: "email",
        label: "Email",
        placeholder: "name@example.com",
        helper: "",
        required: true,
        type: "email",
        systemKey: "email",
      },
      {
        id: "portfolio",
        label: "Portfolio",
        placeholder: "Portfolio or relevant project link",
        helper: "",
        required: false,
        type: "url",
        systemKey: "portfolio",
      },
      {
        id: "resume",
        label: "Resume",
        placeholder: "",
        helper: "Attach a CV or resume.",
        required: true,
        type: "file",
        systemKey: "resumeFile",
      },
    ],
    expiresAt: addRelativeDays(20),
    jdAttachment: {
      fileName: "frontend-engineer-demo-jd.txt",
      inputKind: "text",
      mimeType: "text/plain",
      extractedCharacters: 514,
      text:
        "Northstar Labs is hiring a frontend engineer to ship recruiter-facing workflows across screening, analytics, and candidate communication. The role requires React, TypeScript, clear product judgment, and a strong instinct for user experience under real hiring pressure.",
    },
  });
  const peopleOpsForm = await createHiringForm({
    workspaceId,
    workspace,
    title: "People Operations Manager",
    team: "People & Talent",
    intro:
      "Lead candidate operations, coordinate interview loops, and keep the hiring system moving smoothly.",
    analysisGoal:
      "Look for clear process ownership, candidate empathy, and examples of improving hiring turnaround time.",
    roleSetup: peopleOpsRole,
    screeningPolicy: {
      autoFilterLowRoleMatch: false,
      minimumRoleMatchScore: 50,
    },
    customQuestions: [
      {
        id: "candidate-experience",
        label: "Describe a time you improved candidate communication at scale.",
        placeholder: "What changed and what was the result?",
        required: true,
      },
    ],
    formFields: [
      {
        id: "full-name",
        label: "Full name",
        placeholder: "Candidate name",
        helper: "",
        required: true,
        type: "short_text",
        systemKey: "fullName",
      },
      {
        id: "email",
        label: "Email",
        placeholder: "name@example.com",
        helper: "",
        required: true,
        type: "email",
        systemKey: "email",
      },
      {
        id: "location",
        label: "Location",
        placeholder: "City, Country",
        helper: "",
        required: false,
        type: "short_text",
        systemKey: "location",
      },
      {
        id: "resume",
        label: "Resume",
        placeholder: "",
        helper: "Attach a CV or resume.",
        required: true,
        type: "file",
        systemKey: "resumeFile",
      },
    ],
    expiresAt: addRelativeDays(14),
    jdAttachment: {
      fileName: "people-ops-demo-jd.txt",
      inputKind: "text",
      mimeType: "text/plain",
      extractedCharacters: 432,
      text:
        "This role coordinates interview operations, candidate communications, scheduling, and hiring reporting. Strong stakeholder management, process design, and candidate empathy are essential.",
    },
  });

  const adaAnalysis = buildDemoAnalysisResponse({
    candidateName: "Ada Obi",
    headline: "Frontend Engineer with strong React product delivery experience",
    summary:
      "Ada has shipped recruiter-facing workflows, reusable UI systems, and metrics-driven iteration loops in two product teams.",
    score: 91,
    decision: "Shortlist",
    confidence: "High",
    location: "Lagos",
    yearsExperience: "5 years",
    strengths: [
      "Clear evidence of React and TypeScript ownership on production products",
      "Strong portfolio story with measurable UX improvements",
      "Good collaboration signals with product and design partners",
    ],
    concerns: [
      "Would still verify how she handles ambiguous prioritization across multiple squads",
    ],
    roleSetup: frontendRole,
    highlightExcerpt:
      "Led the redesign of a talent dashboard used by recruiters daily, improving task completion and reducing review friction.",
  });
  const tundeAnalysis = buildDemoAnalysisResponse({
    candidateName: "Tunde Hassan",
    headline: "Frontend engineer with strong execution and growing systems depth",
    summary:
      "Tunde shows solid shipping velocity, credible UI implementation experience, and useful interview signals, but needs a deeper systems discussion.",
    score: 76,
    decision: "Interview",
    confidence: "Medium",
    location: "Abuja",
    yearsExperience: "4 years",
    strengths: [
      "Strong delivery record across customer-facing interfaces",
      "Credible TypeScript usage and component ownership",
      "Positive signals around cross-functional communication",
    ],
    concerns: [
      "Less evidence of owning large design system decisions",
      "Would probe performance tradeoffs in more depth",
    ],
    roleSetup: frontendRole,
    highlightExcerpt:
      "Built reusable dashboard components for a high-volume operations team and improved load time on analytics views.",
  });
  const noorAnalysis = buildDemoAnalysisResponse({
    candidateName: "Noor Adebayo",
    headline: "Frontend developer with promising fundamentals but mixed role alignment",
    summary:
      "Noor has encouraging frontend experience, though the role match is less consistent across product ownership and recruiter workflow complexity.",
    score: 58,
    decision: "Hold",
    confidence: "Medium",
    location: "Ibadan",
    yearsExperience: "3 years",
    strengths: [
      "Solid foundational React knowledge",
      "Evidence of shipping smaller UI features end-to-end",
    ],
    concerns: [
      "Limited proof of leading product tradeoffs or system architecture",
      "Portfolio examples are narrower than the role benchmark",
    ],
    roleSetup: frontendRole,
    highlightExcerpt:
      "Implemented responsive customer dashboard pages and maintained several internal admin views.",
  });
  const chidinmaAnalysis = buildDemoAnalysisResponse({
    candidateName: "Chidinma Eze",
    headline: "People operations leader with strong candidate experience instincts",
    summary:
      "Chidinma demonstrates excellent coordination judgment, operational discipline, and clear examples of improving candidate communication at scale.",
    score: 84,
    decision: "Shortlist",
    confidence: "High",
    location: "Remote",
    yearsExperience: "7 years",
    strengths: [
      "Strong process design examples tied to hiring throughput",
      "Credible stakeholder management across recruiting managers and interviewers",
      "Excellent candidate communication and coordination ownership",
    ],
    concerns: [
      "Would verify current comfort level with analytics tooling depth",
    ],
    roleSetup: peopleOpsRole,
    highlightExcerpt:
      "Introduced interview readiness checklists and candidate updates that reduced no-show risk and improved hiring manager satisfaction.",
  });

  const adaApplication = await createDemoApplication({
    workspaceId,
    formId: frontendForm.id,
    applicant: {
      fullName: "Ada Obi",
      email: "ada.obi@example.com",
      phone: "+234 801 100 1001",
      location: "Lagos",
      linkedIn: "https://linkedin.com/in/ada-obi",
      portfolio: "https://adaobi.dev",
      yearsExperience: "5 years",
      noticePeriod: "30 days",
      salaryExpectation: "NGN 1,100,000 / month",
      coverNote:
        "I enjoy building structured recruiter tools where design clarity and performance both matter.",
      customAnswers: {
        "portfolio-story":
          "I redesigned a recruiter dashboard around queue-based actions and reusable components.",
      },
    },
    analysis: adaAnalysis,
    resumeFileName: "ada-obi-resume.txt",
    resumeText:
      "Ada Obi\nFrontend Engineer\nReact, TypeScript, Next.js\nBuilt recruiter-facing workflows, internal dashboards, and reusable UI systems.",
  });
  const tundeApplication = await createDemoApplication({
    workspaceId,
    formId: frontendForm.id,
    applicant: {
      fullName: "Tunde Hassan",
      email: "tunde.hassan@example.com",
      phone: "+234 809 200 2002",
      location: "Abuja",
      linkedIn: "https://linkedin.com/in/tundehassan",
      portfolio: "https://tundehassan.dev",
      yearsExperience: "4 years",
      noticePeriod: "Immediate",
      salaryExpectation: "NGN 900,000 / month",
      coverNote:
        "I like translating messy product requirements into shippable frontend systems with clear UX.",
      customAnswers: {
        "portfolio-story":
          "I owned an analytics admin surface used by internal operations and support teams.",
      },
    },
    analysis: tundeAnalysis,
    resumeFileName: "tunde-hassan-resume.txt",
    resumeText:
      "Tunde Hassan\nFrontend Engineer\nReact, TypeScript, Performance optimization\nOwned analytics and admin product surfaces.",
  });
  const noorApplication = await createDemoApplication({
    workspaceId,
    formId: frontendForm.id,
    applicant: {
      fullName: "Noor Adebayo",
      email: "noor.adebayo@example.com",
      phone: "+234 813 300 3003",
      location: "Ibadan",
      linkedIn: "https://linkedin.com/in/nooradebayo",
      portfolio: "https://noor-ui.dev",
      yearsExperience: "3 years",
      noticePeriod: "14 days",
      salaryExpectation: "NGN 720,000 / month",
      coverNote:
        "I have been growing from feature work into more product-facing ownership and would love a stretch role.",
      customAnswers: {
        "portfolio-story":
          "I built responsive account management pages and improved component consistency across a smaller team.",
      },
    },
    analysis: noorAnalysis,
    resumeFileName: "noor-adebayo-resume.txt",
    resumeText:
      "Noor Adebayo\nFrontend Developer\nReact, CSS, component maintenance\nSupported internal dashboard and customer account flows.",
  });
  const chidinmaApplication = await createDemoApplication({
    workspaceId,
    formId: peopleOpsForm.id,
    applicant: {
      fullName: "Chidinma Eze",
      email: "chidinma.eze@example.com",
      phone: "+234 814 400 4004",
      location: "Remote",
      linkedIn: "https://linkedin.com/in/chidimmaeze",
      portfolio: "",
      yearsExperience: "7 years",
      noticePeriod: "30 days",
      salaryExpectation: "NGN 1,400,000 / month",
      coverNote:
        "I enjoy creating calm, reliable hiring systems that make candidates and interviewers feel supported.",
      customAnswers: {
        "candidate-experience":
          "I reduced candidate response time by introducing SLA tracking and proactive update templates.",
      },
    },
    analysis: chidinmaAnalysis,
    resumeFileName: "chidinma-eze-resume.txt",
    resumeText:
      "Chidinma Eze\nPeople Operations Manager\nHiring coordination, candidate communication, process design, analytics.",
  });

  await Promise.all([
    updateHiringApplicationWorkflow({
      applicationId: adaApplication.id,
      workspaceId,
      workflow: {
        ...adaApplication.workflow,
        stage: "shortlisted",
        ownerEmail: "sarah@northstarlabs.example",
        recruiterNotes:
          "Strong product and frontend ownership. Move to recruiter screen after portfolio review.",
        nextStep: "Schedule recruiter screen for tomorrow afternoon.",
        followUpAt: addRelativeHours(10),
        lastContactedAt: addRelativeHours(-8),
        tags: ["react", "design-systems", "high-priority"],
        updatedAt: new Date().toISOString(),
      },
    }),
    updateHiringApplicationWorkflow({
      applicationId: tundeApplication.id,
      workspaceId,
      workflow: {
        ...tundeApplication.workflow,
        stage: "interview",
        ownerEmail: "mira@northstarlabs.example",
        recruiterNotes:
          "Interview scheduled to test systems thinking, performance tradeoffs, and product reasoning.",
        nextStep: "Run structured interview and complete the scorecard.",
        followUpAt: addRelativeHours(20),
        interviewDate: addRelativeHours(20),
        interviewPlan: tundeApplication.workflow.interviewKit.map((item) => `- ${item}`).join("\n"),
        lastContactedAt: addRelativeHours(-30),
        tags: ["technical-loop", "needs-systems-depth"],
        updatedAt: new Date().toISOString(),
      },
    }),
    updateHiringApplicationWorkflow({
      applicationId: noorApplication.id,
      workspaceId,
      workflow: {
        ...noorApplication.workflow,
        stage: "reviewing",
        ownerEmail: "",
        recruiterNotes:
          "Potential fit, but the queue stalled before assigning an owner. Needs a clear next step.",
        nextStep: "Assign owner and decide whether to hold or decline.",
        followUpAt: addRelativeHours(-18),
        lastContactedAt: addRelativeDays(-6),
        tags: ["needs-owner", "role-match-check"],
        updatedAt: new Date().toISOString(),
      },
    }),
    updateHiringApplicationWorkflow({
      applicationId: chidinmaApplication.id,
      workspaceId,
      workflow: {
        ...chidinmaApplication.workflow,
        stage: "offer",
        ownerEmail: "toni@northstarlabs.example",
        recruiterNotes:
          "Excellent operations signal. Interview feedback strongly supports moving to offer alignment.",
        nextStep: "Confirm comp guardrails and prepare final offer discussion.",
        followUpAt: addRelativeHours(30),
        interviewDate: addRelativeHours(-26),
        lastContactedAt: addRelativeHours(-36),
        tags: ["operations-lead", "offer-prep"],
        interviewScorecard: {
          ...chidinmaApplication.workflow.interviewScorecard,
          recommendation: "advance",
          overallNotes:
            "Very strong candidate communication instincts and operational structure. Clear move-forward signal.",
          completedAt: addRelativeHours(-20),
          updatedAt: addRelativeHours(-20),
          criteria: chidinmaApplication.workflow.interviewScorecard.criteria.map(
            (criterion, index) => ({
              ...criterion,
              score: index === 0 ? 5 : 4,
              notes:
                index === 0
                  ? "Demonstrated strong ownership with concrete hiring ops examples."
                  : "Answered with structured process thinking and clear prioritization.",
            })
          ),
        },
        updatedAt: new Date().toISOString(),
      },
    }),
  ]);

  await Promise.all([
    createScreeningSession({
      workspaceId,
      analysisGoal:
        "Evaluate product judgment, React depth, and recruiter workflow understanding.",
      documentType: "cv",
      provider: "auto",
      roleSetup: frontendRole,
      response: adaAnalysis,
    }),
    createScreeningSession({
      workspaceId,
      analysisGoal:
        "Assess candidate communication, process design, and people-ops operational strength.",
      documentType: "cv",
      provider: "auto",
      roleSetup: peopleOpsRole,
      response: chidinmaAnalysis,
    }),
  ]);

  const screeningHistory = await listScreeningSessions(workspaceId).catch(() => []);
  await Promise.all(
    screeningHistory.slice(0, 2).map((session, index) =>
      createWorkspaceAuditEvent({
        action: "screening.created",
        actorEmail: WORKSPACE_DEMO_SESSION_EMAIL,
        actorRole: "admin",
        metadata: {
          score: session.response.result.score.value,
          recommendation: session.response.result.recommendation.decision,
        },
        summary:
          index === 0
            ? "Saved a fresh screening review for the demo workspace."
            : "Captured another sample screening review for comparison.",
        targetId: session.id,
        targetType: "screening",
        workspaceId,
      }).catch(() => undefined)
    )
  );

  await createCandidateEmailDraft(
    buildDemoCandidateEmailDraft({
      workspaceId,
      application: noorApplication,
      formId: frontendForm.id,
      requestedByEmail: WORKSPACE_DEMO_SESSION_EMAIL,
    })
  ).catch(() => undefined);

  await Promise.all([
    createWorkspaceAuditEvent({
      action: "workspace.demo.started",
      actorEmail: WORKSPACE_DEMO_SESSION_EMAIL,
      actorRole: "admin",
      metadata: {
        seededForms: 2,
        seededApplications: 4,
      },
      summary: "Loaded the one-time demo workspace with seeded hiring activity.",
      targetId: workspaceId,
      targetType: "workspace",
      workspaceId,
    }).catch(() => undefined),
    createWorkspaceAuditEvent({
      action: "form.created",
      actorEmail: WORKSPACE_DEMO_SESSION_EMAIL,
      actorRole: "admin",
      metadata: {
        title: frontendForm.title,
      },
      summary: `Created hiring form "${frontendForm.title}".`,
      targetId: frontendForm.id,
      targetType: "form",
      workspaceId,
    }).catch(() => undefined),
    createWorkspaceAuditEvent({
      action: "application.workflow.updated",
      actorEmail: "mira@northstarlabs.example",
      actorRole: "admin",
      metadata: {
        stage: "interview",
      },
      summary: "Moved Tunde Hassan into the interview queue.",
      targetId: tundeApplication.id,
      targetType: "application",
      workspaceId,
    }).catch(() => undefined),
  ]);
}

async function createDemoApplication({
  workspaceId,
  formId,
  applicant,
  analysis,
  resumeFileName,
  resumeText,
}: {
  workspaceId: string;
  formId: string;
  applicant: ApplicantProfile;
  analysis: AnalysisResponse;
  resumeFileName: string;
  resumeText: string;
}) {
  const storedFile = await saveUploadedBinary({
    workspaceId,
    prefix: randomUUID(),
    fileName: resumeFileName,
    buffer: Buffer.from(resumeText, "utf8"),
    mimeType: "text/plain",
    inputKind: "text",
  });

  return createHiringApplication({
    formId,
    applicant,
    resumeFile: storedFile,
    analysis,
  });
}

function buildDemoCandidateEmailDraft({
  workspaceId,
  application,
  formId,
  requestedByEmail,
}: {
  workspaceId: string;
  application: HiringApplicationRecord;
  formId: string;
  requestedByEmail: string;
}): CandidateEmailDraftRecord {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    workspaceId,
    applicationId: application.id,
    formId,
    candidateName: application.applicant.fullName,
    candidateEmail: application.applicant.email,
    kind: "follow_up",
    status: "draft",
    subject: "Quick follow-up on your frontend application",
    body: [
      `Hi ${application.applicant.fullName.split(" ")[0] || "there"},`,
      "",
      "Thanks again for applying. We liked the clarity in your product examples and wanted to keep the conversation moving.",
      "",
      "Could you reply with your current availability for a 30-minute recruiter screen this week?",
      "",
      "Best,",
      "Northstar Labs",
    ].join("\n"),
    prompt: "Keep the tone warm, concise, and recruiter-friendly.",
    provider: "local",
    providerDetail: "seeded-demo-draft",
    providerWarnings: [],
    requestedByEmail,
    requestedByRole: "admin",
    approvalRequestedAt: null,
    approvalRequestedByEmail: "",
    approvalTokenHash: "",
    approvalTokenExpiresAt: null,
    approvedAt: null,
    approvedByEmail: "",
    approvedVia: null,
    sentAt: null,
    deliverySource: null,
    deliveryProvider: null,
    deliveryMessageId: "",
    deliveryFromEmail: "",
    lastError: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildDemoAnalysisResponse({
  candidateName,
  headline,
  summary,
  score,
  decision,
  confidence,
  location,
  yearsExperience,
  strengths,
  concerns,
  roleSetup,
  highlightExcerpt,
}: {
  candidateName: string;
  headline: string;
  summary: string;
  score: number;
  decision: "Shortlist" | "Interview" | "Hold" | "Reject";
  confidence: "High" | "Medium" | "Low";
  location: string;
  yearsExperience: string;
  strengths: string[];
  concerns: string[];
  roleSetup: RoleSetup;
  highlightExcerpt: string;
}): AnalysisResponse {
  const criteria = roleSetup.mustHaveSkills.map((skill, index) => ({
    criterion: skill,
    status:
      score >= 80 ? "matched" : score >= 65 || index === 0 ? "partial" : "missing",
    evidence:
      score >= 80
        ? `Strong examples across ${skill} and adjacent product work.`
        : score >= 65 || index === 0
          ? `Some evidence of ${skill}, but interview validation is still useful.`
          : `Limited direct evidence of ${skill} in the submitted material.`,
  })) as Array<{
    criterion: string;
    status: "matched" | "partial" | "missing";
    evidence: string;
  }>;

  return {
    result: {
      documentType: "cv",
      summary,
      recommendation: {
        decision,
        summary:
          decision === "Shortlist"
            ? "Strong enough to move forward quickly."
            : decision === "Interview"
              ? "Worth a structured interview to resolve open questions."
              : decision === "Hold"
                ? "Potential fit, but the role match needs more evidence."
                : "The current evidence does not support moving ahead.",
        confidence,
      },
      candidateProfile: {
        name: candidateName,
        headline,
        summary,
        fields: [
          { label: "Location", value: location },
          { label: "Experience", value: yearsExperience },
          { label: "Target role", value: roleSetup.title },
        ],
      },
      roleMatch: {
        summary:
          score >= 80
            ? "Role match is strong across the core expectations."
            : score >= 65
              ? "Role match is promising, but a few criteria need validation."
              : "Role match is mixed against the current hiring benchmark.",
        criteria,
      },
      skillAssessments: [
        ...roleSetup.mustHaveSkills.slice(0, 3).map((skill, index) => {
          const status: "strong" | "partial" | "missing" =
            score >= 80 ? "strong" : score >= 65 || index === 0 ? "partial" : "missing";

          return {
            skill,
            category: "must-have" as const,
            status,
            score: score >= 80 ? 88 - index * 4 : score >= 65 || index === 0 ? 68 - index * 3 : 42,
            evidence:
              score >= 80
                ? `Clear evidence of ${skill} in shipped work and candidate examples.`
                : score >= 65 || index === 0
                  ? `Moderate evidence of ${skill}; worth pressure-testing in interview.`
                  : `The resume does not show enough depth in ${skill}.`,
          };
        }),
        ...roleSetup.niceToHaveSkills.slice(0, 2).map((skill, index) => {
          const status: "strong" | "partial" = score >= 75 ? "strong" : "partial";

          return {
            skill,
            category: "nice-to-have" as const,
            status,
            score: score >= 75 ? 80 - index * 5 : 62 - index * 4,
            evidence:
              score >= 75
                ? `Nice supporting signal for ${skill}.`
                : `Some evidence for ${skill}, but it is not yet deep.`,
          };
        }),
      ],
      riskSignals: concerns.map((concern, index) => ({
        category: index === 0 ? "Role fit" : "Evidence depth",
        level: score >= 80 ? "low" : score >= 65 ? "medium" : "high",
        summary: concern,
      })),
      keyHighlights: strengths,
      redFlags: concerns,
      recommendedActions:
        decision === "Shortlist"
          ? [
              "Move the candidate into the recruiter screen queue.",
              "Use the interview kit to probe product judgment and role specifics.",
            ]
          : decision === "Interview"
            ? [
                "Run a structured interview to validate role depth.",
                "Review system-level tradeoffs and communication examples.",
              ]
            : decision === "Hold"
              ? [
                  "Assign an owner and capture the missing evidence needed for a decision.",
                  "Revisit the role benchmark before moving forward.",
                ]
              : [
                  "Close the loop with a concise rejection email.",
                  "Capture any useful notes for future sourcing.",
                ],
      evidencePoints: [
        {
          title: "Relevant experience",
          excerpt: highlightExcerpt,
          rationale: "Shows the candidate has worked in adjacent product or recruiting workflows.",
          tone: "strength",
        },
        {
          title: "Role alignment",
          excerpt: roleSetup.summary,
          rationale: "Used as the benchmark for deciding whether the profile should move ahead.",
          tone: score >= 65 ? "neutral" : "concern",
        },
      ],
      interviewQuestions: [
        `Tell us about a time you used ${roleSetup.mustHaveSkills[0] || "your core skill"} to handle a messy product requirement.`,
        `What tradeoffs would you make when balancing speed, quality, and team alignment in a ${roleSetup.title} role?`,
        `Which part of this role would you want to clarify before joining?`,
      ],
      score: {
        value: score,
        label: score >= 85 ? "Strong fit" : score >= 70 ? "Promising fit" : "Needs review",
        rationale: summary,
        breakdown: [
          {
            category: "Role fit",
            score: clampScore(score + 2),
            note: "Measures alignment with the role setup and must-have criteria.",
          },
          {
            category: "Execution evidence",
            score: clampScore(score - 4),
            note: "Measures whether the resume shows shipped outcomes and ownership.",
          },
          {
            category: "Communication",
            score: clampScore(score - 1),
            note: "Measures clarity, professionalism, and recruiter-readability.",
          },
        ],
      },
      extractedFacts: [
        { label: "Location", value: location },
        { label: "Years of experience", value: yearsExperience },
        { label: "Target role", value: roleSetup.title },
      ],
      tone: "evidence-led",
    },
    meta: {
      fileName: `${slugify(candidateName)}-resume.txt`,
      fileSize: Math.max(900, summary.length * 6),
      pageCount: 1,
      extractedCharacters: summary.length + highlightExcerpt.length,
      chunkCount: 1,
      provider: "local",
      providerDetail: "seeded-demo-analysis",
      inputKind: "text",
      mimeType: "text/plain",
      providerWarnings: [],
    },
    excerpt: `${candidateName} - ${highlightExcerpt}`,
  };
}

function addRelativeDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addRelativeHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function clampScore(score: number) {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "candidate"
  );
}
