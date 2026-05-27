import { NextResponse } from "next/server";

import { DocumentAnalysisError, extractUploadTextFromFile } from "@/lib/document-intelligence";
import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { normalizeHiringFormScreeningPolicy } from "@/lib/hiring-screening-policy";
import {
  deleteHiringForm,
  getHiringFormDetail,
  getPublicHiringForm,
  setHiringFormPublished,
  updateHiringForm,
} from "@/lib/hiring-funnel-store";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import type { RoleSetup } from "@/types/document-intelligence";
import type { HiringFormField, HiringFormFieldType, HiringFormQuestion } from "@/types/hiring-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  const url = new URL(request.url);
  const isPublicView = url.searchParams.get("view") === "public";
  const shouldExportCsv = url.searchParams.get("export") === "csv";

  if (isPublicView) {
    const publicForm = await getPublicHiringForm(formId);

    if (!publicForm) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }

    if (publicForm.status === "unpublished") {
      return NextResponse.json(
        { error: "This form is currently unpublished." },
        { status: 404 }
      );
    }

    return NextResponse.json({ form: publicForm });
  }

  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const form = await getHiringFormDetail(formId, url.origin, session.workspaceId);

  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  if (shouldExportCsv) {
    const csv = buildFormResponsesCsv(form, url.origin);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": buildAttachmentDisposition(`${form.title || "responses"}.csv`),
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ form });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const action = String(formData.get("action") || "").trim();
    const origin = new URL(request.url).origin;

    if (action === "set-published") {
      const published = String(formData.get("published") || "") === "true";
      const form = await setHiringFormPublished({
        formId,
        workspaceId: session.workspaceId,
        published,
      });

      if (!form) {
        return NextResponse.json({ error: "Form not found." }, { status: 404 });
      }

      await createWorkspaceAuditEvent({
        action: "form.updated",
        actorEmail: session.email,
        actorRole: session.role,
        metadata: {
          published,
        },
        summary: `${published ? "Published" : "Unpublished"} hiring form "${form.title}".`,
        targetId: form.id,
        targetType: "form",
        workspaceId: session.workspaceId,
      }).catch(() => undefined);
      await emitWorkspaceIntegrationEvent(session.workspaceId, "form.updated", {
        formId: form.id,
        published,
        pipelineUrl: `${origin}${appendWorkspaceQuery(
          `/pipeline?form=${encodeURIComponent(form.id)}`,
          session.workspaceId
        )}`,
        publicFormUrl: `${origin}/apply/${form.id}`,
        title: form.title,
      }).catch(() => undefined);

      return NextResponse.json({ form });
    }

    const title = String(formData.get("title") || "").trim();
    const jdFile = formData.get("jobDescriptionFile");
    const jdText = String(formData.get("jobDescriptionText") || "").trim();
    const jdTextFileName = String(formData.get("jobDescriptionFileName") || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Add a form title first." }, { status: 400 });
    }

    const jdAttachment = jdFile instanceof File
      ? await buildJdAttachment(jdFile)
      : jdText
        ? buildTextJdAttachment(jdText, jdTextFileName)
        : null;

    const form = await updateHiringForm({
      formId,
      workspaceId: session.workspaceId,
      title,
      team: String(formData.get("team") || "").trim(),
      intro: String(formData.get("intro") || "").trim(),
      analysisGoal: String(formData.get("analysisGoal") || "").trim(),
      roleSetup: parseRoleSetup(formData.get("roleSetup")),
      screeningPolicy: parseScreeningPolicy(formData.get("screeningPolicy")),
      customQuestions: parseCustomQuestions(formData.get("customQuestions")),
      formFields: parseFormFields(formData.get("formFields")),
      expiresAt: parseExpiresAt(formData.get("expiresAt")),
      jdAttachment,
    });

    if (!form) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }

    await createWorkspaceAuditEvent({
      action: "form.updated",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {
        published: form.published,
        title: form.title,
      },
      summary: `Updated hiring form "${form.title}".`,
      targetId: form.id,
      targetType: "form",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);
    await emitWorkspaceIntegrationEvent(session.workspaceId, "form.updated", {
      formId: form.id,
      published: form.published,
      pipelineUrl: `${origin}${appendWorkspaceQuery(
        `/pipeline?form=${encodeURIComponent(form.id)}`,
        session.workspaceId
      )}`,
      publicFormUrl: `${origin}/apply/${form.id}`,
      title: form.title,
    }).catch(() => undefined);

    return NextResponse.json({ form });
  } catch (error) {
    if (error instanceof DocumentAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "I couldn't update that form right now." },
      { status: 500 }
    );
  }
}

function parseScreeningPolicy(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return normalizeHiringFormScreeningPolicy(null);
  }

  try {
    return normalizeHiringFormScreeningPolicy(JSON.parse(value));
  } catch {
    return normalizeHiringFormScreeningPolicy(null);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const deleted = await deleteHiringForm(formId, session.workspaceId);

  if (!deleted) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  await createWorkspaceAuditEvent({
    action: "form.deleted",
    actorEmail: session.email,
    actorRole: session.role,
    metadata: {},
    summary: `Deleted hiring form ${formId}.`,
    targetId: formId,
    targetType: "form",
    workspaceId: session.workspaceId,
  }).catch(() => undefined);
  await emitWorkspaceIntegrationEvent(session.workspaceId, "form.deleted", {
    formId,
    pipelineUrl: `${new URL(request.url).origin}${appendWorkspaceQuery("/pipeline", session.workspaceId)}`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

function buildFormResponsesCsv(form: NonNullable<Awaited<ReturnType<typeof getHiringFormDetail>>>, origin: string) {
  const questionColumns = form.customQuestions.map((question) => question.label);
  const headers = [
    "submitted_at",
    "candidate_name",
    "email",
    "phone",
    "location",
    "linkedin",
    "portfolio",
    "years_experience",
    "notice_period",
    "salary_expectation",
    "cover_note",
    "decision",
    "workflow_stage",
    "workflow_owner",
    "workflow_next_step",
    "workflow_tags",
    "interview_date",
    "interview_scorecard_recommendation",
    "interview_scorecard_completed_at",
    "confidence",
    "score",
    "summary",
    "resume_file",
    "resume_download_url",
    "source_kind",
    ...questionColumns,
  ];

  const rows = form.applications.map((application) => {
    const answerColumns = form.customQuestions.map(
      (question) => application.applicant.customAnswers[question.id] || ""
    );

    return [
      new Date(application.createdAt).toLocaleString(),
      application.applicant.fullName,
      application.applicant.email,
      application.applicant.phone,
      application.applicant.location,
      application.applicant.linkedIn,
      application.applicant.portfolio,
      application.applicant.yearsExperience,
      application.applicant.noticePeriod,
      application.applicant.salaryExpectation,
      application.applicant.coverNote,
      application.analysis.result.recommendation.decision,
      application.workflow.stage,
      application.workflow.ownerEmail,
      application.workflow.nextStep,
      application.workflow.tags.join(" | "),
      application.workflow.interviewDate || "",
      application.workflow.interviewScorecard.recommendation,
      application.workflow.interviewScorecard.completedAt || "",
      application.analysis.result.recommendation.confidence,
      String(application.analysis.result.score.value),
      application.analysis.result.summary,
      application.resumeFile.fileName,
      `${origin}/api/applications/${application.id}`,
      application.analysis.meta.inputKind,
      ...answerColumns,
    ];
  });

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  const escaped = normalized.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function buildAttachmentDisposition(fileName: string) {
  const sanitized = fileName.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);

  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

async function buildJdAttachment(file: File) {
  const extracted = await extractUploadTextFromFile(file);
  return {
    fileName: file.name,
    inputKind: extracted.inputKind,
    mimeType: extracted.mimeType,
    extractedCharacters: extracted.text.length,
    text: extracted.text,
  };
}

function buildTextJdAttachment(text: string, fileName: string) {
  return {
    fileName: fileName || "generated-job-description.txt",
    inputKind: "text" as const,
    mimeType: "text/plain",
    extractedCharacters: text.length,
    text,
  };
}

function parseFormFields(value: FormDataEntryValue | null): HiringFormField[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item, index): HiringFormField | null => {
        const field = item as Partial<HiringFormField>;
        const label = typeof field.label === "string" ? field.label.trim() : "";

        if (!label) {
          return null;
        }

        return {
          id:
            typeof field.id === "string" && field.id.trim()
              ? field.id.trim()
              : `field-${index + 1}`,
          label,
          placeholder: typeof field.placeholder === "string" ? field.placeholder.trim() : "",
          helper: typeof field.helper === "string" ? field.helper.trim() : "",
          required: field.required !== false,
          type: parseFormFieldType(field.type),
          options: Array.isArray(field.options)
            ? field.options
                .map((option) => (typeof option === "string" ? option.trim() : ""))
                .filter(Boolean)
            : [],
          ...(field.systemKey ? { systemKey: field.systemKey } : {}),
        };
      })
      .filter((item): item is HiringFormField => item !== null);
  } catch {
    return [];
  }
}

function parseFormFieldType(value: unknown): HiringFormFieldType {
  const allowed = [
    "short_text",
    "long_text",
    "email",
    "phone",
    "url",
    "number",
    "date",
    "multiple_choice",
    "checkboxes",
    "dropdown",
    "file",
  ];

  return allowed.includes(String(value))
    ? (value as HiringFormFieldType)
    : "short_text";
}

function parseCustomQuestions(value: FormDataEntryValue | null): HiringFormQuestion[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as HiringFormQuestion[]) : [];
  } catch {
    return [];
  }
}

function parseRoleSetup(value: FormDataEntryValue | null): RoleSetup {
  if (typeof value !== "string" || !value.trim()) {
    return {
      title: "",
      seniority: "",
      location: "",
      summary: "",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      interviewFocus: [],
    };
  }

  try {
    return JSON.parse(value) as RoleSetup;
  } catch {
    return {
      title: "",
      seniority: "",
      location: "",
      summary: "",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      interviewFocus: [],
    };
  }
}

function parseExpiresAt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
