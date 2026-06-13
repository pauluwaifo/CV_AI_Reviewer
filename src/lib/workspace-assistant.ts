import type { AnalysisProvider } from "@/types/document-intelligence";

import {
  WORKSPACE_FEATURE_MODULES,
  type WorkspaceFeatureKey,
} from "@/lib/workspace-controls";

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
  key: string;
  name: string;
  path: string;
  summary: string;
  howToUse: string[];
  adminOnly?: boolean;
  keywords: string[];
};

type WorkspaceToolGuideOverride = {
  summary: string;
  howToUse: string[];
  keywords: string[];
  adminOnly?: boolean;
};

const WORKSPACE_TOOL_GUIDE_OVERRIDES: Partial<
  Record<WorkspaceFeatureKey, WorkspaceToolGuideOverride>
> = {
  screen_cv: {
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
  results: {
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
  analytics: {
    summary:
      "Track submission volume, stage movement, interview activity, and workspace health trends from one analytics surface.",
    howToUse: [
      "Open Analytics to review the current workspace hiring trend lines.",
      "Use the charts and summaries to spot conversion, stage delays, and interview patterns.",
      "Return here when you need performance context before changing forms, screening, or follow-up flow.",
    ],
    keywords: ["analytics", "metrics", "reports", "dashboard", "trends", "performance"],
  },
  operations: {
    summary:
      "Work through overdue follow-ups, interviews due soon, stale reviews, and other recruiter actions that need attention.",
    howToUse: [
      "Open Operations to see the current action queue.",
      "Use the grouped cards to find overdue reminders, upcoming interviews, and stale candidates fast.",
      "Open the linked candidate or pipeline view directly from the queue to clear the task.",
    ],
    keywords: ["operations", "queue", "follow up", "follow-up", "reminders", "stale review"],
  },
  audit_log: {
    summary:
      "Review access, workflow, billing, and integration activity across the workspace with filters and export support.",
    howToUse: [
      "Open Audit Log to review what changed in the workspace.",
      "Use the filters to focus on access, workflow, billing, integration, or deletion activity.",
      "Export the current list when you need a compliance or investigation trail.",
    ],
    keywords: ["audit", "audit log", "activity log", "compliance", "history", "export log"],
  },
  pipeline: {
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
  personality_assessment: {
    summary:
      "Review a candidate's work-style pattern through bright side traits, derailers, and values so you can plan a sharper follow-up interview.",
    howToUse: [
      "Open Personality Assessment and choose the role lens that matches the candidate.",
      "Review the bright side, derailers, and values panels as you score the profile.",
      "Use the fit meter, summary, and interview prompts to guide the next conversation.",
    ],
    keywords: [
      "personality",
      "assessment",
      "work style",
      "derailers",
      "values",
      "traits",
      "fit meter",
    ],
  },
  candidate_mail: {
    summary:
      "Compose rejection and follow-up emails, request approval, and send candidate communication from one shared workspace flow.",
    howToUse: [
      "Open Candidate Mail and choose the form plus candidate you want to contact.",
      "Generate or edit a rejection or follow-up draft, then review the final subject and body.",
      "Approve and send it inside the workspace, or route it through the approval flow first.",
    ],
    keywords: [
      "candidate mail",
      "candidate email",
      "follow up email",
      "rejection email",
      "approval flow",
      "email draft",
    ],
  },
  workspace_settings: {
    summary:
      "Control branding, invite team members, connect a workspace inbox, and manage shared access and security settings.",
    howToUse: [
      "Use General to update company details, product branding, and public form styling.",
      "Use Team to manage members and connect the workspace sender email.",
      "Use Integrations and Security for webhooks, Slack, shared access, and workspace lifecycle controls.",
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
    adminOnly: true,
  },
};

const EXTRA_WORKSPACE_TOOL_GUIDES: WorkspaceToolGuide[] = [
  {
    key: "billing",
    name: "Workspace Billing",
    path: "/billing",
    summary:
      "Review billing status, choose a payment cycle, and pay or upgrade workspace access from the built-in billing page.",
    howToUse: [
      "Open Workspace Billing to review the current plan and payment status.",
      "Choose the monthly or yearly cycle that fits your workspace before checkout.",
      "Use the secure checkout flow to pay or upgrade when billing is active for your workspace.",
    ],
    keywords: ["billing", "subscription", "payment", "upgrade", "plan", "checkout"],
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
  return (
    findWorkspaceGuideByPath(pathname, "member")?.name ??
    findWorkspaceGuideByPath(pathname, "admin")?.name ??
    "Workspace"
  );
}

export function getWorkspaceAssistantQuickPrompts(context: WorkspaceAssistantContext) {
  const currentGuide = findWorkspaceGuideByPath(context.pathname, context.role);
  const prompts = ["Give me a quick workspace tour"];

  if (!currentGuide) {
    prompts.push("How do I screen a CV?", "How do I use Hiring Pipeline?");

    if (context.role === "admin") {
      prompts.push("How do Workspace Settings work?");
    }

    return prompts.slice(0, 4);
  }

  if (currentGuide.path === "/upload") {
    prompts.push(
      "How do I screen a CV here?",
      "What should I upload first?",
      "Where do I see the screening result after this?"
    );
    return prompts;
  }

  if (currentGuide.path === "/results") {
    prompts.push(
      "How do I use the saved results here?",
      "How do I compare past screenings?",
      "What should I review before moving a candidate forward?"
    );
    return prompts;
  }

  if (currentGuide.path === "/pipeline") {
    prompts.push(
      "How do I use Hiring Pipeline?",
      "Help me generate a JD here",
      "How do I publish a hiring form?"
    );
    return prompts;
  }

  if (currentGuide.path === "/candidate-mail") {
    prompts.push(
      "How do I send a rejection email from here?",
      "How do approvals work in Candidate Mail?",
      "How do I draft a follow-up email?"
    );
    return prompts;
  }

  if (currentGuide.path === "/analytics") {
    prompts.push(
      "What should I watch in Analytics?",
      "How do I read the workspace trends here?",
      "How do operations and analytics connect?"
    );
    return prompts;
  }

  if (currentGuide.path === "/operations") {
    prompts.push(
      "How do I clear the operations queue?",
      "What does overdue follow-up mean here?",
      "How do I jump from this queue back into the pipeline?"
    );
    return prompts;
  }

  if (currentGuide.path === "/audit") {
    prompts.push(
      "How do I use Audit Log filters?",
      "What kind of activity is recorded here?",
      "How do I export the audit trail?"
    );
    return prompts;
  }

  if (currentGuide.path === "/billing") {
    prompts.push(
      "How does workspace billing work?",
      "How do I choose monthly or yearly billing?",
      "When do upgrade options appear?"
    );
    return prompts;
  }

  if (currentGuide.path === "/workspace" && context.role === "admin") {
    prompts.push(
      "How do Workspace Settings work?",
      "How do I invite a teammate from here?",
      "How do I connect the workspace email?"
    );
    return prompts;
  }

  prompts.push(
    `How do I use ${currentGuide.name}?`,
    `What should I do on ${currentGuide.name}?`,
    "What next step do you recommend here?"
  );

  return prompts.slice(0, 4);
}

export function buildWorkspaceAssistantWelcomeMessage(context: WorkspaceAssistantContext) {
  const firstName = getWorkspaceAssistantOrganizationFirstName(context.organizationName);
  const tools = getVisibleWorkspaceToolGuides(context.role);

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
  const visibleTools = getVisibleWorkspaceToolGuides(context.role);
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
- Candidate Mail is where users draft recruiter emails, request approval, and send candidate communication.
- Analytics, Operations, Audit Log, and Billing are shared workspace pages with their own routes and should be linked when relevant.
- Workspace Settings is admin-only and covers branding, team access, sender email connection, integrations, and security controls.
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
  const visibleTools = getVisibleWorkspaceToolGuides(context.role);
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
      "shortlist batch",
      "bulk screening",
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
    const currentTool = findWorkspaceGuideByPath(context.pathname, context.role);

    if (currentTool) {
      return buildToolReply(currentTool, context.role, {
        intro: `You are on ${formatToolLink(currentTool)}.`,
      });
    }

    return `You are currently on ${pageLabel}. Ask me about ${visibleTools
      .map((tool) => formatToolLink(tool))
      .join(", ")} and I will walk you through the steps.`;
  }

  const matchedTool = visibleTools.find((tool) => containsAny(normalizedQuestion, tool.keywords));

  if (matchedTool) {
    return buildToolReply(matchedTool, context.role);
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
      "1. New workspace sign-up sends a 6-digit code to the admin email before the workspace is created.",
      "2. Workspace sign-in checks the access key first, then sends a second 6-digit code before the session opens.",
      "3. If a code expires or fails, you can request a fresh one from the same screen.",
    ].join("\n");
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
      "If you need branding, team access, sender email, or shared security changes, ask a workspace admin to open that area for you.",
    ].join("\n");
  }

  const currentTool = findWorkspaceGuideByPath(context.pathname, context.role);

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

function getVisibleWorkspaceToolGuides(role: WorkspaceAssistantRole) {
  return getWorkspaceToolGuides().filter((tool) => !tool.adminOnly || role === "admin");
}

function getWorkspaceToolGuides(): WorkspaceToolGuide[] {
  const moduleGuides = WORKSPACE_FEATURE_MODULES.filter((module) => module.path).map((module) => {
    const override = WORKSPACE_TOOL_GUIDE_OVERRIDES[module.key];

    return {
      key: module.key,
      name: module.label,
      path: module.path,
      summary: override?.summary ?? module.description,
      howToUse:
        override?.howToUse ??
        buildDefaultHowToUse(module.label, module.path, module.description),
      keywords: uniqueKeywords([
        ...(override?.keywords ?? []),
        ...buildDefaultKeywords(module.label, module.path, module.description),
      ]),
      adminOnly: override?.adminOnly,
    };
  });

  return [...moduleGuides, ...EXTRA_WORKSPACE_TOOL_GUIDES];
}

function findWorkspaceGuideByPath(pathname: string, role: WorkspaceAssistantRole) {
  return getVisibleWorkspaceToolGuides(role)
    .filter((tool) => pathname === tool.path || pathname.startsWith(`${tool.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0] ?? null;
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
  const currentTool = findWorkspaceGuideByPath(context.pathname, context.role);

  if (!currentTool) {
    return "Guide the user to the right workspace tool based on what they want to do next.";
  }

  if (currentTool.path === "/workspace" && context.role !== "admin") {
    return "Explain that this area is limited to workspace admins.";
  }

  return `Guide the user through ${currentTool.name} using short, practical steps tied to what they can do on ${formatToolLink(
    currentTool
  )} right now.`;
}

function buildDefaultHowToUse(label: string, path: string, description: string) {
  return [
    `Open ${label} from ${formatPathForHumans(path)}.`,
    `Use this area to ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
    `Return here whenever you want to work on ${label.toLowerCase()} again.`,
  ];
}

function buildDefaultKeywords(label: string, path: string, description: string) {
  const combined = `${label} ${path.replaceAll("/", " ")} ${description}`.toLowerCase();

  return combined
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function formatPathForHumans(path: string) {
  return path === "/" ? "the home page" : path;
}

function uniqueKeywords(keywords: string[]) {
  return [...new Set(keywords.map((keyword) => keyword.toLowerCase()).filter(Boolean))];
}
