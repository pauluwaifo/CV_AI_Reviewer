import "server-only";

import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AnalysisResponse, RoleSetup, UploadSourceKind } from "@/types/document-intelligence";
import type {
  ApplicantProfile,
  HiringApplicationRecord,
  HiringFormDetail,
  HiringFormField,
  HiringFormFieldType,
  HiringFormJdAttachment,
  HiringFormListItem,
  HiringFormQuestion,
  HiringFormRecord,
  HiringFunnelStoreData,
  PublicHiringForm,
  StoredResumeFile,
  WorkspacePublicSnapshot,
} from "@/types/hiring-funnel";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  getWorkspacePublicSnapshot,
  sanitizeWorkspaceId,
} from "@/lib/workspace-settings";
import { getLocalWorkspaceSettings } from "@/lib/local-workspace-settings-store";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "hiring-funnel.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DEFAULT_WORKSPACE_PROFILE = getWorkspacePublicSnapshot(
  DEFAULT_WORKSPACE_SETTINGS
);

const EMPTY_STORE: HiringFunnelStoreData = {
  forms: [],
  applications: [],
};

export async function listLocalHiringForms(
  baseUrl: string,
  workspaceId: string
): Promise<HiringFormListItem[]> {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store.forms
    .filter((form) => form.workspaceId === scopedWorkspaceId)
    .map((form) => toFormListItem(form, store.applications, baseUrl))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getLocalHiringFormDetail(
  formId: string,
  baseUrl: string,
  workspaceId: string
): Promise<HiringFormDetail | null> {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const form = store.forms.find(
    (item) => item.id === formId && item.workspaceId === scopedWorkspaceId
  );

  if (!form) {
    return null;
  }

  return {
    ...toFormListItem(form, store.applications, baseUrl),
    applications: store.applications
      .filter(
        (item) => item.formId === formId && item.workspaceId === scopedWorkspaceId
      )
      .sort(
        (left, right) =>
          right.analysis.result.score.value - left.analysis.result.score.value ||
          right.createdAt.localeCompare(left.createdAt)
      ),
  };
}

export async function getLocalPublicHiringForm(
  formId: string
): Promise<PublicHiringForm | null> {
  const store = await readStore();
  const form = store.forms.find((item) => item.id === formId);

  if (!form) {
    return null;
  }

  const workspace = getWorkspacePublicSnapshot(
    await getLocalWorkspaceSettings(form.workspaceId)
  );

  return {
    id: form.id,
    title: form.title,
    team: form.team,
    intro: form.intro,
    roleSetup: form.roleSetup,
    customQuestions: form.customQuestions,
    formFields: form.formFields,
    workspace,
    expiresAt: form.expiresAt,
    status: deriveFormStatus(form.expiresAt, form.published),
  };
}

export async function getLocalHiringFormRecord(
  formId: string
): Promise<HiringFormRecord | null> {
  const store = await readStore();
  return store.forms.find((item) => item.id === formId) ?? null;
}

export async function createLocalHiringForm({
  workspaceId,
  workspace,
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  customQuestions,
  formFields,
  expiresAt,
  jdAttachment,
}: {
  workspaceId: string;
  workspace: WorkspacePublicSnapshot;
  title: string;
  team: string;
  intro: string;
  analysisGoal: string;
  roleSetup: RoleSetup;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  expiresAt: string | null;
  jdAttachment: HiringFormJdAttachment | null;
}) {
  const store = await readStore();
  const form: HiringFormRecord = {
    id: randomUUID(),
    workspaceId: sanitizeWorkspaceId(workspaceId),
    workspace: normalizeWorkspaceSnapshot(workspace),
    title,
    team,
    intro,
    analysisGoal,
    roleSetup,
    customQuestions,
    formFields: normalizeFormFields(formFields, customQuestions),
    createdAt: new Date().toISOString(),
    expiresAt,
    published: true,
    jdAttachment,
  };

  store.forms.unshift(form);
  await writeStore(store);

  return form;
}

export async function updateLocalHiringForm({
  formId,
  workspaceId,
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  customQuestions,
  formFields,
  expiresAt,
  published,
}: {
  formId: string;
  workspaceId: string;
  title: string;
  team: string;
  intro: string;
  analysisGoal: string;
  roleSetup: RoleSetup;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  expiresAt: string | null;
  published?: boolean;
}) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const index = store.forms.findIndex(
    (item) => item.id === formId && item.workspaceId === scopedWorkspaceId
  );

  if (index < 0) {
    return null;
  }

  const current = store.forms[index];
  const next: HiringFormRecord = {
    ...current,
    title,
    team,
    intro,
    analysisGoal,
    roleSetup,
    customQuestions,
    formFields: normalizeFormFields(formFields, customQuestions),
    expiresAt,
    published: published ?? current.published,
  };

  store.forms.splice(index, 1, next);
  await writeStore(store);
  return next;
}

export async function createLocalHiringApplication({
  formId,
  applicant,
  resumeFile,
  analysis,
}: {
  formId: string;
  applicant: ApplicantProfile;
  resumeFile: StoredResumeFile;
  analysis: AnalysisResponse;
}) {
  const store = await readStore();
  const form = store.forms.find((item) => item.id === formId);

  if (!form) {
    throw new Error("Form not found.");
  }

  const application: HiringApplicationRecord = {
    id: randomUUID(),
    workspaceId: form.workspaceId,
    formId,
    createdAt: new Date().toISOString(),
    applicant,
    resumeFile,
    analysis,
  };

  store.applications.unshift(application);
  await writeStore(store);

  return application;
}

export async function deleteLocalHiringApplication(
  applicationId: string,
  workspaceId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const application = store.applications.find(
    (item) => item.id === applicationId && item.workspaceId === scopedWorkspaceId
  );

  if (!application) {
    return false;
  }

  store.applications = store.applications.filter((item) => item.id !== applicationId);
  await removeStoredFile(application.resumeFile.storagePath);
  await writeStore(store);
  return true;
}

export async function getLocalHiringApplicationDownload(
  applicationId: string,
  workspaceId: string
) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const application = store.applications.find(
    (item) => item.id === applicationId && item.workspaceId === scopedWorkspaceId
  );

  if (!application) {
    return null;
  }

  const absolutePath = resolveStoredFilePath(application.resumeFile.storagePath);

  if (!absolutePath) {
    return null;
  }

  try {
    const buffer = await readFile(absolutePath);

    return {
      buffer,
      fileName: application.resumeFile.fileName,
      mimeType: application.resumeFile.mimeType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function deleteLocalHiringForm(formId: string, workspaceId: string) {
  const store = await readStore();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const form = store.forms.find(
    (item) => item.id === formId && item.workspaceId === scopedWorkspaceId
  );

  if (!form) {
    return false;
  }

  const relatedApplications = store.applications.filter(
    (item) => item.formId === formId && item.workspaceId === scopedWorkspaceId
  );

  for (const application of relatedApplications) {
    await removeStoredFile(application.resumeFile.storagePath);
  }

  store.forms = store.forms.filter((item) => item.id !== formId);
  store.applications = store.applications.filter((item) => item.formId !== formId);
  await writeStore(store);
  return true;
}

export async function saveLocalUploadedBinary({
  workspaceId,
  prefix,
  fileName,
  buffer,
  mimeType,
  inputKind,
}: {
  workspaceId: string;
  prefix: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  inputKind: UploadSourceKind;
}): Promise<StoredResumeFile> {
  await ensureStoreReady();

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const safeName = sanitizeFileName(fileName);
  const relativePath = path.join(
    "uploads",
    scopedWorkspaceId,
    `${prefix}-${safeName}`
  );
  const absolutePath = path.join(DATA_DIR, relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    fileName,
    mimeType,
    size: buffer.length,
    inputKind,
    storagePath: relativePath.replace(/\\/g, "/"),
  };
}

export async function readLocalHiringFunnelStoreForMigration() {
  return readStore();
}

export async function readLocalUploadedBinaryByStoragePath(storagePath: string) {
  const absolutePath = resolveStoredFilePath(storagePath);

  if (!absolutePath) {
    return null;
  }

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<HiringFunnelStoreData>;

    return {
      forms: Array.isArray(parsed.forms)
        ? parsed.forms
            .map((item) => normalizeFormRecord(item))
            .filter((item): item is HiringFormRecord => Boolean(item))
        : [],
      applications: Array.isArray(parsed.applications)
        ? parsed.applications
            .map((item) => normalizeApplicationRecord(item))
            .filter((item): item is HiringApplicationRecord => Boolean(item))
        : [],
    } satisfies HiringFunnelStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return {
      forms: [],
      applications: [],
    } satisfies HiringFunnelStoreData;
  }
}

async function writeStore(store: HiringFunnelStoreData) {
  await ensureStoreReady();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function ensureStoreReady() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });

  try {
    await stat(STORE_FILE);
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }
}

async function removeStoredFile(relativePath: string) {
  const absolutePath = resolveStoredFilePath(relativePath);

  if (!absolutePath) {
    return;
  }

  await unlink(absolutePath).catch(() => undefined);
}

function resolveStoredFilePath(relativePath: string) {
  const normalized = relativePath.replace(/\//g, path.sep);
  const absolutePath = path.resolve(DATA_DIR, normalized);
  const uploadsRoot = path.resolve(UPLOADS_DIR) + path.sep;

  if (
    absolutePath !== path.resolve(UPLOADS_DIR) &&
    !absolutePath.startsWith(uploadsRoot)
  ) {
    return null;
  }

  return absolutePath;
}

function toFormListItem(
  form: HiringFormRecord,
  applications: HiringApplicationRecord[],
  baseUrl: string
): HiringFormListItem {
  const relatedApplications = applications.filter(
    (item) => item.formId === form.id && item.workspaceId === form.workspaceId
  );

  return {
    ...form,
    publicUrl: `${baseUrl}/apply/${form.id}`,
    status: deriveFormStatus(form.expiresAt, form.published),
    applicationCount: relatedApplications.length,
    topScore:
      relatedApplications.length > 0
        ? Math.max(...relatedApplications.map((item) => item.analysis.result.score.value))
        : null,
  };
}

function deriveFormStatus(
  expiresAt: string | null,
  published: boolean
): "active" | "expired" | "unpublished" {
  if (!published) {
    return "unpublished";
  }

  if (!expiresAt) {
    return "active";
  }

  return new Date(expiresAt).getTime() <= Date.now() ? "expired" : "active";
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "upload"
  );
}

function normalizeFormRecord(value: unknown): HiringFormRecord | null {
  const parsed = value as Partial<HiringFormRecord>;

  if (!parsed || typeof parsed.id !== "string" || !parsed.id.trim()) {
    return null;
  }

  return {
    id: parsed.id,
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    workspace: normalizeWorkspaceSnapshot(parsed.workspace),
    title: typeof parsed.title === "string" ? parsed.title : "",
    team: typeof parsed.team === "string" ? parsed.team : "",
    intro: typeof parsed.intro === "string" ? parsed.intro : "",
    analysisGoal: typeof parsed.analysisGoal === "string" ? parsed.analysisGoal : "",
    roleSetup: normalizeRoleSetup(parsed.roleSetup),
    customQuestions: normalizeCustomQuestions(parsed.customQuestions),
    formFields: normalizeFormFields(
      parsed.formFields,
      normalizeCustomQuestions(parsed.customQuestions)
    ),
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
    published: parsed.published !== false,
    jdAttachment: normalizeJdAttachment(parsed.jdAttachment),
  };
}

function normalizeApplicationRecord(value: unknown): HiringApplicationRecord | null {
  const parsed = value as Partial<HiringApplicationRecord>;

  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.formId !== "string" ||
    !parsed.formId.trim()
  ) {
    return null;
  }

  return {
    id: parsed.id,
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    formId: parsed.formId,
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    applicant: parsed.applicant as ApplicantProfile,
    resumeFile: parsed.resumeFile as StoredResumeFile,
    analysis: parsed.analysis as AnalysisResponse,
  };
}

function normalizeWorkspaceSnapshot(
  value: unknown
): WorkspacePublicSnapshot {
  const parsed = (value ?? {}) as Partial<WorkspacePublicSnapshot>;

  return {
    appName:
      typeof parsed.appName === "string" && parsed.appName.trim()
        ? parsed.appName.trim()
        : DEFAULT_WORKSPACE_PROFILE.appName,
    organizationName:
      typeof parsed.organizationName === "string" && parsed.organizationName.trim()
        ? parsed.organizationName.trim()
        : DEFAULT_WORKSPACE_PROFILE.organizationName,
    tagline:
      typeof parsed.tagline === "string" && parsed.tagline.trim()
        ? parsed.tagline.trim()
        : DEFAULT_WORKSPACE_PROFILE.tagline,
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    dashboardAccent:
      typeof parsed.dashboardAccent === "string" && parsed.dashboardAccent.trim()
        ? parsed.dashboardAccent.trim()
        : DEFAULT_WORKSPACE_PROFILE.dashboardAccent,
    formAccent:
      typeof parsed.formAccent === "string" && parsed.formAccent.trim()
        ? parsed.formAccent.trim()
        : DEFAULT_WORKSPACE_PROFILE.formAccent,
    formHeaderImageDataUrl:
      typeof parsed.formHeaderImageDataUrl === "string"
        ? parsed.formHeaderImageDataUrl.trim()
        : DEFAULT_WORKSPACE_PROFILE.formHeaderImageDataUrl,
  };
}

function normalizeCustomQuestions(value: unknown): HiringFormQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const parsed = item as Partial<HiringFormQuestion>;
      const label = typeof parsed.label === "string" ? parsed.label.trim() : "";

      if (!label) {
        return null;
      }

      return {
        id:
          typeof parsed.id === "string" && parsed.id.trim()
            ? parsed.id.trim()
            : randomUUID(),
        label,
        placeholder:
          typeof parsed.placeholder === "string" ? parsed.placeholder.trim() : "",
        required: parsed.required !== false,
      } satisfies HiringFormQuestion;
    })
    .filter((item): item is HiringFormQuestion => item !== null);
}

function normalizeFormFields(
  value: unknown,
  customQuestions: HiringFormQuestion[]
): HiringFormField[] {
  if (!Array.isArray(value) || value.length === 0) {
    return buildDefaultFormFields(customQuestions);
  }

  const fields = value
    .map((item): HiringFormField | null => {
      const parsed = item as Partial<HiringFormField>;
      const label = typeof parsed.label === "string" ? parsed.label.trim() : "";
      const systemKey = normalizeSystemKey(parsed.systemKey);

      if (!label) {
        return null;
      }

      return {
        id:
          typeof parsed.id === "string" && parsed.id.trim()
            ? parsed.id.trim()
            : randomUUID(),
        label,
        placeholder:
          typeof parsed.placeholder === "string" ? parsed.placeholder.trim() : "",
        helper: typeof parsed.helper === "string" ? parsed.helper.trim() : "",
        required: parsed.required !== false,
        type: normalizeFormFieldType(parsed.type),
        options: normalizeFormFieldOptions(parsed.options),
        ...(systemKey ? { systemKey } : {}),
      } satisfies HiringFormField;
    })
    .filter((item): item is HiringFormField => item !== null);

  return fields.some((field) => field.systemKey === "resumeFile")
    ? fields
    : [...fields, createSystemField("resumeFile", "CV or resume", "file", true)];
}

function buildDefaultFormFields(customQuestions: HiringFormQuestion[]): HiringFormField[] {
  return [
    createSystemField("fullName", "Full name", "short_text", true),
    createSystemField("email", "Email address", "email", true),
    createSystemField("phone", "Phone number", "phone", false),
    createSystemField("location", "Location", "short_text", false),
    createSystemField("linkedIn", "LinkedIn profile", "url", false),
    createSystemField("portfolio", "Portfolio or website", "url", false),
    createSystemField("yearsExperience", "Years of experience", "short_text", false),
    createSystemField("noticePeriod", "Notice period", "short_text", false),
    createSystemField("salaryExpectation", "Salary expectation", "short_text", false),
    createSystemField("resumeFile", "CV or resume", "file", true),
    createSystemField("coverNote", "Short note", "long_text", false),
    ...customQuestions.map((question) => ({
      id: question.id,
      label: question.label,
      placeholder: question.placeholder || "Type your answer",
      helper: "",
      required: question.required,
      type: "long_text" as const,
    })),
  ];
}

function createSystemField(
  systemKey: NonNullable<HiringFormField["systemKey"]>,
  label: string,
  type: HiringFormFieldType,
  required: boolean
): HiringFormField {
  return {
    id: `system-${systemKey}`,
    label,
    placeholder: "",
    helper: systemKey === "resumeFile"
      ? "Accepted formats: PDF, TXT, MD, CSV, JSON, HTML, XML, RTF, PNG, JPG, WEBP, GIF, BMP."
      : "",
    required,
    type,
    systemKey,
  };
}

function normalizeFormFieldType(value: unknown): HiringFormFieldType {
  return [
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
  ].includes(String(value))
    ? (value as HiringFormFieldType)
    : "short_text";
}

function normalizeFormFieldOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeSystemKey(value: unknown): HiringFormField["systemKey"] | undefined {
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

function normalizeRoleSetup(value: unknown): RoleSetup {
  const parsed = (value ?? {}) as Partial<RoleSetup>;

  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    seniority: typeof parsed.seniority === "string" ? parsed.seniority : "",
    location: typeof parsed.location === "string" ? parsed.location : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    mustHaveSkills: Array.isArray(parsed.mustHaveSkills)
      ? parsed.mustHaveSkills.filter((item): item is string => typeof item === "string")
      : [],
    niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills)
      ? parsed.niceToHaveSkills.filter((item): item is string => typeof item === "string")
      : [],
    interviewFocus: Array.isArray(parsed.interviewFocus)
      ? parsed.interviewFocus.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeJdAttachment(value: unknown): HiringFormJdAttachment | null {
  const parsed = (value ?? null) as Partial<HiringFormJdAttachment> | null;

  if (!parsed || typeof parsed.fileName !== "string" || !parsed.fileName.trim()) {
    return null;
  }

  return {
    fileName: parsed.fileName,
    inputKind: (parsed.inputKind as UploadSourceKind) || "text",
    mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : "text/plain",
    extractedCharacters:
      typeof parsed.extractedCharacters === "number" ? parsed.extractedCharacters : 0,
    text: typeof parsed.text === "string" ? parsed.text : "",
  };
}
