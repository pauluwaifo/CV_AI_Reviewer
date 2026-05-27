import type { AnalysisProvider } from "@/types/document-intelligence";

import { OWNER_DASHBOARD_ITEMS } from "@/lib/owner-navigation";

export type OwnerAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OwnerAssistantContext = {
  email: string;
  pathname: string;
};

type OwnerToolGuide = (typeof OWNER_DASHBOARD_ITEMS)[number];

export function getOwnerAssistantFirstName(email: string) {
  const localPart = email.split("@")[0]?.trim() || "";
  const clean = localPart.replace(/[._-]+/g, " ").trim();

  if (!clean) {
    return "there";
  }

  const firstWord = clean.split(/\s+/)[0] || clean;
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

export function getOwnerAssistantPageLabel(pathname: string) {
  return findOwnerGuideByPath(pathname)?.name ?? "Owner Workspace";
}

export function getOwnerAssistantQuickPrompts(context: OwnerAssistantContext) {
  const currentGuide = findOwnerGuideByPath(context.pathname);
  const prompts = ["Give me a quick owner workspace tour"];

  if (!currentGuide) {
    prompts.push(
      "How do owner controls work?",
      "How do I manage workspaces here?",
      "What should I check first in the owner dashboard?"
    );
    return prompts;
  }

  if (currentGuide.path === "/owner/controls") {
    prompts.push(
      "How do I release features one by one?",
      "How do I turn on workspace billing?",
      "How do I configure upgrade tiers?"
    );
    return prompts;
  }

  if (currentGuide.path === "/owner/workspaces") {
    prompts.push(
      "How do I inspect a workspace here?",
      "How do I remove a workspace safely?",
      "What should I review before resetting a workspace?"
    );
    return prompts;
  }

  if (currentGuide.path === "/owner/recovery") {
    prompts.push(
      "How do I reset a workspace key?",
      "How does the recovery flow work?",
      "When should I use Recovery instead of Controls?"
    );
    return prompts;
  }

  prompts.push(
    `How do I use ${currentGuide.name}?`,
    "What should I focus on here?",
    "What is the next best owner action?"
  );

  return prompts.slice(0, 4);
}

export function buildOwnerAssistantWelcomeMessage(context: OwnerAssistantContext) {
  const firstName = getOwnerAssistantFirstName(context.email);

  return [
    `Hi ${firstName}, welcome to the owner workspace.`,
    "",
    "Here is your quick control map:",
    ...OWNER_DASHBOARD_ITEMS.map((item) => `- ${formatOwnerToolLink(item)}: ${item.summary}`),
    "",
    'Ask me things like "How do I turn on billing?", "How do I release a module?", or "What can I do on this page?"',
  ].join("\n");
}

export function buildOwnerAssistantSystemPrompt({
  context,
  messages,
  provider = "auto",
}: {
  context: OwnerAssistantContext;
  messages: OwnerAssistantMessage[];
  provider?: AnalysisProvider;
}) {
  const currentPage = getOwnerAssistantPageLabel(context.pathname);
  const currentPageTip = getOwnerAssistantPageTip(context.pathname);
  const conversation = messages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
    .join("\n\n");

  return `
You are the owner-side assistant for a multi-tenant hiring workspace product.

Owner email: ${context.email}
Current page: ${currentPage}
AI preference: ${provider}

Your job is to help the platform owner manage workspace rollout, billing, recovery, and tenant health.

Available owner pages:
${OWNER_DASHBOARD_ITEMS.map(
  (item) => `- ${item.name} (${item.path})
  Summary: ${item.summary}
  How to use:
  ${item.howToUse.map((step) => `- ${step}`).join("\n  ")}`
).join("\n")}

Product behavior notes:
- Controls is where the owner enables billing, sets plan prices, and decides whether modules are open, owner-locked, or require billing.
- Workspaces is where the owner inspects companies and takes owner-only actions.
- Recovery is for shared-key resets and access recovery.
- Insights and Overview are for platform-wide visibility.
- Current page help focus: ${currentPageTip}

Response rules:
- Be concise, practical, and specific to this product.
- Whenever you reference an owner page, include a markdown link like [Controls](/owner/controls).
- When explaining a workflow, use 2 to 5 numbered steps.
- If the owner asks what changed, use the available page list and current page context.
- Keep replies focused on the owner dashboard, platform management, billing, release controls, and workspace lifecycle.
- Return strict JSON only in this shape:
{
  "reply": "Plain-text answer"
}

Conversation:
${conversation || "USER: Give me an owner workspace tour."}
`.trim();
}

export function buildLocalOwnerAssistantReply({
  context,
  messages,
}: {
  context: OwnerAssistantContext;
  messages: OwnerAssistantMessage[];
}) {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
  const normalizedQuestion = lastUserMessage.toLowerCase();
  const currentGuide = findOwnerGuideByPath(context.pathname);

  if (!normalizedQuestion) {
    return buildOwnerAssistantWelcomeMessage(context);
  }

  if (
    containsAny(normalizedQuestion, ["welcome", "tour", "walkthrough", "owner workspace", "show me around"])
  ) {
    return buildOwnerAssistantWelcomeMessage(context);
  }

  if (containsAny(normalizedQuestion, ["this page", "current page", "what can i do here"])) {
    if (currentGuide) {
      return buildOwnerToolReply(currentGuide, `You are on ${formatOwnerToolLink(currentGuide)}.`);
    }

    return "You are in the owner workspace. Ask me about [Overview](/owner), [Workspaces](/owner/workspaces), [Recovery](/owner/recovery), [Insights](/owner/insights), or [Controls](/owner/controls).";
  }

  const matchedGuide = OWNER_DASHBOARD_ITEMS.find((item) =>
    containsAny(normalizedQuestion, item.keywords)
  );

  if (matchedGuide) {
    return buildOwnerToolReply(matchedGuide);
  }

  if (containsAny(normalizedQuestion, ["billing", "paystack", "payment", "monthly", "yearly"])) {
    return buildOwnerToolReply(
      OWNER_DASHBOARD_ITEMS.find((item) => item.path === "/owner/controls") ??
        OWNER_DASHBOARD_ITEMS[0],
      "Billing controls live in [Controls](/owner/controls)."
    );
  }

  if (containsAny(normalizedQuestion, ["delete workspace", "remove workspace", "tenant delete"])) {
    return [
      "Use [Workspaces](/owner/workspaces) for workspace removal.",
      "",
      "Step by step:",
      "1. Open the workspace registry and pick the company you want to inspect.",
      "2. Review the workspace spotlight details first so you confirm the correct tenant.",
      "3. Use the delete action and complete the confirmation checks before removing the workspace.",
    ].join("\n");
  }

  return [
    "I can help with [Overview](/owner), [Recovery](/owner/recovery), [Workspaces](/owner/workspaces), [Insights](/owner/insights), and [Controls](/owner/controls).",
    `You are currently on ${currentGuide ? formatOwnerToolLink(currentGuide) : "the owner workspace"}.`,
    "Try asking one focused question such as:",
    "- How do I turn on billing for a workspace?",
    "- How do I release features one by one?",
    "- How do I review tenant health here?",
  ].join("\n");
}

function buildOwnerToolReply(tool: OwnerToolGuide, intro?: string) {
  return [
    intro || `${formatOwnerToolLink(tool)} is where you ${tool.summary.charAt(0).toLowerCase()}${tool.summary.slice(1)}`,
    `Open page: ${formatOwnerToolLink(tool)}`,
    "",
    "Step by step:",
    ...tool.howToUse.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function findOwnerGuideByPath(pathname: string) {
  return (
    OWNER_DASHBOARD_ITEMS.filter((item) =>
      item.path === "/owner" ? pathname === item.path : pathname.startsWith(item.path)
    ).sort((left, right) => right.path.length - left.path.length)[0] ?? null
  );
}

function formatOwnerToolLink(tool: Pick<OwnerToolGuide, "name" | "path">) {
  return `[${tool.name}](${tool.path})`;
}

function getOwnerAssistantPageTip(pathname: string) {
  const guide = findOwnerGuideByPath(pathname);

  if (!guide) {
    return "Guide the owner to the right area based on whether they need billing, tenant management, recovery, or platform insight.";
  }

  return `Guide the owner through ${guide.name} using short, practical steps tied to ${formatOwnerToolLink(guide)}.`;
}

function containsAny(value: string, keywords: readonly string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}
