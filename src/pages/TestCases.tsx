import { useState, useMemo, useEffect, useCallback } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineFolder, HiChevronRight, HiChevronDown } from 'react-icons/hi2';
import type { ProjectWithCases } from '../types/testCase';

const API = '/service';
const NAME_MAX_LENGTH = 50;

function clampName(value: string): string {
  return value.slice(0, NAME_MAX_LENGTH);
}

export default function TestCases(): ReactElement {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithCases[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [projectSortOrder, setProjectSortOrder] = useState<'asc' | 'desc'>('asc');
  const [caseSortOrder, setCaseSortOrder] = useState<'asc' | 'desc'>('asc');

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formProjectId, setFormProjectId] = useState<number | ''>('');

  const fetchProjects = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/projects`);
      const data: ProjectWithCases[] = res.ok ? await res.json() : [];
      setProjects(Array.isArray(data) ? data : []);
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0 && expandedIds.size === 0) {
        setExpandedIds(new Set(list.map((p) => p.id)));
      }
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const sortedProjects = useMemo(() => {
    const byProjectName = (a: ProjectWithCases, b: ProjectWithCases) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return projectSortOrder === 'asc' ? cmp : -cmp;
    };
    const byCaseName = (a: { name: string }, b: { name: string }) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return caseSortOrder === 'asc' ? cmp : -cmp;
    };
    return [...projects]
      .sort(byProjectName)
      .map((p) => ({
        ...p,
        testCases: [...p.testCases].sort(byCaseName),
      }));
  }, [projects, projectSortOrder, caseSortOrder]);

  function toggleExpanded(projectId: number): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function openCreateProjectModal(): void {
    setEditingProjectId(null);
    setFormName('');
    setProjectModalOpen(true);
  }

  function openEditProjectModal(project: ProjectWithCases): void {
    setEditingProjectId(project.id);
    setFormName(clampName(project.name));
    setProjectModalOpen(true);
  }

  function openCreateCaseModal(projectId?: number): void {
    setEditingCaseId(null);
    setFormName('');
    setFormProjectId(projectId ?? (projects[0]?.id ?? ''));
    setCaseModalOpen(true);
  }

  function closeProjectModal(): void {
    setProjectModalOpen(false);
    setEditingProjectId(null);
    setFormName('');
  }

  function closeCaseModal(): void {
    setCaseModalOpen(false);
    setEditingCaseId(null);
    setFormName('');
    setFormProjectId('');
  }

  async function handleProjectSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    setError(null);
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
      }
      closeProjectModal();
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  }

  async function handleCaseSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    if (formProjectId === '' || typeof formProjectId !== 'number') {
      setError('Please select a project');
      return;
    }
    setError(null);
    try {
      if (editingCaseId) {
        const res = await fetch(`${API}/test-cases/${editingCaseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId: formProjectId }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(`${API}/test-cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId: formProjectId }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Create failed');
        }
      }
      closeCaseModal();
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  }

  async function handleDeleteProject(id: number, name: string): Promise<void> {
    if (!window.confirm(`Delete project "${name}"? You must delete or move its test cases first.`)) return;
    setError(null);
    try {
      const res = await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleDeleteCase(id: string): Promise<void> {
    if (!window.confirm('Delete this test case?')) return;
    setError(null);
    try {
      const res = await fetch(`${API}/test-cases/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section className="page test-cases-page">
      <div className="test-cases-header">
        <h2>Test Cases</h2>
        <p className="test-cases-description">
          Projects act as folders. Expand or collapse a project to show or hide its test cases.
        </p>
      </div>

      {error && (
        <div className="test-cases-error" role="alert">
          {error}
        </div>
      )}

      <div className="test-cases-toolbar">
        <div className="test-cases-sort">
          <span className="test-cases-sort-label">Sort projects by name:</span>
          <button
            type="button"
            className="test-cases-sort-btn"
            onClick={() => setProjectSortOrder(projectSortOrder === 'asc' ? 'desc' : 'asc')}
            aria-pressed={projectSortOrder === 'desc'}
            disabled={loading}
            title={loading ? 'Loading projects…' : undefined}
          >
            {projectSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
        <div className="test-cases-sort">
          <span className="test-cases-sort-label">Sort cases by name:</span>
          <button
            type="button"
            className="test-cases-sort-btn"
            onClick={() => setCaseSortOrder(caseSortOrder === 'asc' ? 'desc' : 'asc')}
            aria-pressed={caseSortOrder === 'desc'}
            disabled={loading}
            title={loading ? 'Loading projects…' : undefined}
          >
            {caseSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
        <div className="test-cases-toolbar-actions">
          <button
            type="button"
            className="test-cases-create-btn test-cases-create-btn--secondary"
            onClick={openCreateProjectModal}
            disabled={loading}
            title={loading ? 'Loading…' : undefined}
          >
            Create project
          </button>
          <button
            type="button"
            className="test-cases-create-btn"
            onClick={() => openCreateCaseModal()}
            disabled={loading || projects.length === 0}
            title={loading ? 'Loading…' : projects.length === 0 ? 'Create a project first' : undefined}
          >
            Create test case
          </button>
        </div>
      </div>

      <div className="test-cases-list-wrap">
        {loading ? (
          <p className="test-cases-loading">Loading…</p>
        ) : sortedProjects.length === 0 ? (
          <p className="test-cases-empty">No projects yet. Create a project to add test cases.</p>
        ) : (
          <div className="test-cases-tree" role="tree" aria-label="Projects and test cases">
            {sortedProjects.map((project) => {
              const isExpanded = expandedIds.has(project.id);
              return (
                <div key={project.id} className="test-cases-tree-node" role="treeitem" aria-expanded={isExpanded}>
                  <div className="test-cases-tree-folder">
                    <button
                      type="button"
                      className="test-cases-tree-toggle"
                      onClick={() => toggleExpanded(project.id)}
                      aria-label={isExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
                    >
                      <span className="test-cases-tree-chevron" aria-hidden="true">
                        {isExpanded ? <HiChevronDown /> : <HiChevronRight />}
                      </span>
                    </button>
                    <HiOutlineFolder className="test-cases-tree-folder-icon" aria-hidden="true" />
                    <span className="test-cases-tree-folder-name">{project.name}</span>
                    <span className="test-cases-tree-folder-count">
                      ({project.testCases.length})
                    </span>
                    <div className="test-cases-tree-folder-actions">
                      <button
                        type="button"
                        className="test-case-btn test-case-btn--edit"
                        onClick={() => openCreateCaseModal(project.id)}
                        aria-label={`Add test case to ${project.name}`}
                      >
                        + Add case
                      </button>
                      <button
                        type="button"
                        className="test-case-btn test-case-btn--edit"
                        onClick={() => openEditProjectModal(project)}
                        aria-label={`Edit project ${project.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="test-case-btn test-case-btn--delete"
                        onClick={() => handleDeleteProject(project.id, project.name)}
                        disabled={project.testCases.length > 0}
                        title={project.testCases.length > 0 ? 'Move or delete all test cases in this project first' : undefined}
                        aria-label={project.testCases.length > 0 ? `Delete project ${project.name} (disabled: remove test cases first)` : `Delete project ${project.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="test-cases-tree-children" role="group">
                      {project.testCases.length === 0 ? (
                        <p className="test-cases-tree-empty">No test cases in this project.</p>
                      ) : (
                        project.testCases.map((tc) => (
                          <div key={tc.id} className="test-case-row test-case-row--child" role="treeitem">
                            <span className="test-case-id" title="Test case ID">{tc.id}</span>
                            <span className="test-case-name">{tc.name}</span>
                            <div className="test-case-actions">
                              <button
                                type="button"
                                className="test-case-btn test-case-btn--edit"
                                onClick={() => navigate(`/service/testcase/${tc.id}`)}
                                aria-label={`Edit ${tc.name}`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="test-case-btn test-case-btn--delete"
                                onClick={() => handleDeleteCase(tc.id)}
                                aria-label={`Delete ${tc.name}`}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              {editingProjectId !== null ? 'Edit project' : 'Create project'}
            </h3>
            <form onSubmit={handleProjectSubmit} className="modal-form">
              <label htmlFor="project-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="project-name"
                type="text"
                className="modal-input"
                value={formName}
                onChange={(e) => setFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. API Tests"
                required
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeProjectModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--primary">
                  {editingProjectId !== null ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {caseModalOpen && (
        <div className="modal-overlay" onClick={closeCaseModal} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-modal-title"
          >
            <h3 id="case-modal-title" className="modal-title">
              {editingCaseId ? 'Edit test case' : 'Create test case'}
            </h3>
            <form onSubmit={handleCaseSubmit} className="modal-form">
              <label htmlFor="test-case-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="test-case-name"
                type="text"
                className="modal-input"
                value={formName}
                onChange={(e) => setFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. Login with valid credentials"
                required
                autoFocus
              />
              <label htmlFor="test-case-project" className="modal-label">
                Project
              </label>
              <select
                id="test-case-project"
                className="modal-input"
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeCaseModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--primary">
                  {editingCaseId ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
