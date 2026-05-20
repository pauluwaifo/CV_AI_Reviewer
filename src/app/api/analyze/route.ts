import { NextResponse } from "next/server";

import {
  analyzeUpload,
  DocumentAnalysisError,
  extractUploadTextFromFile,
} from "@/lib/document-intelligence";
import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  analysisProviders,
  documentTypes,
  type AnalysisProvider,
  type DocumentType,
  type RoleSetup,
} from "@/types/document-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const jobDescriptionFile = formData.get("jobDescriptionFile");
    const documentTypeValue = String(formData.get("documentType") || "auto");
    const providerValue = String(formData.get("provider") || "auto");
    const analysisGoal = String(formData.get("analysisGoal") || "").trim();
    const roleSetup = parseRoleSetup(formData.get("roleSetup"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Attach a CV file before running the analysis." },
        { status: 400 }
      );
    }

    const documentType = isDocumentType(documentTypeValue)
      ? documentTypeValue
      : "auto";
    const provider = isAnalysisProvider(providerValue) ? providerValue : "auto";

    const mergedAnalysisGoal = await buildMergedAnalysisGoal(
      analysisGoal,
      jobDescriptionFile
    );

    const payload = await analyzeUpload({
      file,
      documentType,
      provider,
      analysisGoal: mergedAnalysisGoal,
      roleSetup,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof DocumentAnalysisError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Document analysis failed:", error);

    return NextResponse.json(
      {
        error:
          "Something went wrong while analyzing the file. Check your API keys and try again.",
      },
      { status: 500 }
    );
  }
}

async function buildMergedAnalysisGoal(
  analysisGoal: string,
  jobDescriptionFile: FormDataEntryValue | null
) {
  const sections = [analysisGoal].filter(Boolean);

  if (jobDescriptionFile instanceof File) {
    const extracted = await extractUploadTextFromFile(jobDescriptionFile);
    const trimmed = extracted.text.slice(0, 6_000).trim();

    if (trimmed) {
      sections.push(`Attached job description (${jobDescriptionFile.name}):\n${trimmed}`);
    }
  }

  return sections.join("\n\n").trim();
}

function isDocumentType(value: string): value is DocumentType {
  return (documentTypes as readonly string[]).includes(value);
}

function isAnalysisProvider(value: string): value is AnalysisProvider {
  return (analysisProviders as readonly string[]).includes(value);
}

function parseRoleSetup(value: FormDataEntryValue | null): RoleSetup | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as RoleSetup;
  } catch {
    return undefined;
  }
}
