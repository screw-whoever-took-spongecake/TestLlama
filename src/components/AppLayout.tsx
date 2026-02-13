import { useState } from 'react';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Banner from './Banner';
import Sidebar from './Sidebar';
import type { TabId } from './Sidebar';

/**
 * Persistent layout: sidebar (top, always visible) + banner + main content.
 * Wraps all routes so the sidebar is usable on every page.
 */
export default function AppLayout(): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const location = useLocation();
  const navigate = useNavigate();

  const isFormRoute = location.pathname.startsWith('/service/testcase/');
  const effectiveActiveTab: TabId = isFormRoute ? 'test-cases' : activeTab;

  function handleSelectTab(id: TabId): void {
    setActiveTab(id);
    if (!sidebarOpen) setSidebarOpen(true);
    if (location.pathname !== '/') navigate('/');
  }

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        activeTab={effectiveActiveTab}
        onSelectTab={handleSelectTab}
      />
      <Banner />
      <main className="main">
        <Outlet context={{ activeTab, setActiveTab }} />
      </main>
    </div>
  );
}
