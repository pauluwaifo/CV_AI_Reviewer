import { NextResponse } from "next/server";

import { DocumentAnalysisError, extractUploadTextFromFile } from "@/lib/document-intelligence";
import {
  normalizeHiringFormScreeningPolicy,
} from "@/lib/hiring-screening-policy";
import {
  createHiringForm,
  listHiringForms,
} from "@/lib/hiring-funnel-store";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import {
  appendWorkspaceQuery,
  getWorkspacePublicSnapshot,
} from "@/lib/workspace-settings";
import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";
import type { HiringFormQuestion } from "@/types/hiring-funnel";
import type { HiringFormField, HiringFormFieldType } from "@/types/hiring-funnel";
import type { RoleSetup } from "@/types/document-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspaceFeatureApiAccess(request, "pipeline");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  const baseUrl = new URL(request.url).origin;
  const forms = await listHiringForms(baseUrl, access.session.workspaceId);
  return NextResponse.json({ forms });
}

export async function POST(request: Request) {
  const access = await requireWorkspaceFeatureApiAccess(request, "pipeline");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  try {
    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const team = String(formData.get("team") || "").trim();
    const intro = String(formData.get("intro") || "").trim();
    const analysisGoal = String(formData.get("analysisGoal") || "").trim();
    const roleSetup = parseRoleSetup(formData.get("roleSetup"));
    const customQuestions = parseCustomQuestions(formData.get("customQuestions"));
    const formFields = parseFormFields(formData.get("formFields"));
    const expiresAt = parseExpiresAt(formData.get("expiresAt"));
    const jdFile = formData.get("jobDescriptionFile");
    const jdText = String(formData.get("jobDescriptionText") || "").trim();
    const jdTextFileName = String(formData.get("jobDescriptionFileName") || "").trim();
    const workspace = getWorkspacePublicSnapshot(
      await getWorkspaceSettings(access.session.workspaceId)
    );

    if (!title) {
      return NextResponse.json({ error: "Add a form title first." }, { status: 400 });
    }

    const jdAttachment = jdFile instanceof File
      ? await buildJdAttachment(jdFile, session.workspaceId)
      : jdText
        ? buildTextJdAttachment(jdText, jdTextFileName)
        : null;

    const created = await createHiringForm({
      workspaceId: access.session.workspaceId,
      workspace,
      title,
      team,
      intro,
      analysisGoal,
      roleSetup,
      screeningPolicy: parseScreeningPolicy(formData.get("screeningPolicy")),
      customQuestions,
      formFields,
      expiresAt,
      jdAttachment,
    });
    await createWorkspaceAuditEvent({
      action: "form.created",
      actorEmail: access.session.email,
      actorRole: access.session.role,
      metadata: {
        published: created.published,
        title: created.title,
      },
      summary: `Created hiring form "${created.title}".`,
      targetId: created.id,
      targetType: "form",
      workspaceId: access.session.workspaceId,
    }).catch(() => undefined);
    await emitWorkspaceIntegrationEvent(access.session.workspaceId, "form.created", {
      formId: created.id,
      published: created.published,
      publicFormUrl: `${new URL(request.url).origin}/apply/${created.id}`,
      pipelineUrl: `${new URL(request.url).origin}${appendWorkspaceQuery(
        `/pipeline?form=${encodeURIComponent(created.id)}`,
        access.session.workspaceId
      )}`,
      title: created.title,
    }).catch(() => undefined);

    return NextResponse.json({
      form: created,
      publicUrl: `${new URL(request.url).origin}/apply/${created.id}`,
    });
  } catch (error) {
    if (error instanceof DocumentAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "I couldn't create that hiring form right now." },
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
        const systemKey = parseSystemKey(field.systemKey);

        if (!label) {
          return null;
        }

        return {
          id:
            typeof field.id === "string" && field.id.trim()
              ? field.id.trim()
              : `field-${index + 1}`,
          label,
          placeholder:
            typeof field.placeholder === "string" ? field.placeholder.trim() : "",
          helper: typeof field.helper === "string" ? field.helper.trim() : "",
          required: field.required !== false,
          type: parseFormFieldType(field.type),
          options: parseFormFieldOptions(field.options),
          ...(systemKey ? { systemKey } : {}),
        } satisfies HiringFormField;
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

function parseFormFieldOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter(Boolean)
    .slice(0, 30);
}

function parseSystemKey(value: unknown): HiringFormField["systemKey"] | undefined {
  const allowed = [
    "fullName",
    "email",
    "phone",
    "location",
    "linkedIn",
    "portfolio",
    "yearsExperience",
    "noticePeriod",
    "salaryExpectation",
    "coverNote",
    "resumeFile",
  ];

  return allowed.includes(String(value))
    ? (value as HiringFormField["systemKey"])
    : undefined;
}

async function buildJdAttachment(file: File, workspaceId: string) {
  const extracted = await extractUploadTextFromFile(file, workspaceId);
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

function parseCustomQuestions(value: FormDataEntryValue | null): HiringFormQuestion[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item, index) => {
        const question = item as Partial<HiringFormQuestion>;
        const label = typeof question.label === "string" ? question.label.trim() : "";

        if (!label) {
          return null;
        }

        return {
          id:
            typeof question.id === "string" && question.id.trim()
              ? question.id.trim()
              : `question-${index + 1}`,
          label,
          placeholder:
            typeof question.placeholder === "string" ? question.placeholder.trim() : "",
          required: question.required !== false,
        } satisfies HiringFormQuestion;
      })
      .filter((item): item is HiringFormQuestion => item !== null);
  } catch {
    return [];
  }
}

function parseExpiresAt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
