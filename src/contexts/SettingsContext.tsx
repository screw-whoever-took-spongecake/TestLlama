import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface AppSettings {
  jiraBaseUrl: string;
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<AppSettings>({ jiraBaseUrl: '' });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/service/settings');
      if (res.ok) {
        const data: AppSettings = await res.json();
        setSettings(data);
      }
    } catch {
      // non-fatal; fall back to defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const next = { ...settings, ...patch };
    const res = await fetch('/service/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Failed to save settings');
    }
    const saved: AppSettings = await res.json();
    setSettings(saved);
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
