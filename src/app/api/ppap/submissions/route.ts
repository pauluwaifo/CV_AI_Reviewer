import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { generatePpapAssessmentAnalysis } from "@/lib/document-intelligence";
import { buildTextEmailHtml, sendWorkspaceMail } from "@/lib/mail-service";
import { createPpapSubmission } from "@/lib/ppap-store";
import { scorePpapAssessment } from "@/lib/ppap-assessment";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import type { PpapBrand, PpapCandidateIntake } from "@/types/ppap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_BRANDS: PpapBrand[] = ["ICF", "YYE", "Back Office", "Multiple"];

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!payload) {
      return NextResponse.json({ error: "Submit the PPAP responses as JSON." }, { status: 400 });
    }

    const workspaceId = normalizeString(payload.workspaceId);
    const fullName = normalizeString(payload.fullName);
    const roleApplied = normalizeString(payload.roleApplied);
    const brand = normalizeBrand(payload.brand);
    const email = normalizeOptionalEmail(payload.email);
    const responses = normalizeResponses(payload.responses);

    if (!workspaceId || !fullName || !roleApplied || !brand) {
      return NextResponse.json(
        {
          error:
            "Enter the candidate name, role applied, brand, and workspace before submitting the assessment.",
        },
        { status: 400 }
      );
    }

    const missingAnswers = Array.from({ length: 30 }, (_, index) => index + 1).filter(
      (questionId) => typeof responses[questionId] !== "number"
    );

    if (missingAnswers.length > 0) {
      return NextResponse.json(
        {
          error: `Answer every question before submitting. Missing question${missingAnswers.length > 1 ? "s" : ""}: ${missingAnswers.map((item) => `Q${item}`).join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const scores = scorePpapAssessment(responses);
    const intake: PpapCandidateIntake = {
      fullName,
      email,
      roleApplied,
      brand,
      workspaceId,
    };

    const analysis = await generatePpapAssessmentAnalysis({
      intake,
      scores,
      provider: "auto",
    });

    const submission = await createPpapSubmission({
      id: randomUUID(),
      workspaceId,
      createdAt: new Date().toISOString(),
      fullName,
      email: email || null,
      roleApplied,
      brand,
      responses,
      scores,
      overallScore: scores.overallScore,
      band: scores.band,
      adminReport: analysis.adminReport,
      candidateSummary: analysis.candidateSummary,
      socialDesirabilityFlag: scores.socialDesirabilityFlag,
      aiProvider: analysis.provider,
      aiProviderDetail: analysis.providerDetail || "",
    });

    const [accessRecord, settings] = await Promise.all([
      getWorkspaceAccessRecord(workspaceId).catch(() => null),
      getWorkspaceSettings(workspaceId).catch(() => null),
    ]);
    const adminEmail = accessRecord?.contactEmail?.trim().toLowerCase() || "";
    let mailDelivery:
      | { status: "sent" | "skipped"; reason?: string; provider?: string; source?: string }
      | null = null;

    if (adminEmail) {
      const subject = `New PPAP Submission - ${submission.fullName} | ${submission.roleApplied}`;
      const text = [
        `A new PPAP submission has been saved for ${settings?.organizationName || "your workspace"}.`,
        "",
        `Candidate: ${submission.fullName}`,
        `Role applied: ${submission.roleApplied}`,
        `Brand: ${submission.brand}`,
        `Submitted: ${new Date(submission.createdAt).toLocaleString()}`,
        `Overall score: ${submission.overallScore}%`,
        `Band: ${submission.band}`,
        "",
        "Log in to the dashboard to review the full admin report, tendency scores, and candidate summary.",
      ].join("\n");

      mailDelivery = await sendWorkspaceMail({
        workspaceId,
        to: adminEmail,
        subject,
        text,
        html: buildTextEmailHtml(text),
      }).catch((error) => ({
        status: "skipped" as const,
        reason: error instanceof Error ? error.message : "PPAP admin email could not be sent.",
      }));
    }

    return NextResponse.json({
      submissionId: submission.id,
      createdAt: submission.createdAt,
      candidateSummary: submission.candidateSummary,
      overallScore: submission.overallScore,
      band: submission.band,
      emailStatus: mailDelivery?.status || "skipped",
      emailReason: mailDelivery?.status === "skipped" ? mailDelivery.reason || "" : "",
    });
  } catch (error) {
    console.error("[PPAP] Submission failed", error);

    return NextResponse.json(
      { error: "I couldn't submit that PPAP assessment right now." },
      { status: 500 }
    );
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalEmail(value: unknown) {
  const email = normalizeString(value).toLowerCase();
  return email ? email : "";
}

function normalizeBrand(value: unknown) {
  const brand = normalizeString(value);

  return SUPPORTED_BRANDS.includes(brand as PpapBrand) ? (brand as PpapBrand) : "";
}

function normalizeResponses(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const parsed = value as Record<string, unknown>;
  const responses: Record<number, number> = {};

  for (let questionId = 1; questionId <= 30; questionId += 1) {
    const raw = parsed[String(questionId)];

    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      continue;
    }

    responses[questionId] = clamp(Math.round(raw), 1, 5);
  }

  return responses;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
