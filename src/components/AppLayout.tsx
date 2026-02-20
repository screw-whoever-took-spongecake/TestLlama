import { useState } from 'react';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Banner from './Banner';
import Sidebar from './Sidebar';
import type { TabId } from './Sidebar';
import { ToastProvider } from './Toast';
import { SettingsProvider } from '../contexts/SettingsContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { BreadcrumbProvider, useBreadcrumb } from '../contexts/BreadcrumbContext';
import type { BreadcrumbSegment } from '../contexts/BreadcrumbContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

const TAB_LABELS: Record<TabId, string> = {
  'home':       'Home',
  'test-cases': 'Test Cases',
  'test-runs':  'Test Runs',
  'results':    'Results',
  'settings':   'Settings',
};

const TAB_PATHS: Record<TabId, string> = {
  'home':       '/',
  'test-cases': '/test-cases',
  'test-runs':  '/test-runs',
  'results':    '/results',
  'settings':   '/settings',
};

function getTabFromPath(pathname: string): TabId {
  if (pathname.startsWith('/test-cases') || pathname.startsWith('/service/testcase/')) return 'test-cases';
  if (pathname.startsWith('/test-runs')  || pathname.startsWith('/service/testrun/'))  return 'test-runs';
  if (pathname.startsWith('/results'))  return 'results';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
}

function AppLayoutInner(): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { override } = useBreadcrumb();
  const { workspaceId, setWorkspaceId, workspaces, loadingWorkspaces } = useWorkspace();

  const activeTab = getTabFromPath(location.pathname);

  function handleSelectTab(id: TabId): void {
    if (!sidebarOpen) setSidebarOpen(true);
    navigate(TAB_PATHS[id]);
  }

  const defaultSegments: BreadcrumbSegment[] = [
    { label: TAB_LABELS[activeTab] },
  ];
  const breadcrumbSegments = override ?? defaultSegments;

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        workspaceId={workspaceId}
        workspaces={workspaces}
        loadingWorkspaces={loadingWorkspaces}
        onSelectWorkspace={setWorkspaceId}
      />
      <Banner segments={breadcrumbSegments} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Persistent layout: sidebar + banner + main content.
 * Wraps all routes so the sidebar is usable on every page.
 */
export default function AppLayout(): ReactElement {
  return (
    <SettingsProvider>
    <WorkspaceProvider>
    <ToastProvider>
    <BreadcrumbProvider>
      <AppLayoutInner />
    </BreadcrumbProvider>
    </ToastProvider>
    </WorkspaceProvider>
    </SettingsProvider>
  );
}
