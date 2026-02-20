import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { SyntheticEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineFolder,
  HiChevronRight,
  HiChevronDown,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineFolderPlus,
} from 'react-icons/hi2';
import type { TestRun, TestRunStatus, TestRunFolder } from '../types/testRun';
import { isLockedStatus } from '../types/testRun';
import type { TestCase } from '../types/testCase';
import { useWorkspace } from '../contexts/WorkspaceContext';
import Tooltip from '../components/Tooltip';

const API = '/service';
const NAME_MAX_LENGTH = 50;

const LS_KEY_EXPANDED = 'tr_expandedFolderIds';
const LS_KEY_RUN_SORT = 'tr_runSortOrder';

function clampName(value: string): string {
  return value.slice(0, NAME_MAX_LENGTH);
}

function loadExpandedSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw) as string[]);
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
  in_progress: 'In Progress',
  passed: 'Passed',
  failed: 'Failed',
  na: 'N/A',
};

const STATUS_BADGE_CLASS: Record<TestRunStatus, string> = {
  ready_to_test: 'run-status-badge run-status-badge--ready',
  in_progress: 'run-status-badge run-status-badge--in-progress',
  passed: 'run-status-badge run-status-badge--passed',
  failed: 'run-status-badge run-status-badge--failed',
  na: 'run-status-badge run-status-badge--na',
};

export default function TestRuns(): ReactElement {
  const navigate = useNavigate();
  const { workspaceId, workspaces } = useWorkspace();

  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [folders, setFolders] = useState<TestRunFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => loadExpandedSet(LS_KEY_EXPANDED));
  const [runSortOrder, setRunSortOrder] = useState<'asc' | 'desc'>(() => loadSort(LS_KEY_RUN_SORT));

  // Create run modal
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTestCaseId, setFormTestCaseId] = useState<string>('');
  const [formFolderId, setFormFolderId] = useState<number | ''>('');
  const [allTestCases, setAllTestCases] = useState<TestCase[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Folder modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [folderFormName, setFolderFormName] = useState('');
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!workspaceId) return;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const [runsRes, foldersRes] = await Promise.all([
        fetch(`${API}/test-runs?projectId=${workspaceId}`, { signal: controller.signal }),
        fetch(`${API}/test-run-folders?projectId=${workspaceId}`, { signal: controller.signal }),
      ]);
      const runs: TestRun[] = runsRes.ok ? await runsRes.json() : [];
      const flds: TestRunFolder[] = foldersRes.ok ? await foldersRes.json() : [];
      setTestRuns(Array.isArray(runs) ? runs : []);
      setFolders(Array.isArray(flds) ? flds : []);

      setExpandedIds((prev) => {
        if (prev.size === 0 && !localStorage.getItem(LS_KEY_EXPANDED)) {
          return new Set(['__unfoldered__', ...flds.map((f) => String(f.id))]);
        }
        return prev;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to load test runs');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [workspaceId]);

  const fetchTestCases = useCallback(async (): Promise<void> => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`${API}/test-cases?projectId=${workspaceId}`);
      if (res.ok) {
        const data: TestCase[] = await res.json();
        setAllTestCases(Array.isArray(data) ? data : []);
      }
    } catch { /* non-fatal */ }
  }, [workspaceId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Cancel any in-flight fetch on unmount
  useEffect(() => {
    return () => { fetchAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY_EXPANDED, JSON.stringify([...expandedIds]));
  }, [expandedIds]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_RUN_SORT, runSortOrder);
  }, [runSortOrder]);

  function toggleExpanded(key: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const sortedRuns = useMemo(() => {
    const cmp = (a: TestRun, b: TestRun) => {
      const diff = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return runSortOrder === 'asc' ? diff : -diff;
    };
    return [...testRuns].sort(cmp);
  }, [testRuns, runSortOrder]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [folders]
  );

  const runsByFolder = useMemo(() => {
    const map = new Map<number | null, TestRun[]>();
    for (const run of sortedRuns) {
      const key = run.folderId ?? null;
      const list = map.get(key) ?? [];
      list.push(run);
      map.set(key, list);
    }
    return map;
  }, [sortedRuns]);

  const allGroupKeys = useMemo(
    () => ['__unfoldered__', ...sortedFolders.map((f) => String(f.id))],
    [sortedFolders]
  );
  const allExpanded = allGroupKeys.length > 0 && allGroupKeys.every((k) => expandedIds.has(k));

  function expandAll(): void { setExpandedIds(new Set(allGroupKeys)); }
  function collapseAll(): void { setExpandedIds(new Set()); }

  // ── Create run modal ─────────────────────────────────────────────────────

  function openCreateRunModal(folderId?: number): void {
    setFormName('');
    setFormTestCaseId('');
    setFormFolderId(folderId ?? '');
    setRunModalOpen(true);
    void fetchTestCases();
  }

  function closeRunModal(): void {
    setRunModalOpen(false);
    setFormName('');
    setFormTestCaseId('');
    setFormFolderId('');
  }

  async function handleRunSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = formName.trim();
    if (!name || !workspaceId) return;
    if (!formTestCaseId) { setError('Please select a test case'); return; }
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
      // Assign folder if selected
      if (formFolderId !== '') {
        const created: TestRun = await res.json();
        await fetch(`${API}/test-runs/${created.id}/folder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: formFolderId }),
        });
      }
      closeRunModal();
      await fetchData();
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
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleMoveToFolder(runId: number, folderId: number | null): Promise<void> {
    try {
      const res = await fetch(`${API}/test-runs/${runId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Move failed');
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move test run');
    }
  }

  // ── Folder modal ─────────────────────────────────────────────────────────

  function openCreateFolderModal(): void {
    setEditingFolderId(null);
    setFolderFormName('');
    setFolderError(null);
    setFolderModalOpen(true);
  }

  function openEditFolderModal(folder: TestRunFolder): void {
    setEditingFolderId(folder.id);
    setFolderFormName(folder.name);
    setFolderError(null);
    setFolderModalOpen(true);
  }

  function closeFolderModal(): void {
    setFolderModalOpen(false);
    setEditingFolderId(null);
    setFolderFormName('');
    setFolderError(null);
  }

  async function handleFolderSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = folderFormName.trim();
    if (!name || !workspaceId) return;
    setFolderError(null);
    setFolderSubmitting(true);
    try {
      if (editingFolderId) {
        const res = await fetch(`${API}/test-run-folders/${editingFolderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(`${API}/test-run-folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId: workspaceId }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Create failed');
        }
      }
      closeFolderModal();
      await fetchData();
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setFolderSubmitting(false);
    }
  }

  async function handleDeleteFolder(folder: TestRunFolder): Promise<void> {
    const count = runsByFolder.get(folder.id)?.length ?? 0;
    const msg = count > 0
      ? `Delete folder "${folder.name}"? Its ${count} run(s) will be moved to Unfoldered.`
      : `Delete folder "${folder.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch(`${API}/test-run-folders/${folder.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch((): { error?: string } => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const currentWorkspaceName = workspaces.find((w) => w.id === workspaceId)?.name ?? 'Workspace';

  function renderRunRow(run: TestRun) {
    return (
      <div key={run.id} className="test-case-row test-case-row--child test-run-row" role="treeitem">
        <span className={STATUS_BADGE_CLASS[run.status] ?? 'run-status-badge'}>
          {STATUS_LABELS[run.status] ?? run.status}
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
        <Tooltip content={`From test case: ${run.sourceTestCaseName}`}>
          <span className="test-run-source">from {run.sourceTestCaseName || 'deleted test case'}</span>
        </Tooltip>
        <span className="test-run-dates">
          <span>Created {formatDate(run.createdAt)}</span>
          <span className="test-run-dates-sep">·</span>
          <span>Updated {formatDate(run.updatedAt)}</span>
        </span>
        <div className="test-case-folder-select-wrap">
          <select
            className="test-case-folder-select"
            value={run.folderId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              void handleMoveToFolder(run.id, val === '' ? null : Number(val));
            }}
            aria-label={`Move ${run.name} to folder`}
          >
            <option value="">— Unfoldered —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="test-case-actions">
          <button
            type="button"
            className="test-case-btn test-case-btn--edit"
            onClick={() => navigate(`/service/testrun/${run.id}`)}
            aria-label={`Edit ${run.name}`}
          >
            <HiOutlinePencil aria-hidden="true" /> Edit
          </button>
          <Tooltip content={isLockedStatus(run.status) ? 'Locked test runs cannot be deleted' : undefined}>
            <button
              type="button"
              className="test-case-btn test-case-btn--delete"
              onClick={() => void handleDeleteRun(run.id, run.name)}
              disabled={isLockedStatus(run.status)}
              aria-label={`Delete ${run.name}`}
            >
              <HiOutlineTrash aria-hidden="true" /> Delete
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (!workspaceId && !loading) {
    return (
      <section className="page test-cases-page">
        <div className="test-cases-header"><h2>Test Runs</h2></div>
        <p className="test-cases-empty">No workspace selected. Create a workspace in <strong>Settings</strong>.</p>
      </section>
    );
  }

  const unfolderedRuns = runsByFolder.get(null) ?? [];

  return (
    <section className="page test-cases-page">
      <div className="test-cases-header">
        <h2>Test Runs</h2>
        <p className="test-cases-description">
          Workspace: <strong>{currentWorkspaceName}</strong>
        </p>
      </div>

      {error && <div className="test-cases-error" role="alert">{error}</div>}

      <div className="test-cases-toolbar">
        <div className="test-cases-sort">
          <span className="test-cases-sort-label">Sort runs:</span>
          <Tooltip content={loading ? 'Loading…' : undefined}>
            <button
              type="button"
              className="test-cases-sort-btn"
              onClick={() => setRunSortOrder(runSortOrder === 'asc' ? 'desc' : 'asc')}
              aria-pressed={runSortOrder === 'desc'}
              disabled={loading}
            >
              {runSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
            </button>
          </Tooltip>
        </div>
        <div className="test-cases-toolbar-actions">
          <Tooltip content={!workspaceId ? 'Select a workspace first' : undefined}>
            <button
              type="button"
              className="test-cases-create-btn test-cases-create-btn--secondary"
              onClick={openCreateFolderModal}
              disabled={!workspaceId || loading}
            >
              <HiOutlineFolderPlus aria-hidden="true" /> New folder
            </button>
          </Tooltip>
          <Tooltip content={!workspaceId ? 'Select a workspace first' : undefined}>
            <button
              type="button"
              className="test-cases-create-btn"
              onClick={() => openCreateRunModal()}
              disabled={!workspaceId || loading}
            >
              + Create test run
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="test-cases-list-wrap">
        {loading ? (
          <p className="test-cases-loading">Loading…</p>
        ) : testRuns.length === 0 && folders.length === 0 ? (
          <p className="test-cases-empty">No test runs yet. Use the button above to create one.</p>
        ) : (
          <>
            <div className="test-cases-expand-bar">
              <button type="button" className="test-cases-sort-btn" onClick={allExpanded ? collapseAll : expandAll}>
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            <div className="test-cases-tree" role="tree" aria-label="Test runs">

              {/* Named folders */}
              {sortedFolders.map((folder) => {
                const folderKey = String(folder.id);
                const isExpanded = expandedIds.has(folderKey);
                const folderRuns = runsByFolder.get(folder.id) ?? [];
                return (
                  <div key={folder.id} className="test-cases-tree-node" role="treeitem" aria-expanded={isExpanded}>
                    <div className="test-cases-tree-folder">
                      <button
                        type="button"
                        className="test-cases-tree-toggle"
                        onClick={() => toggleExpanded(folderKey)}
                        aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                      >
                        <span className="test-cases-tree-chevron" aria-hidden="true">
                          {isExpanded ? <HiChevronDown /> : <HiChevronRight />}
                        </span>
                      </button>
                      <HiOutlineFolder className="test-cases-tree-folder-icon" aria-hidden="true" />
                      <span className="test-cases-tree-folder-name">{folder.name}</span>
                      <span className="test-cases-tree-folder-count">({folderRuns.length})</span>
                      <div className="test-cases-tree-folder-actions">
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--edit"
                          onClick={() => openCreateRunModal(folder.id)}
                        >
                          + Add run
                        </button>
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--edit"
                          onClick={() => openEditFolderModal(folder)}
                          aria-label={`Rename folder ${folder.name}`}
                        >
                          <HiOutlinePencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--delete"
                          onClick={() => void handleDeleteFolder(folder)}
                          aria-label={`Delete folder ${folder.name}`}
                        >
                          <HiOutlineTrash aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="test-cases-tree-children" role="group">
                        {folderRuns.length === 0 ? (
                          <p className="test-cases-tree-empty">No test runs in this folder.</p>
                        ) : (
                          folderRuns.map(renderRunRow)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unfoldered */}
              {(unfolderedRuns.length > 0 || folders.length > 0) && (
                <div className="test-cases-tree-node" role="treeitem" aria-expanded={expandedIds.has('__unfoldered__')}>
                  <div className="test-cases-tree-folder">
                    <button
                      type="button"
                      className="test-cases-tree-toggle"
                      onClick={() => toggleExpanded('__unfoldered__')}
                    >
                      <span className="test-cases-tree-chevron" aria-hidden="true">
                        {expandedIds.has('__unfoldered__') ? <HiChevronDown /> : <HiChevronRight />}
                      </span>
                    </button>
                    <HiOutlineFolder className="test-cases-tree-folder-icon test-cases-tree-folder-icon--muted" aria-hidden="true" />
                    <span className="test-cases-tree-folder-name test-cases-tree-folder-name--muted">Unfoldered</span>
                    <span className="test-cases-tree-folder-count">({unfolderedRuns.length})</span>
                    <div className="test-cases-tree-folder-actions">
                      <button
                        type="button"
                        className="test-case-btn test-case-btn--edit"
                        onClick={() => openCreateRunModal()}
                      >
                        + Add run
                      </button>
                    </div>
                  </div>
                  {expandedIds.has('__unfoldered__') && (
                    <div className="test-cases-tree-children" role="group">
                      {unfolderedRuns.length === 0 ? (
                        <p className="test-cases-tree-empty">No unfoldered test runs.</p>
                      ) : (
                        unfolderedRuns.map(renderRunRow)
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create Test Run Modal */}
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
            <p className="modal-subtitle">Workspace: <strong>{currentWorkspaceName}</strong></p>
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
                  <option value="" disabled>No test cases in this workspace</option>
                ) : (
                  allTestCases.map((tc) => (
                    <option key={tc.id} value={tc.id}>{tc.name}</option>
                  ))
                )}
              </select>
              {folders.length > 0 && (
                <>
                  <label htmlFor="run-folder" className="modal-label">
                    Folder <span className="modal-label-hint">(optional)</span>
                  </label>
                  <select
                    id="run-folder"
                    className="modal-input"
                    value={formFolderId}
                    onChange={(e) => setFormFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">— Unfoldered —</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </>
              )}
              {error && <p className="modal-error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeRunModal}>
                  Cancel
                </button>
                <Tooltip content={allTestCases.length === 0 ? 'No test cases in this workspace' : undefined}>
                  <button
                    type="submit"
                    className="modal-btn modal-btn--primary"
                    disabled={submitting || allTestCases.length === 0}
                  >
                    {submitting && <span className="btn-spinner" aria-hidden="true" />}
                    {submitting ? 'Creating…' : 'Create'}
                  </button>
                </Tooltip>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create/Edit Folder Modal */}
      {folderModalOpen && (
        <div className="modal-overlay" onClick={closeFolderModal} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-folder-modal-title"
          >
            <h3 id="run-folder-modal-title" className="modal-title">
              {editingFolderId ? 'Rename folder' : 'Create folder'}
            </h3>
            <form onSubmit={handleFolderSubmit} className="modal-form">
              <label htmlFor="run-folder-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="run-folder-name"
                type="text"
                className="modal-input"
                value={folderFormName}
                onChange={(e) => setFolderFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. Sprint 14"
                required
                autoFocus
              />
              {folderError && <p className="modal-error" role="alert">{folderError}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeFolderModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--primary" disabled={folderSubmitting}>
                  {folderSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                  {folderSubmitting ? 'Saving…' : (editingFolderId ? 'Save' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
