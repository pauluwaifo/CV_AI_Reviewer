export const OWNER_DASHBOARD_ITEMS = [
  {
    name: "Overview",
    description: "Platform summary",
    path: "/owner",
    summary:
      "Review platform totals, workspace growth, billing coverage, and the main health signals across every company.",
    howToUse: [
      "Open Overview to see the overall state of the platform in one place.",
      "Use the summary cards to spot billing, workspace activity, and high-level health changes.",
      "Jump from here into workspaces, recovery, controls, or insights depending on what needs attention next.",
    ],
    keywords: ["overview", "summary", "dashboard", "platform", "health", "status"],
  },
  {
    name: "Recovery",
    description: "Reset queue",
    path: "/owner/recovery",
    summary:
      "Handle workspace key resets, review recovery requests, and manage manual access recovery from one owner-only queue.",
    howToUse: [
      "Open Recovery to review access-key reset activity.",
      "Choose the workspace that needs help and issue a new shared key when needed.",
      "Use this page whenever a company loses access or needs a controlled reset.",
    ],
    keywords: ["recovery", "reset", "access key", "recovery queue", "shared key"],
  },
  {
    name: "Workspaces",
    description: "Tenant registry",
    path: "/owner/workspaces",
    summary:
      "Search every workspace, inspect tenant health, open spotlight details, and take owner-only actions across the registry.",
    howToUse: [
      "Open Workspaces to search and filter the full tenant list.",
      "Select a company to inspect contact coverage, activity, billing, and owner notes.",
      "Use the spotlight actions when you need to reset access or remove a workspace.",
    ],
    keywords: ["workspaces", "tenants", "registry", "companies", "tenant list"],
  },
  {
    name: "Insights",
    description: "Health and activity",
    path: "/owner/insights",
    summary:
      "Track cross-workspace activity, attention flags, and platform performance trends that need owner review.",
    howToUse: [
      "Open Insights to review platform-wide activity and risk patterns.",
      "Use the trends to see which workspaces are active, stalled, or need follow-up.",
      "Work from here when you want a high-level operational view before opening a specific workspace.",
    ],
    keywords: ["insights", "activity", "trends", "metrics", "health", "analytics"],
  },
  {
    name: "Controls",
    description: "Billing and release",
    path: "/owner/controls",
    summary:
      "Decide which modules are open, owner-locked, or paid, and configure workspace billing plan availability.",
    howToUse: [
      "Open Controls and pick the workspace you want to manage.",
      "Use the billing section to turn charging on, set prices, and shape upgrade tiers.",
      "Use the feature access section to release modules one by one or lock them behind billing.",
    ],
    keywords: ["controls", "billing", "release", "features", "module access", "paywall"],
  },
] as const;

export type OwnerDashboardItem = (typeof OWNER_DASHBOARD_ITEMS)[number];
