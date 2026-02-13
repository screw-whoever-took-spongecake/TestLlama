import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineHome,
  HiOutlineClipboardDocumentList,
  HiOutlinePlayCircle,
  HiOutlineChartBar,
} from 'react-icons/hi2';
import type { IconType } from 'react-icons';

const EXPAND_DURATION_MS = 300;

export type TabId = 'home' | 'test-cases' | 'test-runs' | 'results';

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
}

export default function Sidebar({ isOpen, onToggle, activeTab, onSelectTab }: SidebarProps): ReactElement {
  const [labelsVisible, setLabelsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => setLabelsVisible(true), EXPAND_DURATION_MS);
      return () => clearTimeout(id);
    }
    setLabelsVisible(false);
  }, [isOpen]);

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
    </aside>
  );
}
