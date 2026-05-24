import type { AnalysisProvider } from "@/types/document-intelligence";

export type WorkspaceAssistantRole = "admin" | "member";

export type WorkspaceAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkspaceAssistantContext = {
  appName: string;
  organizationName: string;
  role: WorkspaceAssistantRole;
  pathname: string;
};

type WorkspaceToolGuide = {
  name: string;
  path: string;
  summary: string;
  howToUse: string[];
  adminOnly?: boolean;
  keywords: string[];
};

const WORKSPACE_TOOL_GUIDES: WorkspaceToolGuide[] = [
  {
    name: "Screen CV",
    path: "/upload",
    summary:
      "Upload a CV or document, add role context, and get an evidence-led screening with score rationale, strengths, risks, and interview prompts.",
    howToUse: [
      "Open Screen CV and upload the candidate file.",
      "Add the job description or role setup so the screening has the right benchmark.",
      "Review the score, role-match criteria, highlights, red flags, and recommended next steps.",
    ],
    keywords: [
      "screen",
      "cv",
      "resume",
      "upload",
      "candidate review",
      "analysis",
      "screening result",
    ],
  },
  {
    name: "Results",
    path: "/results",
    summary:
      "Reopen saved screenings, compare candidate evidence, and keep recruiter feedback inside the shared workspace history.",
    howToUse: [
      "Open Results to revisit completed screenings.",
      "Use the saved analysis to compare fit, check evidence, and update notes before moving candidates forward.",
      "Return here whenever you want to reopen a past review instead of screening the file again.",
    ],
    keywords: [
      "results",
      "screening results",
      "saved screenings",
      "history",
      "notes",
      "compare",
      "past screenings",
    ],
  },
  {
    name: "Hiring Pipeline",
    path: "/pipeline",
    summary:
      "Create hiring forms, generate job descriptions or form drafts with AI, collect submissions, and review applicants in one pipeline.",
    howToUse: [
      "Create or open a form in the pipeline.",
      "Use the builder, AI form draft, or AI JD generator to shape the role intake experience.",
      "Publish the form, collect applications, and review submissions from the candidate response area.",
    ],
    keywords: [
      "pipeline",
      "form",
      "job description",
      "jd",
      "applications",
      "submissions",
      "publish",
      "generate form",
      "generate jd",
    ],
  },
  {
    name: "Workspace Settings",
    path: "/workspace",
    adminOnly: true,
    summary:
      "Control branding, invite team members, connect a workspace inbox, and manage shared access and security settings.",
    howToUse: [
      "Update the company name, product name, colors, and public-facing branding.",
      "Invite teammates, manage member access, and connect the workspace email sender.",
      "Use the security area for shared key changes, workspace cleanup, and other admin controls.",
    ],
    keywords: [
      "workspace",
      "settings",
      "branding",
      "invite",
      "members",
      "email",
      "access key",
      "security",
      "connect inbox",
      "workspace email",
    ],
  },
];

export function getWorkspaceAssistantOrganizationFirstName(organizationName: string) {
  const normalized = organizationName.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "there";
  }

  return normalized.split(" ")[0] || "there";
}

export function getWorkspaceAssistantPageLabel(pathname: string) {
  if (pathname.startsWith("/upload")) {
    return "Screen CV";
  }

  if (pathname.startsWith("/results")) {
    return "Results";
  }

  if (pathname.startsWith("/pipeline")) {
    return "Hiring Pipeline";
  }

  if (pathname.startsWith("/workspace")) {
    return "Workspace Settings";
  }

  return "Workspace";
}

export function getWorkspaceAssistantQuickPrompts(context: WorkspaceAssistantContext) {
  const prompts = ["Give me a quick workspace tour"];

  if (context.pathname.startsWith("/upload")) {
    prompts.push(
      "How do I screen a CV here?",
      "What should I upload first?",
      "Where do I see the screening result after this?"
    );
    return prompts;
  }

  if (context.pathname.startsWith("/results")) {
    prompts.push(
      "How do I use the saved results here?",
      "How do I compare past screenings?",
      "What should I review before moving a candidate forward?"
    );
    return prompts;
  }

  if (context.pathname.startsWith("/pipeline")) {
    prompts.push(
      "How do I use Hiring Pipeline?",
      "Help me generate a JD here",
      "How do I publish a hiring form?"
    );
    return prompts;
  }

  if (context.pathname.startsWith("/workspace") && context.role === "admin") {
    prompts.push(
      "How do Workspace Settings work?",
      "How do I invite a teammate from here?",
      "How do I connect the workspace email?"
    );
    return prompts;
  }

  prompts.push("What does Screen CV do?", "How do I use Hiring Pipeline?");

  if (context.role === "admin") {
    prompts.push("How do Workspace Settings work?");
  } else {
    prompts.push(`What can I do on ${getWorkspaceAssistantPageLabel(context.pathname)}?`);
  }

  return prompts.slice(0, 4);
}

export function buildWorkspaceAssistantWelcomeMessage(context: WorkspaceAssistantContext) {
  const firstName = getWorkspaceAssistantOrganizationFirstName(context.organizationName);
  const tools = getVisibleToolGuides(context.role);

  return [
    `Hi ${firstName}, welcome to ${context.appName}.`,
    "",
    "Here is your quick workspace map:",
    ...tools.map((tool) => `- ${formatToolLink(tool)}: ${tool.summary}`),
    "",
    'Ask me things like "How do I screen a CV?", "How do I publish a hiring form?", or "What can I do on this page?"',
  ].join("\n");
}

export function buildWorkspaceAssistantSystemPrompt({
  context,
  messages,
  provider = "auto",
}: {
  context: WorkspaceAssistantContext;
  messages: WorkspaceAssistantMessage[];
  provider?: AnalysisProvider;
}) {
  const visibleTools = getVisibleToolGuides(context.role);
  const currentPage = getWorkspaceAssistantPageLabel(context.pathname);
  const pageActionTip = getWorkspaceAssistantPageActionTip(context);
  const conversation = messages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
    .join("\n\n");

  return `
You are the in-product workspace assistant for ${context.appName}.

Organization: ${context.organizationName}
User role: ${context.role}
Current page: ${currentPage}
AI preference: ${provider}

You help users understand the workspace, navigate tools, and complete tasks inside this hiring product.

Available tools:
${visibleTools
  .map(
    (tool) => `- ${tool.name} (${tool.path})
  Summary: ${tool.summary}
  How to use:
  ${tool.howToUse.map((step) => `- ${step}`).join("\n  ")}`
  )
  .join("\n")}

Product behavior notes:
- Screen CV is where users upload candidate files and run AI screening.
- Results is where users revisit saved screening results and recruiter notes.
- Hiring Pipeline is where users build forms, generate job descriptions or form drafts with AI, publish application flows, and review applicants.
- Workspace Settings is admin-only and covers branding, team access, sender email connection, and security controls.
- The workspace bot can also accept one CV or a shortlist batch, run screening for the user, and open the saved result page automatically.
- Sign-up now uses email verification before workspace creation.
- Sign-in now uses a 6-digit second-factor code after the access key is accepted.
- Workspace invite emails can come from a connected workspace inbox or a global fallback sender.
- Current page help focus: ${pageActionTip}

Response rules:
- Be warm, clear, and product-specific.
- Answer app and workflow questions directly.
- Whenever you reference a product page or tool, include a markdown link like [Hiring Pipeline](/pipeline).
- When a user asks how to use a tool, explain it as a short intro followed by 2 to 5 numbered practical steps.
- When the user asks about screening, CV review, or how to analyze a candidate, finish by offering to do the screening for them if they attach the CV or shortlist in this chat.
- When the current page matters, anchor the answer to what the user can do right here.
- Mention role limits when relevant. Do not tell members they can use admin-only tools.
- If the question is unrelated to this app, politely steer the conversation back to the workspace and hiring tools.
- Keep replies concise but useful.
- Return strict JSON only in this shape:
{
  "reply": "Plain-text answer"
}

Conversation:
${conversation || "USER: Give me a workspace welcome and walkthrough."}
`.trim();
}

export function buildLocalWorkspaceAssistantReply({
  context,
  messages,
}: {
  context: WorkspaceAssistantContext;
  messages: WorkspaceAssistantMessage[];
}) {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
  const normalizedQuestion = lastUserMessage.toLowerCase();
  const visibleTools = getVisibleToolGuides(context.role);
  const pageLabel = getWorkspaceAssistantPageLabel(context.pathname);

  if (!normalizedQuestion) {
    return buildWorkspaceAssistantWelcomeMessage(context);
  }

  if (
    containsAny(normalizedQuestion, [
      "welcome",
      "tour",
      "walkthrough",
      "show me around",
      "what does this app do",
    ])
  ) {
    return buildWorkspaceAssistantWelcomeMessage(context);
  }

  if (
    containsAny(normalizedQuestion, [
      "attach a cv",
      "screen for me",
      "screen this for me",
      "use the bot to screen",
      "bot screen",
      "attachment",
      "attached cv",
    ])
  ) {
    return [
      "Yes. You can attach one CV or a shortlist batch directly in this bot and let it run the screening for you.",
      "",
      "Step by step:",
      "1. Click the file button beside the chat input and attach one CV or several CVs.",
      "2. I will ask what role or hiring goal you want the screening to use.",
      "3. I will ask what skills, priorities, or red flags I should use while screening.",
      "4. After you answer, I will run the analysis using the same screening engine as [Screen CV](/upload).",
      "5. When the analysis finishes, you will be routed straight to [Results](/results), and batch runs will open as a grouped review.",
    ].join("\n");
  }

  if (
    containsAny(normalizedQuestion, [
      "this page",
      "current page",
      "where am i",
      "what can i do here",
    ])
  ) {
    const currentTool = visibleTools.find((tool) => tool.name === pageLabel);

    if (currentTool) {
      return buildToolReply(currentTool, context.role, {
        intro: `You are on ${formatToolLink(currentTool)}.`,
      });
    }

    return `You are currently on ${pageLabel}. Ask me about ${visibleTools
      .map((tool) => formatToolLink(tool))
      .join(", ")} and I will walk you through the steps.`;
  }

  for (const tool of visibleTools) {
    if (containsAny(normalizedQuestion, tool.keywords)) {
      return buildToolReply(tool, context.role);
    }
  }

  if (
    containsAny(normalizedQuestion, [
      "2fa",
      "two factor",
      "verification code",
      "signin code",
      "sign in code",
      "email verification",
    ])
  ) {
    return [
      "Here is how secure access now works:",
      "- New workspace sign-up sends a 6-digit code to the admin email before the workspace is created.",
      "- Workspace sign-in checks the access key first, then sends a second 6-digit code before the session opens.",
      "- If a code expires or fails, you can request a fresh one from the same screen.",
    ].join("\n");
  }

  if (
    context.role === "admin" &&
    containsAny(normalizedQuestion, [
      "invite",
      "team member",
      "member access",
      "workspace email",
      "company inbox",
      "branding",
    ])
  ) {
    const settingsTool = visibleTools.find((tool) => tool.name === "Workspace Settings");

    if (settingsTool) {
      return buildToolReply(settingsTool, context.role, {
        intro: `That task lives in ${formatToolLink(settingsTool)}, where admins control branding, invites, sender email, and security.`,
      });
    }
  }

  if (
    context.role !== "admin" &&
    containsAny(normalizedQuestion, [
      "workspace settings",
      "branding",
      "invite",
      "members",
      "workspace email",
      "access key",
      "security settings",
    ])
  ) {
    return [
      "Those controls live in [Workspace Settings](/workspace) and are limited to workspace admins.",
      "If you need branding, team access, sender email, or shared security changes, ask a workspace admin to open that area for you step by step.",
    ].join("\n");
  }

  const currentTool = visibleTools.find((tool) => tool.name === pageLabel);

  return [
    `I can help with ${visibleTools.map((tool) => formatToolLink(tool)).join(", ")}.`,
    `You are currently on ${currentTool ? formatToolLink(currentTool) : pageLabel}.`,
    "Try asking one focused question such as:",
    `- What does ${currentTool ? formatToolLink(currentTool) : pageLabel} do?`,
    "- How do I screen a CV?",
    "- How do I publish a hiring form?",
    context.role === "admin"
      ? "- How do Workspace Settings work?"
      : "- How do I use Results?",
  ].join("\n");
}

function getVisibleToolGuides(role: WorkspaceAssistantRole) {
  return WORKSPACE_TOOL_GUIDES.filter((tool) => !tool.adminOnly || role === "admin");
}

function buildToolReply(
  tool: WorkspaceToolGuide,
  role: WorkspaceAssistantRole,
  options?: { intro?: string }
) {
  const lines = [
    options?.intro ||
      `${formatToolLink(tool)} is where you ${tool.summary.charAt(0).toLowerCase()}${tool.summary.slice(1)}`,
    `Open page: ${formatToolLink(tool)}`,
    "",
    "Step by step:",
    ...tool.howToUse.map((step, index) => `${index + 1}. ${linkToolNameInText(step, tool)}`),
  ];

  if (tool.adminOnly && role !== "admin") {
    lines.push("", "You need admin access for this area.");
  }

  if (tool.path === "/upload") {
    lines.push(
      "",
      "If you want, attach the candidate CV in this chat and I can ask for the role and screening priorities, then run the screening for you and open the saved [Results](/results) page automatically."
    );
  }

  return lines.join("\n");
}

function containsAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatToolLink(tool: Pick<WorkspaceToolGuide, "name" | "path">) {
  return `[${tool.name}](${tool.path})`;
}

function linkToolNameInText(text: string, tool: Pick<WorkspaceToolGuide, "name" | "path">) {
  return text.includes(tool.name) ? text.replace(tool.name, formatToolLink(tool)) : text;
}

function getWorkspaceAssistantPageActionTip(context: WorkspaceAssistantContext) {
  if (context.pathname.startsWith("/upload")) {
    return "Guide the user through uploading a candidate file, adding role context, and knowing where the screening result appears next.";
  }

  if (context.pathname.startsWith("/results")) {
    return "Guide the user through reviewing saved screenings, comparing evidence, and deciding what to revisit or move forward.";
  }

  if (context.pathname.startsWith("/pipeline")) {
    return "Guide the user through creating forms, generating a JD or form draft with AI, publishing the form, and reviewing candidate submissions.";
  }

  if (context.pathname.startsWith("/workspace")) {
    return context.role === "admin"
      ? "Guide the user through branding, member invites, workspace email connection, and shared security controls."
      : "Explain that this area is limited to workspace admins.";
  }

  return "Guide the user to the right workspace tool based on what they want to do next.";
}
