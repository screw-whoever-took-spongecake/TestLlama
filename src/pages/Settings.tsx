import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { HiOutlineFolder, HiOutlinePencil, HiOutlineTrash, HiOutlineArrowsUpDown } from 'react-icons/hi2';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
import Tooltip from '../components/Tooltip';
import type { Project } from '../types/testCase';

const API = '/service';
const NAME_MAX_LENGTH = 50;

function clampName(v: string): string {
  return v.slice(0, NAME_MAX_LENGTH);
}

function getUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'URL must start with http:// or https://';
    }
    return null;
  } catch {
    return 'Enter a valid URL (e.g. https://yourcompany.atlassian.net)';
  }
}

export default function Settings(): ReactElement {
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const { showToast } = useToast();

  // ── Jira settings state ────────────────────────────────────────────────────
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [jiraSaving, setJiraSaving] = useState(false);
  const urlError = useMemo(() => getUrlError(jiraBaseUrl), [jiraBaseUrl]);

  useEffect(() => {
    if (!settingsLoading) {
      setJiraBaseUrl(settings.jiraBaseUrl);
    }
  }, [settingsLoading, settings.jiraBaseUrl]);

  async function handleJiraSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setJiraSaving(true);
    try {
      await updateSettings({ jiraBaseUrl });
      showToast('Settings saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setJiraSaving(false);
    }
  }

  // ── Project management state ───────────────────────────────────────────────
  type SortKey = 'name-asc' | 'name-desc' | 'count-desc' | 'count-asc';
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectFormName, setProjectFormName] = useState('');
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  const fetchProjects = useCallback(async (): Promise<void> => {
    setProjectsLoading(true);
    try {
      const res = await fetch(`${API}/projects`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data: { id: number; name: string; testCaseCount?: number }[] = await res.json();
      setProjects(
        Array.isArray(data)
          ? data.map((p) => ({ id: p.id, name: p.name, testCaseCount: p.testCaseCount ?? 0 }))
          : []
      );
    } catch {
      setProjectError('Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const sortedProjects = useMemo<Project[]>(() => {
    const copy = [...projects];
    switch (sortKey) {
      case 'name-asc':  return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc': return copy.sort((a, b) => b.name.localeCompare(a.name));
      case 'count-desc': return copy.sort((a, b) => (b.testCaseCount ?? 0) - (a.testCaseCount ?? 0));
      case 'count-asc':  return copy.sort((a, b) => (a.testCaseCount ?? 0) - (b.testCaseCount ?? 0));
      default: return copy;
    }
  }, [projects, sortKey]);

  function openCreateProjectModal(): void {
    setEditingProjectId(null);
    setProjectFormName('');
    setProjectError(null);
    setProjectModalOpen(true);
  }

  function openEditProjectModal(project: Project): void {
    setEditingProjectId(project.id);
    setProjectFormName(clampName(project.name));
    setProjectError(null);
    setProjectModalOpen(true);
  }

  function closeProjectModal(): void {
    setProjectModalOpen(false);
    setEditingProjectId(null);
    setProjectFormName('');
  }

  async function handleProjectSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = projectFormName.trim();
    if (!name) return;
    setProjectError(null);
    setProjectSubmitting(true);
    try {
      if (editingProjectId !== null) {
        const res = await fetch(`${API}/projects/${editingProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Update failed');
        }
        showToast('Workspace updated');
      } else {
        const res = await fetch(`${API}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Create failed');
        }
        showToast('Workspace created');
      }
      closeProjectModal();
      await fetchProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setProjectSubmitting(false);
    }
  }

  async function handleDeleteProject(id: number, name: string, testCaseCount: number): Promise<void> {
    if (testCaseCount > 0) return; // button is disabled, guard defensively
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setProjectError(null);
    try {
      const res = await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      showToast('Workspace deleted');
      await fetchProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section className="page page--full-width">
      <h2>Settings</h2>

      <div className="settings-content">
        {/* ── Jira integration ──────────────────────────────────────────────── */}
        <div className="settings-card">
          {settingsLoading ? (
            <p className="settings-projects-loading">Loading…</p>
          ) : (
            <form onSubmit={handleJiraSubmit} className="settings-form">
              <div className="settings-section">
                <h3 className="settings-section-title">Jira Integration</h3>
                <p className="settings-section-desc">
                  Enter your Jira instance URL so that linked issue keys open the correct Jira board.
                </p>

                <div className="settings-field">
                  <label htmlFor="jiraBaseUrl" className="settings-label">
                    Jira Base URL
                  </label>
                  <input
                    id="jiraBaseUrl"
                    type="url"
                    className="modal-input settings-input"
                    placeholder="https://yourcompany.atlassian.net"
                    value={jiraBaseUrl}
                    onChange={(e) => setJiraBaseUrl(e.target.value)}
                    autoComplete="url"
                  />
                  <span className="settings-field-hint">
                    Example: <code>https://yourcompany.atlassian.net</code>
                  </span>
                  {urlError && (
                    <p className="settings-field-error">{urlError}</p>
                  )}
                </div>

                {jiraBaseUrl && (
                  <div className="settings-preview">
                    <span className="settings-preview-label">Link preview:</span>
                    <a
                      href={`${jiraBaseUrl.replace(/\/$/, '')}/browse/PROJ-123`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-preview-link"
                    >
                      {jiraBaseUrl.replace(/\/$/, '')}/browse/PROJ-123
                    </a>
                  </div>
                )}
              </div>

              <div className="settings-actions">
                <button
                  type="submit"
                  className="modal-btn modal-btn--primary"
                  disabled={jiraSaving}
                >
                  {jiraSaving && <span className="btn-spinner" aria-hidden="true" />}
                  {jiraSaving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Workspaces ─────────────────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-section">
            <div className="settings-section-header">
              <div>
                <h3 className="settings-section-title">Workspaces</h3>
                <p className="settings-section-desc">
                  Each workspace is an isolated context for test cases and test runs. Switch between them using the sidebar dropdown.
                </p>
              </div>
              <button
                type="button"
                className="modal-btn modal-btn--primary"
                onClick={openCreateProjectModal}
                disabled={projectsLoading}
              >
                + Create workspace
              </button>
            </div>

            {projectError && (
              <p className="settings-field-error" role="alert">{projectError}</p>
            )}

            {projectsLoading ? (
              <p className="settings-projects-loading">Loading workspaces…</p>
            ) : projects.length === 0 ? (
              <p className="settings-projects-empty">No workspaces yet. Create one to get started.</p>
            ) : (
              <>
                <div className="settings-sort-row">
                  <HiOutlineArrowsUpDown className="settings-sort-icon" aria-hidden="true" />
                  <label htmlFor="projects-sort" className="settings-sort-label">Sort:</label>
                  <select
                    id="projects-sort"
                    className="settings-sort-select"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="name-asc">Name A → Z</option>
                    <option value="name-desc">Name Z → A</option>
                    <option value="count-desc">Most test cases</option>
                    <option value="count-asc">Fewest test cases</option>
                  </select>
                  <span className="settings-sort-count">{projects.length} workspace{projects.length !== 1 ? 's' : ''}</span>
                </div>
                <ul className="settings-projects-list">
                  {sortedProjects.map((project) => (
                    <li key={project.id} className="settings-project-row">
                      <HiOutlineFolder className="settings-project-icon" aria-hidden="true" />
                      <span className="settings-project-name">{project.name}</span>
                      <span className="settings-project-count">
                        {project.testCaseCount ?? 0} test case{(project.testCaseCount ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <div className="settings-project-actions">
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--edit"
                          onClick={() => openEditProjectModal(project)}
                          aria-label={`Rename workspace ${project.name}`}
                        >
                          <HiOutlinePencil aria-hidden="true" /> Rename
                        </button>
                        <Tooltip content={(project.testCaseCount ?? 0) > 0 ? 'Delete or move all test cases in this workspace first' : undefined}>
                          <button
                            type="button"
                            className="test-case-btn test-case-btn--delete"
                            onClick={() => handleDeleteProject(project.id, project.name, project.testCaseCount ?? 0)}
                            disabled={(project.testCaseCount ?? 0) > 0}
                            aria-label={`Delete workspace ${project.name}`}
                          >
                            <HiOutlineTrash aria-hidden="true" /> Delete
                          </button>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Workspace modal ─────────────────────────────────────────────────── */}
      {projectModalOpen && (
        <div className="modal-overlay" onClick={closeProjectModal} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-modal-title"
          >
            <h3 id="project-modal-title" className="modal-title">
              {editingProjectId !== null ? 'Rename workspace' : 'Create workspace'}
            </h3>
            <form onSubmit={handleProjectSubmit} className="modal-form">
              <label htmlFor="settings-project-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="settings-project-name"
                type="text"
                className="modal-input"
                value={projectFormName}
                onChange={(e) => setProjectFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. Catch"
                required
                autoFocus
              />
              {projectError && (
                <p className="settings-field-error">{projectError}</p>
              )}
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeProjectModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn--primary"
                  disabled={projectSubmitting}
                >
                  {projectSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                  {projectSubmitting ? 'Saving…' : (editingProjectId !== null ? 'Save' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
