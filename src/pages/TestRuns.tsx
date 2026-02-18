import { useState, useMemo, useEffect, useCallback } from 'react';
import type { SyntheticEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineFolder,
  HiChevronRight,
  HiChevronDown,
  HiOutlineTrash,
  HiOutlinePencil,
} from 'react-icons/hi2';
import type { ProjectWithRuns, TestRun, TestRunStatus } from '../types/testRun';
import type { TestCase } from '../types/testCase';

const API = '/service';
const NAME_MAX_LENGTH = 50;

const LS_KEY_EXPANDED    = 'tr_expandedIds';
const LS_KEY_PROJECT_SORT = 'tr_projectSortOrder';
const LS_KEY_RUN_SORT    = 'tr_runSortOrder';

function clampName(value: string): string {
  return value.slice(0, NAME_MAX_LENGTH);
}

function loadExpanded(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY_EXPANDED);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore */ }
  return new Set();
}

function loadSort(key: string): 'asc' | 'desc' {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'asc' || raw === 'desc') return raw;
  } catch { /* ignore */ }
  return 'asc';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const STATUS_LABELS: Record<TestRunStatus, string> = {
  ready_to_test: 'Ready to Test',
  passed: 'Passed',
  failed: 'Failed',
  na: 'N/A',
};

const STATUS_BADGE_CLASS: Record<TestRunStatus, string> = {
  ready_to_test: 'run-status-badge run-status-badge--ready',
  passed: 'run-status-badge run-status-badge--passed',
  failed: 'run-status-badge run-status-badge--failed',
  na: 'run-status-badge run-status-badge--na',
};

export default function TestRuns(): ReactElement {
  const navigate = useNavigate();
  const [projects, setProjects]     = useState<ProjectWithRuns[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number | null>>(loadExpanded as () => Set<number | null>);
  const [projectSortOrder, setProjectSortOrder] = useState<'asc' | 'desc'>(() => loadSort(LS_KEY_PROJECT_SORT));
  const [runSortOrder, setRunSortOrder]         = useState<'asc' | 'desc'>(() => loadSort(LS_KEY_RUN_SORT));

  const [runModalOpen, setRunModalOpen] = useState(false);
  const [formName, setFormName]         = useState('');
  const [formTestCaseId, setFormTestCaseId] = useState<string>('');
  const [allTestCases, setAllTestCases] = useState<TestCase[]>([]);
  const [submitting, setSubmitting]     = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchRuns = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/test-runs`);
      const data: ProjectWithRuns[] = res.ok ? await res.json() : [];
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      setExpandedIds((prev) => {
        const projectIds = list.map((p) => p.id);
        if (list.length > 0 && prev.size === 0 && !localStorage.getItem(LS_KEY_EXPANDED)) {
          return new Set(projectIds);
        }
        return prev;
      });
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTestCases = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API}/test-cases`);
      if (res.ok) {
        const data: TestCase[] = await res.json();
        setAllTestCases(Array.isArray(data) ? data : []);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Persist preferences
  useEffect(() => {
    localStorage.setItem(LS_KEY_EXPANDED, JSON.stringify([...expandedIds]));
  }, [expandedIds]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_PROJECT_SORT, projectSortOrder);
  }, [projectSortOrder]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_RUN_SORT, runSortOrder);
  }, [runSortOrder]);

  // ── sorting ────────────────────────────────────────────────────────────────

  const sortedProjects = useMemo(() => {
    const byProjectName = (a: ProjectWithRuns, b: ProjectWithRuns) => {
      // "Uncategorized" always goes last
      if (a.id === null && b.id !== null) return 1;
      if (a.id !== null && b.id === null) return -1;
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return projectSortOrder === 'asc' ? cmp : -cmp;
    };
    const byRunName = (a: TestRun, b: TestRun) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return runSortOrder === 'asc' ? cmp : -cmp;
    };
    return [...projects]
      .sort(byProjectName)
      .map((p) => ({ ...p, testRuns: [...p.testRuns].sort(byRunName) }));
  }, [projects, projectSortOrder, runSortOrder]);

  const allExpanded = projects.length > 0 && projects.every((p) => expandedIds.has(p.id));

  function expandAll(): void {
    setExpandedIds(new Set(projects.map((p) => p.id)));
  }

  function collapseAll(): void {
    setExpandedIds(new Set());
  }

  function toggleExpanded(id: number | null): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── modal ──────────────────────────────────────────────────────────────────

  function openCreateRunModal(): void {
    setFormName('');
    setFormTestCaseId(allTestCases[0]?.id ?? '');
    setRunModalOpen(true);
    if (allTestCases.length === 0) fetchTestCases();
  }

  // Also fetch test cases lazily when we don't have them yet
  function openCreateRunModalForProject(): void {
    openCreateRunModal();
  }

  function closeRunModal(): void {
    setRunModalOpen(false);
    setFormName('');
    setFormTestCaseId('');
  }

  async function handleRunSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    if (!formTestCaseId) {
      setError('Please select a test case');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/test-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, testCaseId: formTestCaseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Create failed');
      }
      closeRunModal();
      await fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRun(id: number, name: string): Promise<void> {
    if (!window.confirm(`Delete test run "${name}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`${API}/test-runs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      await fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <section className="page test-cases-page">
      <div className="test-cases-header">
        <h2>Test Runs</h2>
        <p className="test-cases-description">
          Test runs are grouped by project. Each run is a snapshot of a test case's steps.
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
            title={loading ? 'Loading…' : undefined}
          >
            {projectSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
        <div className="test-cases-sort">
          <span className="test-cases-sort-label">Sort runs by name:</span>
          <button
            type="button"
            className="test-cases-sort-btn"
            onClick={() => setRunSortOrder(runSortOrder === 'asc' ? 'desc' : 'asc')}
            aria-pressed={runSortOrder === 'desc'}
            disabled={loading}
            title={loading ? 'Loading…' : undefined}
          >
            {runSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
        <div className="test-cases-toolbar-actions">
          <button
            type="button"
            className="test-cases-create-btn"
            onClick={() => {
              fetchTestCases();
              openCreateRunModalForProject();
            }}
            disabled={loading}
            title={loading ? 'Loading…' : undefined}
          >
            + Create test run
          </button>
        </div>
      </div>

      <div className="test-cases-list-wrap">
        {loading ? (
          <p className="test-cases-loading">Loading…</p>
        ) : sortedProjects.length === 0 ? (
          <p className="test-cases-empty">No test runs yet. Create one using the button above.</p>
        ) : (
          <>
            <div className="test-cases-expand-bar">
              <button
                type="button"
                className="test-cases-sort-btn"
                onClick={allExpanded ? collapseAll : expandAll}
                aria-label={allExpanded ? 'Collapse all projects' : 'Expand all projects'}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            <div className="test-cases-tree" role="tree" aria-label="Projects and test runs">
              {sortedProjects.map((project) => {
                const isExpanded = expandedIds.has(project.id);
                return (
                  <div
                    key={project.id ?? 'uncategorized'}
                    className="test-cases-tree-node"
                    role="treeitem"
                    aria-expanded={isExpanded}
                  >
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
                        ({project.testRuns.length})
                      </span>
                      <div className="test-cases-tree-folder-actions">
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--edit"
                          onClick={() => {
                            fetchTestCases();
                            openCreateRunModal();
                          }}
                          aria-label={`Add test run to ${project.name}`}
                        >
                          + Add run
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="test-cases-tree-children" role="group">
                        {project.testRuns.length === 0 ? (
                          <p className="test-cases-tree-empty">No test runs in this project.</p>
                        ) : (
                          project.testRuns.map((run) => (
                            <div
                              key={run.id}
                              className="test-case-row test-case-row--child test-run-row"
                              role="treeitem"
                            >
                              <span className={STATUS_BADGE_CLASS[run.status as TestRunStatus] ?? 'run-status-badge'}>
                                {STATUS_LABELS[run.status as TestRunStatus] ?? run.status}
                              </span>
                              <span
                                className="test-case-name test-run-name"
                                role="button"
                                tabIndex={0}
                                onClick={() => navigate(`/service/testrun/${run.id}`)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/service/testrun/${run.id}`); }}
                              >
                                {run.name}
                              </span>
                              <span className="test-run-source" title={`From test case: ${run.sourceTestCaseName}`}>
                                from {run.sourceTestCaseName || 'deleted test case'}
                              </span>
                              <span className="test-run-dates">
                                <span title="Created at">Created {formatDate(run.createdAt)}</span>
                                <span className="test-run-dates-sep">·</span>
                                <span title="Last updated">Updated {formatDate(run.updatedAt)}</span>
                              </span>
                              <div className="test-case-actions">
                                <button
                                  type="button"
                                  className="test-case-btn test-case-btn--edit"
                                  onClick={() => navigate(`/service/testrun/${run.id}`)}
                                  aria-label={`Edit ${run.name}`}
                                >
                                  <HiOutlinePencil aria-hidden="true" /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="test-case-btn test-case-btn--delete"
                                  onClick={() => handleDeleteRun(run.id, run.name)}
                                  aria-label={`Delete ${run.name}`}
                                >
                                  <HiOutlineTrash aria-hidden="true" /> Delete
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
          </>
        )}
      </div>

      {/* ── Create Test Run Modal ─────────────────────────────────────────── */}
      {runModalOpen && (
        <div className="modal-overlay" onClick={closeRunModal} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-modal-title"
          >
            <h3 id="run-modal-title" className="modal-title">Create test run</h3>
            <form onSubmit={handleRunSubmit} className="modal-form">
              <label htmlFor="run-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="run-name"
                type="text"
                className="modal-input"
                value={formName}
                onChange={(e) => setFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. Sprint 14 – Login flow"
                required
                autoFocus
              />
              <label htmlFor="run-test-case" className="modal-label">
                Test case to copy from
              </label>
              <select
                id="run-test-case"
                className="modal-input"
                value={formTestCaseId}
                onChange={(e) => setFormTestCaseId(e.target.value)}
                required
              >
                {allTestCases.length === 0 ? (
                  <option value="" disabled>Loading test cases…</option>
                ) : (
                  allTestCases.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                    </option>
                  ))
                )}
              </select>
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeRunModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn--primary"
                  disabled={submitting || allTestCases.length === 0}
                  title={allTestCases.length === 0 ? 'No test cases available' : undefined}
                >
                  {submitting && <span className="btn-spinner" aria-hidden="true" />}
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
