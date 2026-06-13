import { NextResponse } from "next/server";

import { generateHiringFormDraft } from "@/lib/document-intelligence";
import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import type { RoleSetup } from "@/types/document-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const payload = (await request.json().catch(() => null)) as
      | {
          title?: string;
          team?: string;
          intro?: string;
          analysisGoal?: string;
          prompt?: string;
          roleSetup?: Partial<RoleSetup>;
        }
      | null;

    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    const team = typeof payload?.team === "string" ? payload.team.trim() : "";
    const intro = typeof payload?.intro === "string" ? payload.intro.trim() : "";
    const analysisGoal =
      typeof payload?.analysisGoal === "string" ? payload.analysisGoal.trim() : "";
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const roleSetup = normalizeRoleSetupPayload(payload?.roleSetup);

    if (
      !title &&
      !team &&
      !intro &&
      !analysisGoal &&
      !prompt &&
      !roleSetup.title &&
      !roleSetup.seniority &&
      !roleSetup.location &&
      !roleSetup.summary &&
      roleSetup.mustHaveSkills.length === 0 &&
      roleSetup.niceToHaveSkills.length === 0 &&
      roleSetup.interviewFocus.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Add a role title, screening brief, skill list, or a short instruction before generating a form draft.",
        },
        { status: 400 }
      );
    }

    const generated = await generateHiringFormDraft({
      title,
      team,
      intro,
      analysisGoal,
      roleSetup,
      prompt,
      provider: "auto",
      workspaceId: session.workspaceId,
    });

    return NextResponse.json(generated);
  } catch {
    return NextResponse.json(
      { error: "I couldn't generate a form draft right now." },
      { status: 500 }
    );
  }
}

function normalizeRoleSetupPayload(value: Partial<RoleSetup> | undefined): RoleSetup {
  return {
    title: typeof value?.title === "string" ? value.title.trim() : "",
    seniority: typeof value?.seniority === "string" ? value.seniority.trim() : "",
    location: typeof value?.location === "string" ? value.location.trim() : "",
    summary: typeof value?.summary === "string" ? value.summary.trim() : "",
    mustHaveSkills: Array.isArray(value?.mustHaveSkills)
      ? value.mustHaveSkills
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    niceToHaveSkills: Array.isArray(value?.niceToHaveSkills)
      ? value.niceToHaveSkills
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    interviewFocus: Array.isArray(value?.interviewFocus)
      ? value.interviewFocus
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  };
}
