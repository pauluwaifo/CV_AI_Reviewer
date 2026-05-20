import { randomBytes } from "node:crypto";

export function generateWorkspaceAccessKey() {
  return `workspace_${randomBytes(18).toString("base64url")}`;
}
