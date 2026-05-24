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
import {
  parseWorkspaceControlSettings,
  type WorkspaceControlSettings,
} from "@/lib/workspace-controls";

type WorkspaceContextType = {
  settings: WorkspaceSettings;
  controls: WorkspaceControlSettings;
  updateSettings: (updates: Partial<WorkspaceSettings>) => void;
  replaceSettings: (nextSettings: WorkspaceSettings) => void;
  resetSettings: () => void;
  updateControls: (updates: Partial<WorkspaceControlSettings>) => void;
  replaceControls: (nextControls: WorkspaceControlSettings) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({
  children,
  initialSettings = DEFAULT_WORKSPACE_SETTINGS,
  initialControls,
}: {
  children: ReactNode;
  initialSettings?: WorkspaceSettings;
  initialControls?: WorkspaceControlSettings;
}) {
  const parsedInitialSettings = useMemo(
    () => parseWorkspaceSettings(initialSettings),
    [initialSettings]
  );
  const parsedInitialControls = useMemo(
    () =>
      parseWorkspaceControlSettings(
        initialControls,
        initialSettings?.workspaceId ?? DEFAULT_WORKSPACE_SETTINGS.workspaceId
      ),
    [initialControls, initialSettings?.workspaceId]
  );
  const [settings, setSettings] = useState<WorkspaceSettings>(parsedInitialSettings);
  const [controls, setControls] = useState<WorkspaceControlSettings>(parsedInitialControls);

  useEffect(() => {
    setSettings(parsedInitialSettings);
  }, [parsedInitialSettings]);

  useEffect(() => {
    setControls(parsedInitialControls);
  }, [parsedInitialControls]);

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
      controls,
      updateSettings: (updates) => {
        setSettings((current) => parseWorkspaceSettings({ ...current, ...updates }));
      },
      replaceSettings: (nextSettings) => {
        setSettings(parseWorkspaceSettings(nextSettings));
      },
      resetSettings: () => {
        setSettings(parsedInitialSettings);
      },
      updateControls: (updates) => {
        setControls((current) =>
          parseWorkspaceControlSettings(
            {
              ...current,
              ...updates,
              modules: {
                ...current.modules,
                ...(updates.modules ?? {}),
              },
              billing: {
                ...current.billing,
                ...(updates.billing ?? {}),
              },
              workspaceId: current.workspaceId,
            },
            current.workspaceId
          )
        );
      },
      replaceControls: (nextControls) => {
        setControls(
          parseWorkspaceControlSettings(
            nextControls,
            nextControls.workspaceId || settings.workspaceId
          )
        );
      },
    }),
    [controls, parsedInitialSettings, settings]
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
