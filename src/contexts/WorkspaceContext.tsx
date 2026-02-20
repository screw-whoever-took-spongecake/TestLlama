import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Project } from '../types/testCase';

const LS_KEY = 'selectedWorkspaceId';

interface WorkspaceContextValue {
  workspaceId: number | null;
  setWorkspaceId: (id: number) => void;
  workspaces: Project[];
  loadingWorkspaces: boolean;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }): ReactElement {
  const [workspaces, setWorkspaces] = useState<Project[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspaceId, setWorkspaceIdState] = useState<number | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const res = await fetch('/service/projects');
      if (res.ok) {
        const data: Project[] = await res.json();
        const list = Array.isArray(data) ? data : [];
        setWorkspaces(list);
        // Restore or default to first workspace
        setWorkspaceIdState((prev) => {
          const stored = parseInt(localStorage.getItem(LS_KEY) ?? '', 10);
          if (!Number.isNaN(stored) && list.some((p) => p.id === stored)) return stored;
          if (prev !== null && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  function setWorkspaceId(id: number): void {
    localStorage.setItem(LS_KEY, String(id));
    setWorkspaceIdState(id);
  }

  return (
    <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId, workspaces, loadingWorkspaces, refreshWorkspaces }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
