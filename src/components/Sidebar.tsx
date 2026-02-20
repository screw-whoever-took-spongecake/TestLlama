import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineHome,
  HiOutlineClipboardDocumentList,
  HiOutlinePlayCircle,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineRectangleGroup,
} from 'react-icons/hi2';
import type { IconType } from 'react-icons';
import type { Project } from '../types/testCase';

const EXPAND_DURATION_MS = 300;

export type TabId = 'home' | 'test-cases' | 'test-runs' | 'results' | 'settings';

interface MenuItem {
  id: TabId;
  label: string;
  icon: IconType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: 'Home', icon: HiOutlineHome },
  { id: 'test-cases', label: 'Test Cases', icon: HiOutlineClipboardDocumentList },
  { id: 'test-runs', label: 'Test Runs', icon: HiOutlinePlayCircle },
  { id: 'results', label: 'Results', icon: HiOutlineChartBar },
];

export interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  workspaceId: number | null;
  workspaces: Project[];
  loadingWorkspaces: boolean;
  onSelectWorkspace: (id: number) => void;
}

export default function Sidebar({
  isOpen,
  onToggle,
  activeTab,
  onSelectTab,
  workspaceId,
  workspaces,
  loadingWorkspaces,
  onSelectWorkspace,
}: SidebarProps): ReactElement {
  const [labelsVisible, setLabelsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => setLabelsVisible(true), EXPAND_DURATION_MS);
      return () => clearTimeout(id);
    }
    setLabelsVisible(false);
  }, [isOpen]);

  const currentWorkspace = workspaces.find((w) => w.id === workspaceId);

  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          <span className="sidebar-toggle-icon" aria-hidden="true">
            {isOpen ? <HiChevronLeft /> : <HiChevronRight />}
          </span>
        </button>
      </div>

      {/* Workspace selector */}
      <div className="sidebar-workspace">
        {isOpen && labelsVisible ? (
          <div className="sidebar-workspace-expanded">
            <label htmlFor="workspace-select" className="sidebar-workspace-label">
              Workspace
            </label>
            <select
              id="workspace-select"
              className="sidebar-workspace-select"
              value={workspaceId ?? ''}
              onChange={(e) => onSelectWorkspace(Number(e.target.value))}
              disabled={loadingWorkspaces || workspaces.length === 0}
            >
              {loadingWorkspaces ? (
                <option value="">Loading…</option>
              ) : workspaces.length === 0 ? (
                <option value="">No workspaces</option>
              ) : (
                workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))
              )}
            </select>
          </div>
        ) : (
            <div className="sidebar-workspace-icon-wrap" aria-label={currentWorkspace?.name ?? 'Workspace'}>
              <HiOutlineRectangleGroup className="sidebar-workspace-icon" aria-hidden="true" />
            </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-item ${activeTab === item.id ? 'sidebar-item--active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon className="sidebar-item-icon" aria-hidden="true" />
              <span
                className={`sidebar-item-label ${labelsVisible ? 'sidebar-item-label--visible' : ''}`}
                aria-hidden={!labelsVisible}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-item ${activeTab === 'settings' ? 'sidebar-item--active' : ''}`}
          onClick={() => onSelectTab('settings')}
          aria-label="Settings"
        >
          <HiOutlineCog6Tooth className="sidebar-item-icon" aria-hidden="true" />
          <span
            className={`sidebar-item-label ${labelsVisible ? 'sidebar-item-label--visible' : ''}`}
            aria-hidden={!labelsVisible}
          >
            Settings
          </span>
        </button>
      </div>
    </aside>
  );
}
