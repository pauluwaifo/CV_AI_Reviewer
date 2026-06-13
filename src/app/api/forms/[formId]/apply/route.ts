import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { analyzeUpload, DocumentAnalysisError } from "@/lib/document-intelligence";
import {
  createHiringApplication,
  getHiringFormRecord,
  getPublicHiringForm,
  saveUploadedBinary,
} from "@/lib/hiring-funnel-store";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import type { ApplicantProfile } from "@/types/hiring-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const form = await getPublicHiringForm(formId);
    const fullForm = await getHiringFormRecord(formId);

    if (!form || !fullForm) {
      return NextResponse.json({ error: "This application form was not found." }, { status: 404 });
    }

    if (form.status === "expired") {
      return NextResponse.json(
        { error: "This application form has expired and is no longer accepting submissions." },
        { status: 410 }
      );
    }

    if (form.status === "unpublished") {
      return NextResponse.json(
        { error: "This application form is currently unpublished." },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const resumeFile = formData.get("resumeFile");
    const screeningConsent = String(formData.get("screeningConsent") || "").trim();

    if (screeningConsent !== "agreed") {
      return NextResponse.json(
        {
          error:
            "Confirm that you understand this application will be stored and screened before you submit.",
        },
        { status: 400 }
      );
    }

    if (!(resumeFile instanceof File)) {
      return NextResponse.json(
        { error: "Attach your CV or resume before submitting." },
        { status: 400 }
      );
    }

    const applicant = buildApplicantProfile(formData);

    if (!applicant.fullName || !applicant.email) {
      return NextResponse.json(
        { error: "Name and email are required before you can submit." },
        { status: 400 }
      );
    }

    const missingRequiredField = form.formFields.find((field) => {
      if (!field.required || field.type === "file") {
        return false;
      }

      if (field.systemKey) {
        return !getFieldAnswer(formData, field.systemKey).trim();
      }

      return !getFieldAnswer(formData, `field:${field.id}`).trim();
    });

    if (missingRequiredField) {
      return NextResponse.json(
        { error: `Answer "${missingRequiredField.label}" before submitting.` },
        { status: 400 }
      );
    }

    const analysisGoal = buildApplicantAnalysisGoal(fullForm, applicant);
    const analysis = await analyzeUpload({
      file: resumeFile,
      documentType: "cv",
      provider: "auto",
      analysisGoal,
      roleSetup: form.roleSetup,
      workspaceId: fullForm.workspaceId,
    });

    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const storedFile = await saveUploadedBinary({
      workspaceId: fullForm.workspaceId,
      prefix: randomUUID(),
      fileName: resumeFile.name,
      buffer,
      mimeType: analysis.meta.mimeType,
      inputKind: analysis.meta.inputKind,
    });

    const application = await createHiringApplication({
      formId,
      applicant,
      resumeFile: storedFile,
      analysis,
    });
    await createWorkspaceAuditEvent({
      action: "application.created",
      actorEmail: applicant.email,
      actorRole: "member",
      metadata: {
        decision: application.analysis.result.recommendation.decision,
        score: application.analysis.result.score.value,
        stage: application.workflow.stage,
      },
      summary: `New application from ${applicant.fullName || applicant.email}.`,
      targetId: application.id,
      targetType: "application",
      workspaceId: fullForm.workspaceId,
    }).catch(() => undefined);
    await emitWorkspaceIntegrationEvent(fullForm.workspaceId, "application.created", {
      applicationId: application.id,
      candidateEmail: applicant.email,
      candidateName: applicant.fullName,
      candidateMailUrl: `${new URL(request.url).origin}${appendWorkspaceQuery(
        `/candidate-mail?form=${encodeURIComponent(formId)}&application=${encodeURIComponent(application.id)}`,
        fullForm.workspaceId
      )}`,
      decision: application.analysis.result.recommendation.decision,
      formId,
      formTitle: fullForm.title,
      pipelineUrl: `${new URL(request.url).origin}${appendWorkspaceQuery(
        `/pipeline?form=${encodeURIComponent(formId)}&application=${encodeURIComponent(application.id)}`,
        fullForm.workspaceId
      )}`,
      score: application.analysis.result.score.value,
      workflow: application.workflow,
    }).catch(() => undefined);

    return NextResponse.json({
      applicationId: application.id,
      summary: {
        decision: application.analysis.result.recommendation.decision,
        score: application.analysis.result.score.value,
      },
    });
  } catch (error) {
    if (error instanceof DocumentAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "I couldn't submit that application right now." },
      { status: 500 }
    );
  }
}

function buildApplicantProfile(formData: FormData) {
  const customAnswers: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("question:") || typeof value !== "string") {
      if (!key.startsWith("field:") || typeof value !== "string") {
        continue;
      }
    }

    const answerKey = key.replace("question:", "").replace("field:", "");
    customAnswers[answerKey] = getFieldAnswer(formData, key);
  }

  return {
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    linkedIn: String(formData.get("linkedIn") || "").trim(),
    portfolio: String(formData.get("portfolio") || "").trim(),
    yearsExperience: String(formData.get("yearsExperience") || "").trim(),
    noticePeriod: String(formData.get("noticePeriod") || "").trim(),
    salaryExpectation: String(formData.get("salaryExpectation") || "").trim(),
    coverNote: String(formData.get("coverNote") || "").trim(),
    customAnswers,
  } satisfies ApplicantProfile;
}

function getFieldAnswer(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

function buildApplicantAnalysisGoal(
  form: NonNullable<Awaited<ReturnType<typeof getHiringFormRecord>>>,
  applicant: ApplicantProfile
) {
  const applicantSections = [
    applicant.yearsExperience ? `Years of experience: ${applicant.yearsExperience}` : "",
    applicant.location ? `Location: ${applicant.location}` : "",
    applicant.noticePeriod ? `Notice period: ${applicant.noticePeriod}` : "",
    applicant.salaryExpectation
      ? `Salary expectation: ${applicant.salaryExpectation}`
      : "",
    applicant.coverNote ? `Applicant note: ${applicant.coverNote}` : "",
    ...Object.entries(applicant.customAnswers).map(
      ([questionId, answer]) => {
        const label =
          form.formFields.find((item) => item.id === questionId)?.label ||
          form.customQuestions.find((item) => item.id === questionId)?.label ||
          questionId;
        return `${label}: ${answer}`;
      }
    ),
  ].filter(Boolean);

  const sections = [
    form.intro,
    form.analysisGoal,
    form.roleSetup.summary,
    form.jdAttachment?.text
      ? `Attached job description:\n${form.jdAttachment.text.slice(0, 6_000)}`
      : "",
    applicantSections.length > 0
      ? `Applicant submission details:\n${applicantSections.join("\n")}`
      : "",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}
