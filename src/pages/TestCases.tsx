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
import type { TestCase, TestCaseFolder } from '../types/testCase';
import { useWorkspace } from '../contexts/WorkspaceContext';
import Tooltip from '../components/Tooltip';

const API = '/service';
const NAME_MAX_LENGTH = 50;

const LS_KEY_EXPANDED = 'tc_expandedFolderIds';
const LS_KEY_CASE_SORT = 'tc_caseSortOrder';

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

export default function TestCases(): ReactElement {
  const navigate = useNavigate();
  const { workspaceId, workspaces } = useWorkspace();

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [folders, setFolders] = useState<TestCaseFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => loadExpandedSet(LS_KEY_EXPANDED));
  const [caseSortOrder, setCaseSortOrder] = useState<'asc' | 'desc'>(() => loadSort(LS_KEY_CASE_SORT));

  // Create test case modal
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFolderId, setFormFolderId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [caseFormError, setCaseFormError] = useState<string | null>(null);

  // Create folder modal
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
      const [casesRes, foldersRes] = await Promise.all([
        fetch(`${API}/test-cases?projectId=${workspaceId}`, { signal: controller.signal }),
        fetch(`${API}/test-case-folders?projectId=${workspaceId}`, { signal: controller.signal }),
      ]);
      const cases: TestCase[] = casesRes.ok ? await casesRes.json() : [];
      const flds: TestCaseFolder[] = foldersRes.ok ? await foldersRes.json() : [];
      setTestCases(Array.isArray(cases) ? cases : []);
      setFolders(Array.isArray(flds) ? flds : []);

      // Auto-expand all folder groups on first load
      setExpandedIds((prev) => {
        if (prev.size === 0 && !localStorage.getItem(LS_KEY_EXPANDED)) {
          const ids = new Set(['__unfoldered__', ...flds.map((f) => String(f.id))]);
          return ids;
        }
        return prev;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to load test cases');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
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
    localStorage.setItem(LS_KEY_CASE_SORT, caseSortOrder);
  }, [caseSortOrder]);

  function toggleExpanded(key: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const sortedCases = useMemo(() => {
    const cmp = (a: TestCase, b: TestCase) => {
      const diff = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return caseSortOrder === 'asc' ? diff : -diff;
    };
    return [...testCases].sort(cmp);
  }, [testCases, caseSortOrder]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [folders]
  );

  const casesByFolder = useMemo(() => {
    const map = new Map<number | null, TestCase[]>();
    for (const tc of sortedCases) {
      const key = tc.folderId ?? null;
      const list = map.get(key) ?? [];
      list.push(tc);
      map.set(key, list);
    }
    return map;
  }, [sortedCases]);

  const allGroupKeys = useMemo(
    () => ['__unfoldered__', ...sortedFolders.map((f) => String(f.id))],
    [sortedFolders]
  );
  const allExpanded = allGroupKeys.length > 0 && allGroupKeys.every((k) => expandedIds.has(k));

  function expandAll(): void { setExpandedIds(new Set(allGroupKeys)); }
  function collapseAll(): void { setExpandedIds(new Set()); }

  // ── Create/Edit test case ────────────────────────────────────────────────

  function openCreateCaseModal(folderId?: number): void {
    setEditingCaseId(null);
    setFormName('');
    setFormFolderId(folderId ?? '');
    setCaseModalOpen(true);
  }

  function closeCaseModal(): void {
    setCaseModalOpen(false);
    setEditingCaseId(null);
    setFormName('');
    setFormFolderId('');
    setCaseFormError(null);
  }

  async function handleCaseSubmit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = formName.trim();
    if (!name || !workspaceId) return;
    setCaseFormError(null);
    setSubmitting(true);
    try {
      if (editingCaseId) {
        const res = await fetch(`${API}/test-cases/${editingCaseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId: workspaceId }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(`${API}/test-cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId: workspaceId }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Create failed');
        }
        // If a folder was selected, assign it
        if (formFolderId !== '') {
          const created: TestCase = await res.json();
          await fetch(`${API}/test-cases/${created.id}/folder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: formFolderId }),
          });
        }
      }
      closeCaseModal();
      await fetchData();
    } catch (err) {
      setCaseFormError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
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
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleMoveToFolder(caseId: string, folderId: number | null): Promise<void> {
    try {
      const res = await fetch(`${API}/test-cases/${caseId}/folder`, {
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
      setError(err instanceof Error ? err.message : 'Failed to move test case');
    }
  }

  // ── Create/Edit/Delete folders ───────────────────────────────────────────

  function openCreateFolderModal(): void {
    setEditingFolderId(null);
    setFolderFormName('');
    setFolderError(null);
    setFolderModalOpen(true);
  }

  function openEditFolderModal(folder: TestCaseFolder): void {
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
        const res = await fetch(`${API}/test-case-folders/${editingFolderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch((): { error?: string } => ({}));
          throw new Error(data.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(`${API}/test-case-folders`, {
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

  async function handleDeleteFolder(folder: TestCaseFolder): Promise<void> {
    const count = casesByFolder.get(folder.id)?.length ?? 0;
    const msg = count > 0
      ? `Delete folder "${folder.name}"? Its ${count} test case(s) will be moved to Unfoldered.`
      : `Delete folder "${folder.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch(`${API}/test-case-folders/${folder.id}`, { method: 'DELETE' });
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

  function renderCaseRow(tc: TestCase) {
    return (
      <div key={tc.id} className="test-case-row test-case-row--child" role="treeitem">
        <span className="test-case-id" title="Test case ID">{tc.id}</span>
        <span className="test-case-name">
          {tc.name}
          {tc.jiraIssueKeys && tc.jiraIssueKeys.length > 0 && (
            <Tooltip content={tc.jiraIssueKeys.join(', ')} position="bottom">
              <span className="jira-badge">
                <svg className="jira-badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.005 2c5.523 0 10 4.477 10 10s-4.477 10-10 10-10-4.477-10-10 4.477-10 10-10zm0 4a1 1 0 00-1 1v4.586l-2.293-2.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414l-2.293 2.293V7a1 1 0 00-1-1z" />
                </svg>
                {tc.jiraIssueKeys.length}
              </span>
            </Tooltip>
          )}
        </span>
        <div className="test-case-folder-select-wrap">
          <select
            className="test-case-folder-select"
            value={tc.folderId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              void handleMoveToFolder(tc.id, val === '' ? null : Number(val));
            }}
            aria-label={`Move ${tc.name} to folder`}
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
            onClick={() => navigate(`/service/testcase/${tc.id}`)}
            aria-label={`Edit ${tc.name}`}
          >
            <HiOutlinePencil aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            className="test-case-btn test-case-btn--delete"
            onClick={() => void handleDeleteCase(tc.id)}
            aria-label={`Delete ${tc.name}`}
          >
            <HiOutlineTrash aria-hidden="true" /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (!workspaceId && !loading) {
    return (
      <section className="page test-cases-page">
        <div className="test-cases-header">
          <h2>Test Cases</h2>
        </div>
        <p className="test-cases-empty">No workspace selected. Create a workspace in <strong>Settings</strong>.</p>
      </section>
    );
  }

  const unfolderedCases = casesByFolder.get(null) ?? [];

  return (
    <section className="page test-cases-page">
      <div className="test-cases-header">
        <h2>Test Cases</h2>
        <p className="test-cases-description">
          Workspace: <strong>{currentWorkspaceName}</strong>
        </p>
      </div>

      {error && <div className="test-cases-error" role="alert">{error}</div>}

      <div className="test-cases-toolbar">
        <div className="test-cases-sort">
          <span className="test-cases-sort-label">Sort cases:</span>
          <Tooltip content={loading ? 'Loading…' : undefined}>
            <button
              type="button"
              className="test-cases-sort-btn"
              onClick={() => setCaseSortOrder(caseSortOrder === 'asc' ? 'desc' : 'asc')}
              aria-pressed={caseSortOrder === 'desc'}
              disabled={loading}
            >
              {caseSortOrder === 'asc' ? 'A → Z' : 'Z → A'}
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
              onClick={() => openCreateCaseModal()}
              disabled={!workspaceId || loading}
            >
              + Create test case
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="test-cases-list-wrap">
        {loading ? (
          <p className="test-cases-loading">Loading…</p>
        ) : testCases.length === 0 && folders.length === 0 ? (
          <p className="test-cases-empty">No test cases yet. Use the button above to create one.</p>
        ) : (
          <>
            <div className="test-cases-expand-bar">
              <button
                type="button"
                className="test-cases-sort-btn"
                onClick={allExpanded ? collapseAll : expandAll}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            <div className="test-cases-tree" role="tree" aria-label="Test cases">

              {/* Named folders */}
              {sortedFolders.map((folder) => {
                const folderKey = String(folder.id);
                const isExpanded = expandedIds.has(folderKey);
                const folderCases = casesByFolder.get(folder.id) ?? [];
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
                      <span className="test-cases-tree-folder-count">({folderCases.length})</span>
                      <div className="test-cases-tree-folder-actions">
                        <button
                          type="button"
                          className="test-case-btn test-case-btn--edit"
                          onClick={() => openCreateCaseModal(folder.id)}
                        >
                          + Add case
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
                        {folderCases.length === 0 ? (
                          <p className="test-cases-tree-empty">No test cases in this folder.</p>
                        ) : (
                          folderCases.map(renderCaseRow)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unfoldered group */}
              {(unfolderedCases.length > 0 || folders.length > 0) && (
                <div className="test-cases-tree-node" role="treeitem" aria-expanded={expandedIds.has('__unfoldered__')}>
                  <div className="test-cases-tree-folder">
                    <button
                      type="button"
                      className="test-cases-tree-toggle"
                      onClick={() => toggleExpanded('__unfoldered__')}
                      aria-label={expandedIds.has('__unfoldered__') ? 'Collapse Unfoldered' : 'Expand Unfoldered'}
                    >
                      <span className="test-cases-tree-chevron" aria-hidden="true">
                        {expandedIds.has('__unfoldered__') ? <HiChevronDown /> : <HiChevronRight />}
                      </span>
                    </button>
                    <HiOutlineFolder className="test-cases-tree-folder-icon test-cases-tree-folder-icon--muted" aria-hidden="true" />
                    <span className="test-cases-tree-folder-name test-cases-tree-folder-name--muted">Unfoldered</span>
                    <span className="test-cases-tree-folder-count">({unfolderedCases.length})</span>
                    <div className="test-cases-tree-folder-actions">
                      <button
                        type="button"
                        className="test-case-btn test-case-btn--edit"
                        onClick={() => openCreateCaseModal()}
                      >
                        + Add case
                      </button>
                    </div>
                  </div>
                  {expandedIds.has('__unfoldered__') && (
                    <div className="test-cases-tree-children" role="group">
                      {unfolderedCases.length === 0 ? (
                        <p className="test-cases-tree-empty">No unfoldered test cases.</p>
                      ) : (
                        unfolderedCases.map(renderCaseRow)
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </>
        )}
      </div>

      {/* Create/Edit Test Case Modal */}
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
            <p className="modal-subtitle">Workspace: <strong>{currentWorkspaceName}</strong></p>
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
              {!editingCaseId && folders.length > 0 && (
                <>
                  <label htmlFor="test-case-folder" className="modal-label">
                    Folder <span className="modal-label-hint">(optional)</span>
                  </label>
                  <select
                    id="test-case-folder"
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
              {caseFormError && <p className="modal-error" role="alert">{caseFormError}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--secondary" onClick={closeCaseModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--primary" disabled={submitting}>
                  {submitting && <span className="btn-spinner" aria-hidden="true" />}
                  {submitting ? 'Saving…' : (editingCaseId ? 'Save' : 'Create')}
                </button>
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
            aria-labelledby="folder-modal-title"
          >
            <h3 id="folder-modal-title" className="modal-title">
              {editingFolderId ? 'Rename folder' : 'Create folder'}
            </h3>
            <form onSubmit={handleFolderSubmit} className="modal-form">
              <label htmlFor="folder-name" className="modal-label">
                Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
              </label>
              <input
                id="folder-name"
                type="text"
                className="modal-input"
                value={folderFormName}
                onChange={(e) => setFolderFormName(clampName(e.target.value))}
                maxLength={NAME_MAX_LENGTH}
                placeholder="e.g. Authentication"
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
