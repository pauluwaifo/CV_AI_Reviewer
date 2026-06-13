import "server-only";

import { getWorkspaceControlSettings, saveWorkspaceControlSettings } from "@/lib/workspace-control-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export async function consumeWorkspaceAiCredits(workspaceId: string, credits: number) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const normalizedCredits = Math.max(0, Math.round(credits));

  if (!normalizedWorkspaceId || normalizedCredits <= 0) {
    return 0;
  }

  const controls = await getWorkspaceControlSettings(normalizedWorkspaceId);
  const currentBalance = Math.max(0, Math.round(controls.billing.aiCreditsRemaining));
  const nextBalance = Math.max(0, currentBalance - normalizedCredits);

  if (nextBalance === currentBalance) {
    return nextBalance;
  }

  await saveWorkspaceControlSettings(normalizedWorkspaceId, {
    billing: {
      ...controls.billing,
      aiCreditsRemaining: nextBalance,
    },
  });

  return nextBalance;
}
