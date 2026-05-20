export const WORKSPACE_SETTINGS_STORAGE_KEY = "briefboard:workspace-settings";
export const WORKSPACE_HEADER_NAME = "x-workspace-id";
export const DEFAULT_WORKSPACE_ID = "default";

export type WorkspaceSettings = {
  appName: string;
  organizationName: string;
  tagline: string;
  workspaceId: string;
  dashboardAccent: string;
  formAccent: string;
  logoDataUrl: string;
  formHeaderImageDataUrl: string;
};

export type WorkspacePublicSnapshot = Pick<
  WorkspaceSettings,
  | "appName"
  | "organizationName"
  | "tagline"
  | "workspaceId"
  | "dashboardAccent"
  | "formAccent"
  | "formHeaderImageDataUrl"
>;

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  appName: "Hiring Workspace OS",
  organizationName: "Your Company",
  tagline: "Secure multi-workspace recruiting, screening, and public hiring intake.",
  workspaceId: DEFAULT_WORKSPACE_ID,
  dashboardAccent: "#2563eb",
  formAccent: "#0f766e",
  logoDataUrl: "",
  formHeaderImageDataUrl: "",
};

export function buildDefaultWorkspaceSettings(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): WorkspaceSettings {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    workspaceId: normalizedWorkspaceId,
    organizationName:
      normalizedWorkspaceId === DEFAULT_WORKSPACE_ID
        ? DEFAULT_WORKSPACE_SETTINGS.organizationName
        : formatWorkspaceLabel(normalizedWorkspaceId),
  };
}

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const parsed = (value ?? {}) as Partial<WorkspaceSettings>;

  return {
    appName: normalizeLabel(parsed.appName, DEFAULT_WORKSPACE_SETTINGS.appName),
    organizationName: normalizeLabel(
      parsed.organizationName,
      DEFAULT_WORKSPACE_SETTINGS.organizationName
    ),
    tagline: normalizeLabel(parsed.tagline, DEFAULT_WORKSPACE_SETTINGS.tagline),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    dashboardAccent: DEFAULT_WORKSPACE_SETTINGS.dashboardAccent,
    formAccent: normalizeHexColor(parsed.formAccent, DEFAULT_WORKSPACE_SETTINGS.formAccent),
    logoDataUrl: normalizeLogoDataUrl(parsed.logoDataUrl),
    formHeaderImageDataUrl: normalizeImageDataUrl(parsed.formHeaderImageDataUrl, 800_000),
  };
}

export function sanitizeWorkspaceId(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_WORKSPACE_ID;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || DEFAULT_WORKSPACE_ID;
}

export function getWorkspacePublicSnapshot(
  settings: WorkspaceSettings
): WorkspacePublicSnapshot {
  return {
    appName: settings.appName,
    organizationName: settings.organizationName,
    tagline: settings.tagline,
    workspaceId: sanitizeWorkspaceId(settings.workspaceId),
    dashboardAccent: normalizeHexColor(
      settings.dashboardAccent,
      DEFAULT_WORKSPACE_SETTINGS.dashboardAccent
    ),
    formAccent: normalizeHexColor(
      settings.formAccent,
      DEFAULT_WORKSPACE_SETTINGS.formAccent
    ),
    formHeaderImageDataUrl: normalizeImageDataUrl(settings.formHeaderImageDataUrl, 800_000),
  };
}

export function buildWorkspaceApiHeaders(workspaceId: string) {
  return {
    [WORKSPACE_HEADER_NAME]: sanitizeWorkspaceId(workspaceId),
  };
}

export function appendWorkspaceQuery(path: string, workspaceId: string) {
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const [basePath, hash = ""] = path.split("#", 2);
  const [pathname, existingQuery = ""] = basePath.split("?", 2);
  const params = new URLSearchParams(existingQuery);

  params.set("workspace", normalizedWorkspaceId);

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function getWorkspaceIdFromRequest(request: Request) {
  const url = new URL(request.url);

  return sanitizeWorkspaceId(
    request.headers.get(WORKSPACE_HEADER_NAME) || url.searchParams.get("workspace")
  );
}

export function getWorkspaceStorageNamespaceFromWindow() {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_ID;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_SETTINGS_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_WORKSPACE_ID;
    }

    return parseWorkspaceSettings(JSON.parse(raw)).workspaceId;
  } catch {
    return DEFAULT_WORKSPACE_ID;
  }
}

export function getWorkspaceScopedStorageKey(baseKey: string, workspaceId: string) {
  return `${baseKey}:${sanitizeWorkspaceId(workspaceId)}`;
}

export function buildWorkspaceCssVariables(settings: WorkspaceSettings) {
  const dashboardScale = buildColorScale(settings.dashboardAccent);
  const formScale = buildColorScale(settings.formAccent);

  return {
    "--color-brand-25": dashboardScale[25],
    "--color-brand-50": dashboardScale[50],
    "--color-brand-100": dashboardScale[100],
    "--color-brand-200": dashboardScale[200],
    "--color-brand-300": dashboardScale[300],
    "--color-brand-400": dashboardScale[400],
    "--color-brand-500": dashboardScale[500],
    "--color-brand-600": dashboardScale[600],
    "--color-brand-700": dashboardScale[700],
    "--color-brand-800": dashboardScale[800],
    "--color-brand-900": dashboardScale[900],
    "--color-brand-950": dashboardScale[950],
    "--shadow-focus-ring": `0px 0px 0px 4px ${withAlpha(dashboardScale[500], 0.16)}`,
    "--workspace-form-accent": formScale[600],
    "--workspace-form-accent-text": getReadableTextColor(formScale[600]),
    "--workspace-form-accent-soft": withAlpha(formScale[500], 0.12),
    "--workspace-form-accent-muted": formScale[700],
    "--workspace-form-page": formScale[25],
    "--workspace-form-surface": formScale[50],
    "--workspace-form-surface-strong": formScale[100],
    "--workspace-form-border": formScale[200],
    "--workspace-form-border-soft": formScale[100],
    "--workspace-form-title": mixHex(formScale[950], "#111827", 0.2),
    "--workspace-form-muted": mixHex(formScale[900], "#667085", 0.62),
    "--workspace-form-muted-strong": mixHex(formScale[900], "#475467", 0.42),
    "--workspace-form-pill-bg": formScale[100],
    "--workspace-form-pill-text": formScale[700],
    "--workspace-form-success-bg": "#e6f4ea",
    "--workspace-form-success-text": "#137333",
    "--workspace-form-warning-bg": "#fef7e0",
    "--workspace-form-warning-text": "#8d5b00",
    "--workspace-form-danger-bg": "#fce8e6",
    "--workspace-form-danger-border": "#f4c7c3",
    "--workspace-form-danger-text": "#a50e0e",
    "--workspace-form-shadow-lg": `0 12px 40px ${withAlpha(formScale[700], 0.1)}`,
    "--workspace-form-shadow-md": `0 8px 30px ${withAlpha(formScale[700], 0.07)}`,
    "--workspace-form-shadow-sm": `0 8px 24px ${withAlpha(formScale[700], 0.06)}`,
  } satisfies Record<string, string>;
}

export function buildPublicFormTheme(formAccent: string) {
  const scale = buildColorScale(formAccent);
  const accentText = getReadableTextColor(scale[600]);

  return {
    accent: scale[600],
    accentHover: scale[700],
    accentText,
    accentSoft: scale[100],
    accentSoftHover: scale[200],
    page: scale[25],
    surface: scale[50],
    border: scale[200],
    borderSoft: scale[100],
    title: mixHex(scale[950], "#111827", 0.2),
    body: mixHex(scale[900], "#667085", 0.62),
    bodyStrong: mixHex(scale[900], "#475467", 0.42),
    successBg: "#e6f4ea",
    successText: "#137333",
    warningBg: "#fef7e0",
    warningText: "#8d5b00",
    dangerBg: "#fce8e6",
    dangerBorder: "#f4c7c3",
    dangerText: "#a50e0e",
    shadowLg: `0 12px 40px ${withAlpha(scale[700], 0.1)}`,
    shadowMd: `0 8px 30px ${withAlpha(scale[700], 0.07)}`,
    shadowSm: `0 8px 24px ${withAlpha(scale[700], 0.06)}`,
  };
}

type Shade = 25 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

function buildColorScale(baseHex: string): Record<Shade, string> {
  const normalized = normalizeHexColor(baseHex, "#2563eb");

  return {
    25: mixHex(normalized, "#ffffff", 0.94),
    50: mixHex(normalized, "#ffffff", 0.9),
    100: mixHex(normalized, "#ffffff", 0.78),
    200: mixHex(normalized, "#ffffff", 0.62),
    300: mixHex(normalized, "#ffffff", 0.42),
    400: mixHex(normalized, "#ffffff", 0.2),
    500: normalized,
    600: mixHex(normalized, "#000000", 0.12),
    700: mixHex(normalized, "#000000", 0.24),
    800: mixHex(normalized, "#000000", 0.38),
    900: mixHex(normalized, "#000000", 0.52),
    950: mixHex(normalized, "#000000", 0.68),
  };
}

function normalizeLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatWorkspaceLabel(workspaceId: string) {
  return workspaceId
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return fallback;
  }

  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function normalizeLogoDataUrl(value: unknown) {
  return normalizeImageDataUrl(value, 250_000);
}

function normalizeImageDataUrl(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    trimmed.length > maxLength ||
    !/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(trimmed)
  ) {
    return "";
  }

  return trimmed;
}

function mixHex(leftHex: string, rightHex: string, ratio: number) {
  const left = hexToRgb(leftHex);
  const right = hexToRgb(rightHex);
  const clampedRatio = clamp(ratio, 0, 1);

  return rgbToHex({
    red: Math.round(left.red * (1 - clampedRatio) + right.red * clampedRatio),
    green: Math.round(left.green * (1 - clampedRatio) + right.green * clampedRatio),
    blue: Math.round(left.blue * (1 - clampedRatio) + right.blue * clampedRatio),
  });
}

function withAlpha(hex: string, alpha: number) {
  const { red, green, blue } = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function getReadableTextColor(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.58 ? "#0f172a" : "#ffffff";
}

function rgbToHex({
  red,
  green,
  blue,
}: {
  red: number;
  green: number;
  blue: number;
}) {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
