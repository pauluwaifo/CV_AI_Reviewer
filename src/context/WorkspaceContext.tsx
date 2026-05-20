"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  buildWorkspaceCssVariables,
  DEFAULT_WORKSPACE_SETTINGS,
  parseWorkspaceSettings,
  type WorkspaceSettings,
  WORKSPACE_SETTINGS_STORAGE_KEY,
} from "@/lib/workspace-settings";

type WorkspaceContextType = {
  settings: WorkspaceSettings;
  updateSettings: (updates: Partial<WorkspaceSettings>) => void;
  replaceSettings: (nextSettings: WorkspaceSettings) => void;
  resetSettings: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({
  children,
  initialSettings = DEFAULT_WORKSPACE_SETTINGS,
}: {
  children: ReactNode;
  initialSettings?: WorkspaceSettings;
}) {
  const parsedInitialSettings = useMemo(
    () => parseWorkspaceSettings(initialSettings),
    [initialSettings]
  );
  const [settings, setSettings] = useState<WorkspaceSettings>(parsedInitialSettings);

  useEffect(() => {
    setSettings(parsedInitialSettings);
  }, [parsedInitialSettings]);

  useEffect(() => {
    window.localStorage.setItem(
      WORKSPACE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );

    const variables = buildWorkspaceCssVariables(settings);

    for (const [name, value] of Object.entries(variables)) {
      document.documentElement.style.setProperty(name, value);
    }

    document.documentElement.dataset.workspaceId = settings.workspaceId;
  }, [settings]);

  const value = useMemo<WorkspaceContextType>(
    () => ({
      settings,
      updateSettings: (updates) => {
        setSettings((current) => parseWorkspaceSettings({ ...current, ...updates }));
      },
      replaceSettings: (nextSettings) => {
        setSettings(parseWorkspaceSettings(nextSettings));
      },
      resetSettings: () => {
        setSettings(parsedInitialSettings);
      },
    }),
    [parsedInitialSettings, settings]
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return context;
}
