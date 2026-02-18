import React, { useEffect, useState, useCallback } from 'react';
import { invoke, view } from '@forge/bridge';

interface LinkedTestCase {
  id: number;
  testCaseId: string;
  jiraIssueKey: string;
  createdAt: string;
  testCaseName?: string;
  projectId?: number;
}

interface Project {
  id: number;
  name: string;
  testCases: { id: string; name: string }[];
}

type View = 'list' | 'link' | 'create';

export default function App(): React.ReactElement {
  const [issueKey, setIssueKey] = useState<string>('');
  const [linkedCases, setLinkedCases] = useState<LinkedTestCase[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('list');

  // Link existing form
  const [linkTestCaseId, setLinkTestCaseId] = useState('');

  // Create new form
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState<number | ''>('');

  const [submitting, setSubmitting] = useState(false);

  const fetchLinkedCases = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<LinkedTestCase[]>('getLinkedTestCases', { issueKey: key });
      setLinkedCases(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load linked test cases');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await invoke<Project[]>('getProjects', {});
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (list.length > 0 && newProjectId === '') {
        setNewProjectId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  }, [newProjectId]);

  useEffect(() => {
    (async () => {
      try {
        const context = await view.getContext();
        const key = (context as { extension?: { issue?: { key?: string } } })?.extension?.issue?.key ?? '';
        setIssueKey(key);
        await Promise.all([fetchLinkedCases(key), fetchProjects()]);
      } catch (err) {
        setError('Failed to load context');
        console.error(err);
        setLoading(false);
      }
    })();
  }, [fetchLinkedCases, fetchProjects]);

  async function handleUnlink(linkId: number): Promise<void> {
    setError(null);
    try {
      await invoke('unlinkTestCase', { linkId });
      await fetchLinkedCases(issueKey);
    } catch (err) {
      setError('Failed to unlink');
      console.error(err);
    }
  }

  async function handleLink(): Promise<void> {
    if (!linkTestCaseId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await invoke('linkTestCase', {
        testCaseId: linkTestCaseId.trim(),
        jiraIssueKey: issueKey,
      });
      setLinkTestCaseId('');
      setCurrentView('list');
      await fetchLinkedCases(issueKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate(): Promise<void> {
    if (!newName.trim() || newProjectId === '') return;
    setSubmitting(true);
    setError(null);
    try {
      await invoke('createTestCase', {
        name: newName.trim(),
        projectId: newProjectId,
        jiraIssueKey: issueKey,
      });
      setNewName('');
      setCurrentView('list');
      await fetchLinkedCases(issueKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>TestLlama</h3>
        {currentView === 'list' && (
          <div style={styles.headerActions}>
            <button style={styles.btnSmall} onClick={() => setCurrentView('link')}>
              Link existing
            </button>
            <button style={{ ...styles.btnSmall, ...styles.btnPrimary }} onClick={() => setCurrentView('create')}>
              + New test case
            </button>
          </div>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {currentView === 'list' && (
        <div>
          {loading ? (
            <p style={styles.muted}>Loading…</p>
          ) : linkedCases.length === 0 ? (
            <p style={styles.muted}>No linked test cases yet.</p>
          ) : (
            <ul style={styles.list}>
              {linkedCases.map((tc) => (
                <li key={tc.id} style={styles.listItem}>
                  <div style={styles.listItemInfo}>
                    <span style={styles.tcId}>{tc.testCaseId}</span>
                    <span style={styles.tcName}>{tc.testCaseName || '(unnamed)'}</span>
                  </div>
                  <div style={styles.listItemActions}>
                    <a
                      href={`/service/testcase/${tc.testCaseId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.linkBtn}
                    >
                      View
                    </a>
                    <button
                      style={styles.removeBtn}
                      onClick={() => handleUnlink(tc.id)}
                      title="Unlink"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {currentView === 'link' && (
        <div style={styles.formSection}>
          <h4 style={styles.formTitle}>Link existing test case</h4>
          <label style={styles.label}>
            Test Case ID
            <input
              style={styles.input}
              type="text"
              placeholder="TC-5"
              value={linkTestCaseId}
              onChange={(e) => setLinkTestCaseId(e.target.value)}
            />
          </label>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setCurrentView('list')} disabled={submitting}>
              Cancel
            </button>
            <button style={{ ...styles.btnSmall, ...styles.btnPrimary }} onClick={handleLink} disabled={submitting}>
              {submitting ? 'Linking…' : 'Link'}
            </button>
          </div>
        </div>
      )}

      {currentView === 'create' && (
        <div style={styles.formSection}>
          <h4 style={styles.formTitle}>Create and link new test case</h4>
          <label style={styles.label}>
            Name
            <input
              style={styles.input}
              type="text"
              placeholder="e.g. Verify login flow"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
            />
          </label>
          <label style={styles.label}>
            Project
            <select
              style={styles.input}
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setCurrentView('list')} disabled={submitting}>
              Cancel
            </button>
            <button style={{ ...styles.btnSmall, ...styles.btnPrimary }} onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create & Link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    padding: '12px',
    color: '#172b4d',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
  },
  headerActions: {
    display: 'flex',
    gap: '6px',
  },
  error: {
    padding: '8px 10px',
    marginBottom: '10px',
    background: '#ffebe6',
    color: '#bf2600',
    borderRadius: '4px',
    fontSize: '13px',
  },
  muted: {
    color: '#6b778c',
    fontSize: '13px',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #dfe1e6',
  },
  listItemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
  },
  tcId: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    color: '#6b778c',
    flexShrink: 0,
  },
  tcName: {
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  listItemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  linkBtn: {
    fontSize: '12px',
    color: '#0052cc',
    textDecoration: 'none',
  },
  removeBtn: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#6b778c',
    fontSize: '16px',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  btnSmall: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #dfe1e6',
    background: '#fafbfc',
    color: '#172b4d',
    fontSize: '12px',
    cursor: 'pointer',
  },
  btnPrimary: {
    background: '#0052cc',
    color: '#fff',
    border: 'none',
  },
  btnSecondary: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #dfe1e6',
    background: '#fafbfc',
    color: '#172b4d',
    fontSize: '12px',
    cursor: 'pointer',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  formTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
  },
  label: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b778c',
  },
  input: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #dfe1e6',
    fontSize: '14px',
    color: '#172b4d',
    fontFamily: 'inherit',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px',
    marginTop: '4px',
  },
};
