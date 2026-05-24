import "server-only";

import {
  getWorkspaceFeatureModule,
  getWorkspaceModuleLockedMessage,
  isWorkspaceModuleAccessible,
  type WorkspaceFeatureKey,
} from "@/lib/workspace-controls";
import { getWorkspaceControlSettings } from "@/lib/workspace-control-store";
import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
  requireWorkspacePageSession,
  type WorkspaceSessionRole,
} from "@/lib/workspace-auth";

export async function requireWorkspaceFeaturePageAccess(
  nextPath: string,
  featureKey: WorkspaceFeatureKey,
  options?: {
    role?: WorkspaceSessionRole;
  }
) {
  const session = await requireWorkspacePageSession(nextPath, options);
  const controls = await getWorkspaceControlSettings(session.workspaceId);
  const featureModule = getWorkspaceFeatureModule(featureKey);

  return {
    controls,
    isAccessible: isWorkspaceModuleAccessible(controls, featureKey),
    lockedMessage: getWorkspaceModuleLockedMessage(controls, featureKey),
    module: featureModule,
    session,
  };
}

export async function requireWorkspaceFeatureApiAccess(
  request: Request,
  featureKey: WorkspaceFeatureKey,
  options?: {
    role?: WorkspaceSessionRole;
  }
) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return {
      errorResponse: createWorkspaceUnauthorizedResponse(),
      session: null,
    } as const;
  }

  if (options?.role === "admin" && session.role !== "admin") {
    return {
      errorResponse: createWorkspaceForbiddenResponse(),
      session,
    } as const;
  }

  const controls = await getWorkspaceControlSettings(session.workspaceId);

  if (!isWorkspaceModuleAccessible(controls, featureKey)) {
    return {
      errorResponse: Response.json(
        {
          error: getWorkspaceModuleLockedMessage(controls, featureKey),
        },
        { status: 403 }
      ),
      session,
    } as const;
  }

  return {
    controls,
    errorResponse: null,
    session,
  } as const;
}
