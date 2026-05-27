import "server-only";

import { createHmac } from "node:crypto";

import {
  getWorkspaceIntegrationSettings,
  markWorkspaceIntegrationDeliveryAttempt,
  type WorkspaceIntegrationEvent,
} from "@/lib/workspace-integrations-store";

export async function emitWorkspaceIntegrationEvent(
  workspaceId: string,
  event: WorkspaceIntegrationEvent,
  payload: Record<string, unknown>
) {
  const settings = await getWorkspaceIntegrationSettings(workspaceId);

  if (settings.enabledEvents.length === 0 || !settings.enabledEvents.includes(event)) {
    return { delivered: false, reason: "not-configured" } as const;
  }

  const occurredAt = new Date().toISOString();
  const deliveries = await Promise.all([
    settings.webhookUrl
      ? deliverWebhook({ event, occurredAt, payload, settings, workspaceId })
      : Promise.resolve<IntegrationDeliveryResult>({
          delivered: false,
          error: "",
          target: "webhook",
        }),
    settings.slackWebhookUrl
      ? deliverSlack({ event, occurredAt, payload, settings, workspaceId })
      : Promise.resolve<IntegrationDeliveryResult>({
          delivered: false,
          error: "",
          target: "slack",
        }),
  ]);

  const attempted = deliveries.filter((delivery) => delivery.attempted);

  if (attempted.length === 0) {
    return { delivered: false, reason: "not-configured" } as const;
  }

  const failed = attempted.filter((delivery) => !delivery.delivered);
  const delivered = attempted.some((delivery) => delivery.delivered);
  const lastDeliveryTarget =
    attempted.length > 1
      ? "mixed"
      : attempted[0]?.target === "slack"
        ? "slack"
        : "webhook";
  const lastDeliveryError = failed.map((delivery) => delivery.error).filter(Boolean).join(" | ");

  await markWorkspaceIntegrationDeliveryAttempt(workspaceId, {
    lastDeliveryAttemptAt: occurredAt,
    lastDeliveryError,
    lastDeliveryEvent: event,
    lastDeliveryTarget,
  });

  if (delivered && failed.length === 0) {
    return { delivered: true, reason: "ok" } as const;
  }

  return {
    delivered,
    reason: failed.length > 0 ? "partial-error" : "ok",
  } as const;
}

async function deliverWebhook({
  event,
  occurredAt,
  payload,
  settings,
  workspaceId,
}: IntegrationDeliveryInput) {
  const body = JSON.stringify({
    event,
    occurredAt,
    payload,
    workspaceId,
  });
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-HRBoard-Event": event,
    "X-HRBoard-Occurred-At": occurredAt,
    "X-HRBoard-Workspace": workspaceId,
  };

  if (settings.webhookSigningSecret) {
    headers["X-HRBoard-Signature"] = createHmac("sha256", settings.webhookSigningSecret)
      .update(body)
      .digest("hex");
  }

  return postJson(settings.webhookUrl, body, headers, "webhook");
}

async function deliverSlack({
  event,
  occurredAt,
  payload,
  settings,
  workspaceId,
}: IntegrationDeliveryInput) {
  const body = JSON.stringify(buildSlackPayload({ event, occurredAt, payload, workspaceId }));
  return postJson(
    settings.slackWebhookUrl,
    body,
    {
      "Content-Type": "application/json",
    },
    "slack"
  );
}

async function postJson(
  url: string,
  body: string,
  headers: HeadersInit,
  target: "slack" | "webhook"
): Promise<IntegrationDeliveryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      headers,
      signal: controller.signal,
    });

    return {
      attempted: true,
      delivered: response.ok,
      error: response.ok ? "" : `${target === "slack" ? "Slack" : "Webhook"} returned ${response.status}.`,
      target,
    };
  } catch (error) {
    return {
      attempted: true,
      delivered: false,
      error: error instanceof Error ? error.message : `${target} delivery failed.`,
      target,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSlackPayload({
  event,
  occurredAt,
  payload,
  workspaceId,
}: {
  event: WorkspaceIntegrationEvent;
  occurredAt: string;
  payload: Record<string, unknown>;
  workspaceId: string;
}) {
  const title = humanizeIntegrationEvent(event);
  const summary = buildSlackEventSummary(event, payload);
  const facts = buildSlackFacts(payload).slice(0, 5);
  const links = buildSlackLinks(payload);

  return {
    text: `[${workspaceId}] ${title}: ${summary}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Workspace:* ${workspaceId}\n*Summary:* ${summary}\n*At:* ${new Date(occurredAt).toLocaleString()}`,
        },
      },
      ...(facts.length > 0
        ? [
            {
              type: "section",
              fields: facts.map((fact) => ({
                type: "mrkdwn",
                text: `*${fact.label}*\n${fact.value}`,
              })),
            },
          ]
        : []),
      ...(links.length > 0
        ? [
            {
              type: "actions",
              elements: links.map((link) => ({
                type: "button",
                text: {
                  type: "plain_text",
                  text: link.label,
                  emoji: true,
                },
                url: link.url,
              })),
            },
          ]
        : []),
    ],
  };
}

function buildSlackEventSummary(
  event: WorkspaceIntegrationEvent,
  payload: Record<string, unknown>
) {
  switch (event) {
    case "application.created":
      return `New application from ${toSlackText(payload.candidateName) || "a candidate"} in form ${toSlackText(payload.formTitle) || toSlackText(payload.formId) || "unknown form"}.`;
    case "application.workflow.updated":
      return `Candidate workflow moved to ${toSlackText((payload.workflow as { stage?: string } | undefined)?.stage) || "a new stage"}.`;
    case "billing.payment_succeeded":
      return `Workspace payment succeeded for ${toSlackText(payload.planName) || "the active plan"}.`;
    case "form.created":
      return `A new hiring form was created: ${toSlackText(payload.title) || "Untitled form"}.`;
    case "form.updated":
      return `Hiring form updated: ${toSlackText(payload.title) || toSlackText(payload.formId) || "form update"}.`;
    case "form.deleted":
      return `A hiring form was deleted.`;
    case "workspace.member.invited":
      return `A workspace invite was created for ${toSlackText(payload.email) || "a teammate"}.`;
    default:
      return "Workspace event delivered.";
  }
}

function buildSlackFacts(payload: Record<string, unknown>) {
  const facts: Array<{ label: string; value: string }> = [];
  const workflow = payload.workflow as { ownerEmail?: string; stage?: string; nextStep?: string } | undefined;

  pushFact(facts, "Candidate", payload.candidateName);
  pushFact(facts, "Email", payload.candidateEmail);
  pushFact(facts, "Form", payload.formTitle ?? payload.formId);
  pushFact(facts, "Stage", workflow?.stage);
  pushFact(facts, "Owner", workflow?.ownerEmail);
  pushFact(facts, "Next step", workflow?.nextStep);
  pushFact(facts, "Plan", payload.planName);
  pushFact(facts, "Reference", payload.reference);

  return facts;
}

function buildSlackLinks(payload: Record<string, unknown>) {
  return [
    { label: "Open candidate", url: toSlackUrl(payload.pipelineUrl) },
    { label: "Open candidate mail", url: toSlackUrl(payload.candidateMailUrl) },
    { label: "Open billing", url: toSlackUrl(payload.billingUrl) },
    { label: "Open workspace", url: toSlackUrl(payload.workspaceUrl) },
    { label: "Public form", url: toSlackUrl(payload.publicFormUrl) },
  ].filter((item): item is { label: string; url: string } => Boolean(item.url));
}

function pushFact(
  facts: Array<{ label: string; value: string }>,
  label: string,
  value: unknown
) {
  const normalized = toSlackText(value);

  if (!normalized) {
    return;
  }

  facts.push({ label, value: normalized });
}

function toSlackText(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function toSlackUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  return /^https?:\/\//i.test(normalized) ? normalized : "";
}

function humanizeIntegrationEvent(event: WorkspaceIntegrationEvent) {
  switch (event) {
    case "application.created":
      return "New application";
    case "application.workflow.updated":
      return "Workflow updated";
    case "billing.payment_succeeded":
      return "Payment succeeded";
    case "form.created":
      return "Form created";
    case "form.updated":
      return "Form updated";
    case "form.deleted":
      return "Form deleted";
    case "workspace.member.invited":
      return "Member invited";
    default:
      return "Workspace event";
  }
}

type IntegrationDeliveryInput = {
  event: WorkspaceIntegrationEvent;
  occurredAt: string;
  payload: Record<string, unknown>;
  settings: {
    slackWebhookUrl: string;
    webhookSigningSecret: string;
    webhookUrl: string;
  };
  workspaceId: string;
};

type IntegrationDeliveryResult = {
  attempted?: boolean;
  delivered: boolean;
  error: string;
  target: "slack" | "webhook";
};
