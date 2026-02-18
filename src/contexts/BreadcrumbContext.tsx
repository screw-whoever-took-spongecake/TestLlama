import { createContext, useContext, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbContextValue {
  /** Override segments set by a child page (null = use AppLayout defaults). */
  override: BreadcrumbSegment[] | null;
  setOverride: (segments: BreadcrumbSegment[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  override: null,
  setOverride: () => undefined,
});

export function BreadcrumbProvider({ children }: { children: ReactNode }): ReactElement {
  const [override, setOverride] = useState<BreadcrumbSegment[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ override, setOverride }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb(): BreadcrumbContextValue {
  return useContext(BreadcrumbContext);
}
