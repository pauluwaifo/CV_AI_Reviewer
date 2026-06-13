import "server-only";

import { randomUUID } from "node:crypto";

import type { PoolClient, QueryResultRow } from "pg";

import {
  createLocalHiringApplication,
  createLocalHiringForm,
  deleteLocalHiringApplication,
  deleteLocalHiringForm,
  getLocalHiringApplicationDownload,
  getLocalHiringApplicationRecord,
  getLocalHiringFormDetail,
  getLocalHiringFormRecord,
  getLocalPublicHiringForm,
  listLocalHiringForms,
  readLocalHiringFunnelStoreForMigration,
  readLocalUploadedBinaryByStoragePath,
  saveLocalUploadedBinary,
  updateLocalHiringApplicationPersonalityAssessment,
  updateLocalHiringApplicationWorkflow,
  updateLocalHiringForm,
} from "@/lib/local-hiring-funnel-store";
import {
  normalizeHiringFormScreeningPolicy,
} from "@/lib/hiring-screening-policy";
import {
  buildInitialHiringApplicationWorkflow,
  normalizeHiringApplicationWorkflow,
} from "@/lib/hiring-application-workflow";
import {
  normalizePersonalityAssessmentSnapshot,
} from "@/lib/personality-assessment";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  getWorkspacePublicSnapshot,
  sanitizeWorkspaceId,
} from "@/lib/workspace-settings";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
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
  HiringFormScreeningPolicy,
  PublicHiringForm,
  StoredResumeFile,
  WorkspacePublicSnapshot,
} from "@/types/hiring-funnel";

const DEFAULT_WORKSPACE_PROFILE = getWorkspacePublicSnapshot(
  DEFAULT_WORKSPACE_SETTINGS
);

let hiringFunnelSeedPromise: Promise<void> | null = null;

export async function listHiringForms(
  baseUrl: string,
  workspaceId: string
): Promise<HiringFormListItem[]> {
  if (!isPostgresConfigured()) {
    return listLocalHiringForms(baseUrl, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<DbFormListRow>(
    `
      SELECT
        f.*,
        COALESCE(a.application_count, 0)::int AS application_count,
        a.top_score::int AS top_score
      FROM hiring_forms f
      LEFT JOIN (
        SELECT
          form_id,
          COUNT(*)::int AS application_count,
          MAX((analysis -> 'result' -> 'score' ->> 'value')::int) AS top_score
        FROM hiring_applications
        WHERE workspace_id = $1
        GROUP BY form_id
      ) a ON a.form_id = f.id
      WHERE f.workspace_id = $1
      ORDER BY f.created_at DESC
    `,
    [scopedWorkspaceId]
  );

  return result.rows.map((row: DbFormListRow) =>
    toFormListItemFromRow(row, baseUrl)
  );
}

export async function getHiringFormDetail(
  formId: string,
  baseUrl: string,
  workspaceId: string
): Promise<HiringFormDetail | null> {
  if (!isPostgresConfigured()) {
    return getLocalHiringFormDetail(formId, baseUrl, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const formResult = await queryPostgres<DbFormListRow>(
    `
      SELECT
        f.*,
        COALESCE(a.application_count, 0)::int AS application_count,
        a.top_score::int AS top_score
      FROM hiring_forms f
      LEFT JOIN (
        SELECT
          form_id,
          COUNT(*)::int AS application_count,
          MAX((analysis -> 'result' -> 'score' ->> 'value')::int) AS top_score
        FROM hiring_applications
        WHERE workspace_id = $2
        GROUP BY form_id
      ) a ON a.form_id = f.id
      WHERE f.id = $1 AND f.workspace_id = $2
      LIMIT 1
    `,
    [formId, scopedWorkspaceId]
  );
  const formRow = formResult.rows[0];

  if (!formRow) {
    return null;
  }

  const applicationsResult = await queryPostgres<DbApplicationRow>(
    `
      SELECT *
      FROM hiring_applications
      WHERE form_id = $1 AND workspace_id = $2
      ORDER BY
        COALESCE((analysis -> 'result' -> 'score' ->> 'value')::int, 0) DESC,
        created_at DESC
    `,
    [formId, scopedWorkspaceId]
  );

  return {
    ...toFormListItemFromRow(formRow, baseUrl),
    applications: applicationsResult.rows.map(toApplicationRecordFromRow),
  };
}

export async function getPublicHiringForm(
  formId: string
): Promise<PublicHiringForm | null> {
  if (!isPostgresConfigured()) {
    return getLocalPublicHiringForm(formId);
  }

  await ensureHiringFunnelSeeded();

  const result = await queryPostgres<DbFormRow>(
    `
      SELECT *
      FROM hiring_forms
      WHERE id = $1
      LIMIT 1
    `,
    [formId]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const form = toFormRecordFromRow(row);
  const [settings, accessRecord] = await Promise.all([
    getWorkspaceSettings(form.workspaceId),
    getWorkspaceAccessRecord(form.workspaceId),
  ]);
  const workspace = {
    ...getWorkspacePublicSnapshot(settings),
    contactEmail: accessRecord?.contactEmail ?? "",
  };

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

export async function getHiringFormRecord(
  formId: string
): Promise<HiringFormRecord | null> {
  if (!isPostgresConfigured()) {
    return getLocalHiringFormRecord(formId);
  }

  await ensureHiringFunnelSeeded();

  const result = await queryPostgres<DbFormRow>(
    `
      SELECT *
      FROM hiring_forms
      WHERE id = $1
      LIMIT 1
    `,
    [formId]
  );

  return result.rows[0] ? toFormRecordFromRow(result.rows[0]) : null;
}

export async function getHiringApplicationRecord(
  applicationId: string,
  workspaceId: string
): Promise<HiringApplicationRecord | null> {
  if (!isPostgresConfigured()) {
    return getLocalHiringApplicationRecord(applicationId, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  const result = await queryPostgres<DbApplicationRow>(
    `
      SELECT *
      FROM hiring_applications
      WHERE id = $1 AND workspace_id = $2
      LIMIT 1
    `,
    [applicationId, sanitizeWorkspaceId(workspaceId)]
  );

  return result.rows[0] ? toApplicationRecordFromRow(result.rows[0]) : null;
}

export async function createHiringForm({
  workspaceId,
  workspace,
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  screeningPolicy,
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
  screeningPolicy: HiringFormScreeningPolicy;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  expiresAt: string | null;
  jdAttachment: HiringFormJdAttachment | null;
}) {
  if (!isPostgresConfigured()) {
    return createLocalHiringForm({
      workspaceId,
      workspace,
      title,
      team,
      intro,
      analysisGoal,
      roleSetup,
      screeningPolicy,
      customQuestions,
      formFields,
      expiresAt,
      jdAttachment,
    });
  }

  await ensureHiringFunnelSeeded();

  const form: HiringFormRecord = {
    id: randomUUID(),
    workspaceId: sanitizeWorkspaceId(workspaceId),
    workspace: normalizeWorkspaceSnapshot(workspace),
    title,
    team,
    intro,
    analysisGoal,
    roleSetup,
    screeningPolicy: normalizeHiringFormScreeningPolicy(screeningPolicy),
    customQuestions,
    formFields: normalizeFormFields(formFields, customQuestions),
    createdAt: new Date().toISOString(),
    expiresAt,
    published: true,
    jdAttachment,
  };

  await queryPostgres(
    `
      INSERT INTO hiring_forms (
        id,
        workspace_id,
        title,
        team,
        intro,
        analysis_goal,
        role_setup,
        screening_policy,
        custom_questions,
        form_fields,
        workspace,
        created_at,
        expires_at,
        published,
        jd_attachment
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
        $12::timestamptz, $13::timestamptz, $14, $15::jsonb
      )
    `,
    [
      form.id,
      form.workspaceId,
      form.title,
      form.team,
      form.intro,
      form.analysisGoal,
      JSON.stringify(form.roleSetup),
      JSON.stringify(form.screeningPolicy),
      JSON.stringify(form.customQuestions),
      JSON.stringify(form.formFields),
      JSON.stringify(form.workspace),
      form.createdAt,
      form.expiresAt,
      form.published,
      form.jdAttachment ? JSON.stringify(form.jdAttachment) : null,
    ]
  );

  return form;
}

export async function updateHiringForm({
  formId,
  workspaceId,
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  screeningPolicy,
  customQuestions,
  formFields,
  expiresAt,
  jdAttachment,
  published,
}: {
  formId: string;
  workspaceId: string;
  title: string;
  team: string;
  intro: string;
  analysisGoal: string;
  roleSetup: RoleSetup;
  screeningPolicy: HiringFormScreeningPolicy;
  customQuestions: HiringFormQuestion[];
  formFields: HiringFormField[];
  expiresAt: string | null;
  jdAttachment: HiringFormJdAttachment | null;
  published?: boolean;
}) {
  if (!isPostgresConfigured()) {
    return updateLocalHiringForm({
      formId,
      workspaceId,
      title,
      team,
      intro,
      analysisGoal,
      roleSetup,
      screeningPolicy,
      customQuestions,
      formFields,
      expiresAt,
      jdAttachment,
      published,
    });
  }

  await ensureHiringFunnelSeeded();

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existing = await getHiringFormRecord(formId);

  if (!existing || existing.workspaceId !== scopedWorkspaceId) {
    return null;
  }

  const result = await queryPostgres<DbFormRow>(
    `
      UPDATE hiring_forms
      SET title = $3,
          team = $4,
          intro = $5,
          analysis_goal = $6,
          role_setup = $7::jsonb,
          screening_policy = $8::jsonb,
          custom_questions = $9::jsonb,
          form_fields = $10::jsonb,
          expires_at = $11::timestamptz,
          jd_attachment = $12::jsonb,
          published = $13
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `,
    [
      formId,
      scopedWorkspaceId,
      title,
      team,
      intro,
      analysisGoal,
      JSON.stringify(roleSetup),
      JSON.stringify(normalizeHiringFormScreeningPolicy(screeningPolicy)),
      JSON.stringify(customQuestions),
      JSON.stringify(normalizeFormFields(formFields, customQuestions)),
      expiresAt,
      jdAttachment ? JSON.stringify(jdAttachment) : null,
      published ?? existing.published,
    ]
  );

  return result.rows[0] ? toFormRecordFromRow(result.rows[0]) : null;
}

export async function setHiringFormPublished({
  formId,
  workspaceId,
  published,
}: {
  formId: string;
  workspaceId: string;
  published: boolean;
}) {
  const form = await getHiringFormRecord(formId);

  if (!form || form.workspaceId !== sanitizeWorkspaceId(workspaceId)) {
    return null;
  }

  return updateHiringForm({
    formId,
    workspaceId,
    title: form.title,
    team: form.team,
    intro: form.intro,
    analysisGoal: form.analysisGoal,
    roleSetup: form.roleSetup,
    screeningPolicy: form.screeningPolicy,
    customQuestions: form.customQuestions,
    formFields: form.formFields,
    expiresAt: form.expiresAt,
    jdAttachment: form.jdAttachment,
    published,
  });
}

export async function createHiringApplication({
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
  if (!isPostgresConfigured()) {
    return createLocalHiringApplication({
      formId,
      applicant,
      resumeFile,
      analysis,
    });
  }

  await ensureHiringFunnelSeeded();

  return withPostgresTransaction(async (client) => {
    const formResult = await client.query<{
      role_setup: unknown;
      screening_policy: unknown;
      workspace_id: string;
    }>(
      `
        SELECT workspace_id, screening_policy, role_setup
        FROM hiring_forms
        WHERE id = $1
        LIMIT 1
      `,
      [formId]
    );
    const form = formResult.rows[0];

    if (!form) {
      throw new Error("Form not found.");
    }

    const uploadId = getUploadIdFromStoragePath(resumeFile.storagePath);
    const application: HiringApplicationRecord = {
      id: randomUUID(),
      workspaceId: form.workspace_id,
      formId,
      createdAt: new Date().toISOString(),
      applicant,
      resumeFile,
      analysis,
      workflow: buildInitialHiringApplicationWorkflow({
        analysis,
        roleSetup: normalizeRoleSetup(form.role_setup),
        screeningPolicy: normalizeHiringFormScreeningPolicy(form.screening_policy),
      }),
      personalityAssessment: null,
    };

    await client.query(
      `
        INSERT INTO hiring_applications (
          id,
          workspace_id,
          form_id,
          upload_id,
          created_at,
          applicant,
          analysis,
          resume_file,
          workflow,
          personality_assessment
        )
        VALUES (
          $1, $2, $3, $4,
          $5::timestamptz,
          $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb
        )
      `,
      [
        application.id,
        application.workspaceId,
        application.formId,
        uploadId,
        application.createdAt,
        JSON.stringify(application.applicant),
        JSON.stringify(application.analysis),
        JSON.stringify(application.resumeFile),
        JSON.stringify(application.workflow),
        application.personalityAssessment
          ? JSON.stringify(application.personalityAssessment)
          : null,
      ]
    );

    return application;
  });
}

export async function updateHiringApplicationWorkflow({
  applicationId,
  workspaceId,
  workflow,
}: {
  applicationId: string;
  workspaceId: string;
  workflow: HiringApplicationRecord["workflow"];
}) {
  if (!isPostgresConfigured()) {
    return updateLocalHiringApplicationWorkflow({
      applicationId,
      workspaceId,
      workflow,
    });
  }

  await ensureHiringFunnelSeeded();

  const result = await queryPostgres<DbApplicationRow>(
    `
      UPDATE hiring_applications
      SET workflow = $3::jsonb
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `,
    [
      applicationId,
      sanitizeWorkspaceId(workspaceId),
      JSON.stringify(normalizeHiringApplicationWorkflow(workflow)),
    ]
  );

  return result.rows[0] ? toApplicationRecordFromRow(result.rows[0]) : null;
}

export async function updateHiringApplicationPersonalityAssessment({
  applicationId,
  workspaceId,
  personalityAssessment,
}: {
  applicationId: string;
  workspaceId: string;
  personalityAssessment: HiringApplicationRecord["personalityAssessment"];
}) {
  if (!isPostgresConfigured()) {
    return updateLocalHiringApplicationPersonalityAssessment({
      applicationId,
      workspaceId,
      personalityAssessment,
    });
  }

  await ensureHiringFunnelSeeded();

  const normalizedAssessment = normalizePersonalityAssessmentSnapshot(personalityAssessment);

  const result = await queryPostgres<DbApplicationRow>(
    `
      UPDATE hiring_applications
      SET personality_assessment = $3::jsonb
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `,
    [
      applicationId,
      sanitizeWorkspaceId(workspaceId),
      normalizedAssessment ? JSON.stringify(normalizedAssessment) : null,
    ]
  );

  return result.rows[0] ? toApplicationRecordFromRow(result.rows[0]) : null;
}

export async function deleteHiringApplication(
  applicationId: string,
  workspaceId: string
) {
  if (!isPostgresConfigured()) {
    return deleteLocalHiringApplication(applicationId, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  return withPostgresTransaction(async (client) => {
    const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
    const existing = await client.query<{
      upload_id: string | null;
    }>(
      `
        SELECT upload_id
        FROM hiring_applications
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [applicationId, scopedWorkspaceId]
    );
    const application = existing.rows[0];

    if (!application) {
      return false;
    }

    await client.query(
      `
        DELETE FROM hiring_applications
        WHERE id = $1 AND workspace_id = $2
      `,
      [applicationId, scopedWorkspaceId]
    );
    await client.query(
      `
        DELETE FROM candidate_email_drafts
        WHERE application_id = $1 AND workspace_id = $2
      `,
      [applicationId, scopedWorkspaceId]
    );

    if (application.upload_id) {
      await client.query("DELETE FROM uploaded_files WHERE id = $1", [
        application.upload_id,
      ]);
    }

    return true;
  });
}

export async function getHiringApplicationDownload(
  applicationId: string,
  workspaceId: string
) {
  if (!isPostgresConfigured()) {
    return getLocalHiringApplicationDownload(applicationId, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<DbApplicationDownloadRow>(
    `
      SELECT
        a.resume_file,
        u.id AS upload_id,
        u.file_name,
        u.mime_type,
        u.binary_data
      FROM hiring_applications a
      LEFT JOIN uploaded_files u ON u.id = a.upload_id
      WHERE a.id = $1 AND a.workspace_id = $2
      LIMIT 1
    `,
    [applicationId, scopedWorkspaceId]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const resumeFile = normalizeStoredResumeFile(row.resume_file);

  if (row.binary_data) {
    return {
      buffer: Buffer.from(row.binary_data),
      fileName: row.file_name || resumeFile.fileName,
      mimeType: row.mime_type || resumeFile.mimeType || "application/octet-stream",
    };
  }

  if (resumeFile.storagePath && !resumeFile.storagePath.startsWith("database:")) {
    const buffer = await readLocalUploadedBinaryByStoragePath(resumeFile.storagePath);

    if (buffer) {
      return {
        buffer,
        fileName: resumeFile.fileName,
        mimeType: resumeFile.mimeType || "application/octet-stream",
      };
    }
  }

  return null;
}

export async function deleteHiringForm(formId: string, workspaceId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalHiringForm(formId, workspaceId);
  }

  await ensureHiringFunnelSeeded();

  return withPostgresTransaction(async (client) => {
    const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
    const formResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM hiring_forms
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [formId, scopedWorkspaceId]
    );

    if (!formResult.rows[0]) {
      return false;
    }

    const uploadsResult = await client.query<{ upload_id: string | null }>(
      `
        SELECT upload_id
        FROM hiring_applications
        WHERE form_id = $1 AND workspace_id = $2
      `,
      [formId, scopedWorkspaceId]
    );
    const uploadIds = uploadsResult.rows
      .map((row: { upload_id: string | null }) => row.upload_id)
      .filter((value: string | null): value is string => Boolean(value));

    if (uploadIds.length > 0) {
      await client.query(
        "DELETE FROM uploaded_files WHERE id = ANY($1::text[])",
        [uploadIds]
      );
    }

    await client.query(
      `
        DELETE FROM candidate_email_drafts
        WHERE form_id = $1 AND workspace_id = $2
      `,
      [formId, scopedWorkspaceId]
    );

    await client.query(
      `
        DELETE FROM hiring_forms
        WHERE id = $1 AND workspace_id = $2
      `,
      [formId, scopedWorkspaceId]
    );

    return true;
  });
}

export async function saveUploadedBinary({
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
  if (!isPostgresConfigured()) {
    return saveLocalUploadedBinary({
      workspaceId,
      prefix,
      fileName,
      buffer,
      mimeType,
      inputKind,
    });
  }

  await ensureHiringFunnelSeeded();

  const uploadId = randomUUID();
  const scopedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const storedFile: StoredResumeFile = {
    fileName,
    mimeType,
    size: buffer.length,
    inputKind,
    storagePath: `database:${uploadId}`,
  };

  await queryPostgres(
    `
      INSERT INTO uploaded_files (
        id,
        workspace_id,
        file_name,
        mime_type,
        file_size,
        input_kind,
        binary_data,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
    [
      uploadId,
      scopedWorkspaceId,
      fileName,
      mimeType,
      buffer.length,
      inputKind,
      buffer,
    ]
  );

  return storedFile;
}

async function ensureHiringFunnelSeeded() {
  if (hiringFunnelSeedPromise) {
    return hiringFunnelSeedPromise;
  }

  hiringFunnelSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM hiring_forms"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalHiringFunnelStoreForMigration();

    for (const form of localStore.forms) {
      await insertFormRecord(client, form);
    }

    for (const application of localStore.applications) {
      let uploadId: string | null = getUploadIdFromStoragePath(
        application.resumeFile.storagePath
      );
      let resumeFile = normalizeStoredResumeFile(application.resumeFile);

      if (!uploadId && application.resumeFile.storagePath) {
        const buffer = await readLocalUploadedBinaryByStoragePath(
          application.resumeFile.storagePath
        );

        if (buffer) {
          uploadId = randomUUID();
          resumeFile = {
            ...resumeFile,
            size: buffer.length,
            storagePath: `database:${uploadId}`,
          };

          await insertUploadedFile(client, {
            id: uploadId,
            workspaceId: application.workspaceId,
            fileName: resumeFile.fileName,
            mimeType: resumeFile.mimeType,
            size: resumeFile.size,
            inputKind: resumeFile.inputKind,
            buffer,
          });
        }
      }

      await client.query(
        `
        INSERT INTO hiring_applications (
          id,
          workspace_id,
          form_id,
          upload_id,
          created_at,
          applicant,
          analysis,
          resume_file,
          workflow,
          personality_assessment
        )
        VALUES (
          $1, $2, $3, $4,
          $5::timestamptz,
          $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [
        application.id,
        sanitizeWorkspaceId(application.workspaceId),
        application.formId,
        uploadId,
        application.createdAt,
        JSON.stringify(application.applicant),
        JSON.stringify(application.analysis),
        JSON.stringify(resumeFile),
        JSON.stringify(application.workflow),
        application.personalityAssessment
          ? JSON.stringify(application.personalityAssessment)
          : null,
      ]
    );
  }
  });

  return hiringFunnelSeedPromise;
}

async function insertFormRecord(client: PoolClient, form: HiringFormRecord) {
  await client.query(
    `
      INSERT INTO hiring_forms (
        id,
        workspace_id,
        title,
        team,
        intro,
        analysis_goal,
        role_setup,
        screening_policy,
        custom_questions,
        form_fields,
        workspace,
        created_at,
        expires_at,
        published,
        jd_attachment
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
        $12::timestamptz, $13::timestamptz, $14, $15::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `,
    [
      form.id,
      sanitizeWorkspaceId(form.workspaceId),
      form.title,
      form.team,
      form.intro,
      form.analysisGoal,
      JSON.stringify(form.roleSetup),
      JSON.stringify(normalizeHiringFormScreeningPolicy(form.screeningPolicy)),
      JSON.stringify(form.customQuestions),
      JSON.stringify(form.formFields),
      JSON.stringify(normalizeWorkspaceSnapshot(form.workspace)),
      form.createdAt,
      form.expiresAt,
      form.published,
      form.jdAttachment ? JSON.stringify(form.jdAttachment) : null,
    ]
  );
}

async function insertUploadedFile(
  client: PoolClient,
  {
    id,
    workspaceId,
    fileName,
    mimeType,
    size,
    inputKind,
    buffer,
  }: {
    id: string;
    workspaceId: string;
    fileName: string;
    mimeType: string;
    size: number;
    inputKind: UploadSourceKind;
    buffer: Buffer;
  }
) {
  await client.query(
    `
      INSERT INTO uploaded_files (
        id,
        workspace_id,
        file_name,
        mime_type,
        file_size,
        input_kind,
        binary_data,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO NOTHING
    `,
    [id, sanitizeWorkspaceId(workspaceId), fileName, mimeType, size, inputKind, buffer]
  );
}

function toFormListItemFromRow(row: DbFormListRow, baseUrl: string): HiringFormListItem {
  const form = toFormRecordFromRow(row);

  return {
    ...form,
    publicUrl: `${baseUrl}/apply/${form.id}`,
    status: deriveFormStatus(form.expiresAt, form.published),
    applicationCount: row.application_count ?? 0,
    topScore: row.top_score ?? null,
  };
}

function toFormRecordFromRow(row: DbFormRow): HiringFormRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    title: row.title ?? "",
    team: row.team ?? "",
    intro: row.intro ?? "",
    analysisGoal: row.analysis_goal ?? "",
    roleSetup: normalizeRoleSetup(row.role_setup),
    screeningPolicy: normalizeHiringFormScreeningPolicy(row.screening_policy),
    customQuestions: normalizeCustomQuestions(row.custom_questions),
    formFields: normalizeFormFields(
      row.form_fields,
      normalizeCustomQuestions(row.custom_questions)
    ),
    workspace: normalizeWorkspaceSnapshot(row.workspace),
    createdAt: toIsoString(row.created_at),
    expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
    published: row.published !== false,
    jdAttachment: normalizeJdAttachment(row.jd_attachment),
  };
}

function toApplicationRecordFromRow(row: DbApplicationRow): HiringApplicationRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    formId: row.form_id,
    createdAt: toIsoString(row.created_at),
    applicant: normalizeApplicantProfile(row.applicant),
    resumeFile: normalizeStoredResumeFile(row.resume_file),
    analysis: normalizeAnalysisResponse(row.analysis),
    workflow: normalizeHiringApplicationWorkflow(row.workflow),
    personalityAssessment: normalizePersonalityAssessmentSnapshot(
      row.personality_assessment
    ),
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
    .map((item, index) => {
      const parsed = item as Partial<HiringFormQuestion>;
      const label = typeof parsed.label === "string" ? parsed.label.trim() : "";

      if (!label) {
        return null;
      }

      return {
        id:
          typeof parsed.id === "string" && parsed.id.trim()
            ? parsed.id.trim()
            : `question-${index + 1}`,
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
    .map((item, index): HiringFormField | null => {
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
            : `field-${index + 1}`,
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

function normalizeApplicantProfile(value: unknown): ApplicantProfile {
  const parsed = (value ?? {}) as Partial<ApplicantProfile>;

  return {
    fullName: typeof parsed.fullName === "string" ? parsed.fullName : "",
    email: typeof parsed.email === "string" ? parsed.email : "",
    phone: typeof parsed.phone === "string" ? parsed.phone : "",
    location: typeof parsed.location === "string" ? parsed.location : "",
    linkedIn: typeof parsed.linkedIn === "string" ? parsed.linkedIn : "",
    portfolio: typeof parsed.portfolio === "string" ? parsed.portfolio : "",
    yearsExperience:
      typeof parsed.yearsExperience === "string" ? parsed.yearsExperience : "",
    noticePeriod:
      typeof parsed.noticePeriod === "string" ? parsed.noticePeriod : "",
    salaryExpectation:
      typeof parsed.salaryExpectation === "string" ? parsed.salaryExpectation : "",
    coverNote: typeof parsed.coverNote === "string" ? parsed.coverNote : "",
    customAnswers:
      parsed.customAnswers && typeof parsed.customAnswers === "object"
        ? Object.fromEntries(
            Object.entries(parsed.customAnswers).map(([key, entry]) => [
              key,
              typeof entry === "string" ? entry : "",
            ])
          )
        : {},
  };
}

function normalizeStoredResumeFile(value: unknown): StoredResumeFile {
  const parsed = (value ?? {}) as Partial<StoredResumeFile>;

  return {
    fileName: typeof parsed.fileName === "string" ? parsed.fileName : "resume",
    mimeType:
      typeof parsed.mimeType === "string" ? parsed.mimeType : "application/octet-stream",
    size: typeof parsed.size === "number" ? parsed.size : 0,
    inputKind: (parsed.inputKind as UploadSourceKind) || "pdf",
    storagePath: typeof parsed.storagePath === "string" ? parsed.storagePath : "",
  };
}

function normalizeAnalysisResponse(value: unknown): AnalysisResponse {
  return value as AnalysisResponse;
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

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getUploadIdFromStoragePath(storagePath: string) {
  if (!storagePath.startsWith("database:")) {
    return null;
  }

  const uploadId = storagePath.slice("database:".length).trim();
  return uploadId || null;
}

type DbFormRow = QueryResultRow & {
  created_at: Date | string;
  custom_questions: unknown;
  form_fields: unknown;
  expires_at: Date | string | null;
  id: string;
  intro: string | null;
  jd_attachment: unknown;
  published: boolean | null;
  analysis_goal: string | null;
  role_setup: unknown;
  screening_policy: unknown;
  team: string | null;
  title: string | null;
  workspace: unknown;
  workspace_id: string;
};

type DbFormListRow = DbFormRow & {
  application_count: number | null;
  top_score: number | null;
};

type DbApplicationRow = QueryResultRow & {
  analysis: unknown;
  applicant: unknown;
  created_at: Date | string;
  form_id: string;
  id: string;
  personality_assessment: unknown;
  resume_file: unknown;
  workflow: unknown;
  workspace_id: string;
};

type DbApplicationDownloadRow = QueryResultRow & {
  binary_data: Buffer | null;
  file_name: string | null;
  mime_type: string | null;
  resume_file: unknown;
  upload_id: string | null;
};
