import { useState } from 'react';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Banner from './Banner';
import Sidebar from './Sidebar';
import type { TabId } from './Sidebar';
import { ToastProvider } from './Toast';
import { SettingsProvider } from '../contexts/SettingsContext';
import { BreadcrumbProvider, useBreadcrumb } from '../contexts/BreadcrumbContext';
import type { BreadcrumbSegment } from '../contexts/BreadcrumbContext';

const TAB_LABELS: Record<TabId, string> = {
  'home': 'Home',
  'test-cases': 'Test Cases',
  'test-runs': 'Test Runs',
  'results': 'Results',
  'settings': 'Settings',
};

function AppLayoutInner(): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const location = useLocation();
  const navigate = useNavigate();
  const { override } = useBreadcrumb();

  const isTestCaseFormRoute = location.pathname.startsWith('/service/testcase/');
  const isTestRunFormRoute = location.pathname.startsWith('/service/testrun/');
  const effectiveActiveTab: TabId =
    isTestCaseFormRoute ? 'test-cases' :
    isTestRunFormRoute  ? 'test-runs'  : activeTab;

  function handleSelectTab(id: TabId): void {
    setActiveTab(id);
    if (!sidebarOpen) setSidebarOpen(true);
    if (location.pathname !== '/') navigate('/');
  }

  // Default breadcrumb: just the active tab label. Form pages override this.
  const defaultSegments: BreadcrumbSegment[] = [
    { label: TAB_LABELS[effectiveActiveTab] },
  ];
  const breadcrumbSegments = override ?? defaultSegments;

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        activeTab={effectiveActiveTab}
        onSelectTab={handleSelectTab}
      />
      <Banner segments={breadcrumbSegments} />
      <main className="main">
        <Outlet context={{ activeTab, setActiveTab }} />
      </main>
    </div>
  );
}

/**
 * Persistent layout: sidebar (top, always visible) + banner + main content.
 * Wraps all routes so the sidebar is usable on every page.
 */
export default function AppLayout(): ReactElement {
  return (
    <SettingsProvider>
    <ToastProvider>
    <BreadcrumbProvider>
      <AppLayoutInner />
    </BreadcrumbProvider>
    </ToastProvider>
    </SettingsProvider>
  );
}
