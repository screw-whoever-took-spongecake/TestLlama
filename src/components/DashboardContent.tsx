import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { TabId } from './Sidebar';
import Home from '../pages/Home';
import TestCases from '../pages/TestCases';
import TestRuns from '../pages/TestRuns';
import Results from '../pages/Results';
import Settings from '../pages/Settings';
import type { ComponentType } from 'react';

const PAGES: Record<TabId, ComponentType> = {
  home: Home,
  'test-cases': TestCases,
  'test-runs': TestRuns,
  results: Results,
  settings: Settings,
};

export interface DashboardOutletContext {
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
}

export default function DashboardContent(): ReactElement {
  const { activeTab } = useOutletContext<DashboardOutletContext>();
  const PageContent = PAGES[activeTab];
  return <PageContent />;
}
