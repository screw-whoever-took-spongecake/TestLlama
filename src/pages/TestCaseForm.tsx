import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { HiOutlineTrash } from 'react-icons/hi2';
import { useToast } from '../components/Toast';
import { useSettings } from '../contexts/SettingsContext';
import StepAttachmentsUpload from '../components/StepAttachmentsUpload';
import type { JiraLink, TestCaseStep, StepAttachment } from '../types/testCase';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import type { DashboardOutletContext } from '../components/DashboardContent';

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

/** Internal step type with a stable client-side uid for animation keys. */
interface StepWithUid extends TestCaseStep {
  uid: number;
  attachmentError?: string;
}

let nextUid = 1;
function assignUid(step: TestCaseStep): StepWithUid {
  return { ...step, uid: nextUid++ };
}

function emptyStep(position: number): StepWithUid {
  return { uid: nextUid++, position, stepDescription: '', expectedResults: '', attachments: [] };
}

// ─── Main TestCaseForm ─────────────────────────────────────────────────────

/**
 * Dedicated page for viewing/editing a single test case.
 * Route: /service/testcase/:testCaseId
 */
export default function TestCaseForm(): ReactElement {
  const { testCaseId } = useParams<{ testCaseId: string }>();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { setActiveTab } = useOutletContext<DashboardOutletContext>();
  const { setOverride } = useBreadcrumb();

  const [steps, setSteps] = useState<StepWithUid[]>([emptyStep(1)]);
  const [testCaseName, setTestCaseName] = useState('');
  const [testCaseProjectId, setTestCaseProjectId] = useState<number | null>(null);
  const [testCaseProjectName, setTestCaseProjectName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // FLIP animation refs
  const stepElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevRectsRef = useRef<Map<number, DOMRect>>(new Map());

  // Jira links state
  const [jiraLinks, setJiraLinks] = useState<JiraLink[]>([]);
  const [jiraKeyInput, setJiraKeyInput] = useState('');
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);

  /** Snapshot current positions before a reorder. */
  function snapshotPositions(): void {
    const rects = new Map<number, DOMRect>();
    stepElsRef.current.forEach((el, uid) => {
      rects.set(uid, el.getBoundingClientRect());
    });
    prevRectsRef.current = rects;
  }

  /** After render, FLIP-animate any elements that moved. */
  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    if (prev.size === 0) return;

    stepElsRef.current.forEach((el, uid) => {
      const oldRect = prev.get(uid);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) < 1) return;

      el.animate(
        [
          { transform: `translateY(${deltaY}px)`, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' },
          { transform: 'translateY(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
        ],
        { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none' }
      );
    });

    prevRectsRef.current = new Map();
  }, [steps]);

  // Load test case data
  const fetchTestCase = useCallback(async () => {
    if (!testCaseId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/service/test-cases/${encodeURIComponent(testCaseId)}`);
      if (!res.ok) throw new Error('Failed to load test case');
      const data = await res.json();
      const name = data.name ?? '';
      const rawSteps: { stepDescription: string; expectedResults: string; attachments: StepAttachment[] }[] =
        Array.isArray(data.steps) && data.steps.length > 0
        ? data.steps.map((s: TestCaseStep) => ({
            stepDescription: s.stepDescription ?? '',
            expectedResults: s.expectedResults ?? '',
            attachments: Array.isArray(s.attachments) ? s.attachments as StepAttachment[] : [] as StepAttachment[],
          }))
        : [{ stepDescription: '', expectedResults: '', attachments: [] as StepAttachment[] }];

      setTestCaseName(name);
      setTestCaseProjectId(data.projectId ?? null);
      setTestCaseProjectName(data.projectName ?? null);
      setSteps(
        rawSteps.map((s, i) =>
          assignUid({ position: i + 1, stepDescription: s.stepDescription, expectedResults: s.expectedResults, attachments: s.attachments })
        )
      );
    } catch {
      setLoadError('Failed to load test case');
    } finally {
      setLoading(false);
    }
  }, [testCaseId]);

  useEffect(() => {
    fetchTestCase();
  }, [fetchTestCase]);

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!testCaseName) return;
    const goToTestCases = (): void => {
      setActiveTab('test-cases');
      navigate('/');
    };
    const segments = [
      ...(testCaseProjectName ? [{ label: testCaseProjectName, onClick: goToTestCases }] : []),
      { label: 'Test Cases', onClick: goToTestCases },
      { label: `${testCaseId} · ${testCaseName}` },
    ];
    setOverride(segments);
    return () => setOverride(null);
  }, [testCaseName, testCaseProjectName, testCaseId, setOverride, setActiveTab, navigate]);

  const fetchJiraLinks = useCallback(async () => {
    if (!testCaseId) return;
    setJiraLoading(true);
    setJiraError(null);
    try {
      const res = await fetch(`/service/jira/links?testCaseId=${encodeURIComponent(testCaseId)}`);
      if (res.ok) {
        const data: JiraLink[] = await res.json();
        setJiraLinks(Array.isArray(data) ? data : []);
      }
    } catch {
      setJiraError('Failed to load Jira links');
    } finally {
      setJiraLoading(false);
    }
  }, [testCaseId]);

  useEffect(() => {
    fetchJiraLinks();
  }, [fetchJiraLinks]);

  // Step text field management
  function handleStepChange(index: number, field: 'stepDescription' | 'expectedResults', value: string): void {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, [field]: value } : step))
    );
  }

  // Attachment management
  function handleAttachmentsChange(index: number, attachments: StepAttachment[]): void {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, attachments } : step))
    );
  }

  function handleAttachmentError(index: number, msg: string | undefined): void {
    // Error-only update — does not change saved data, so no dirty mark
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, attachmentError: msg } : step))
    );
  }

  function handleAddStep(): void {
    setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddStep();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleMoveStepUp(index: number): void {
    if (index <= 0) return;
    snapshotPositions();
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((step, i) => ({ ...step, position: i + 1 }));
    });
  }

  function handleMoveStepDown(index: number): void {
    snapshotPositions();
    setSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((step, i) => ({ ...step, position: i + 1 }));
    });
  }

  function handleDeleteStep(index: number): void {
    const confirmed = window.confirm(`Are you sure you want to delete Step ${index + 1}?`);
    if (!confirmed) return;
    setSteps((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.map((step, i) => ({ ...step, position: i + 1 }));
    });
  }

  async function handleAddJiraLink(): Promise<void> {
    const key = jiraKeyInput.trim().toUpperCase();
    if (!key) return;
    if (!JIRA_KEY_PATTERN.test(key)) {
      setJiraError('Enter a valid Jira issue key (e.g. PROJ-123)');
      return;
    }
    setJiraError(null);
    try {
      const res = await fetch('/service/jira/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCaseId, jiraIssueKey: key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to link');
      }
      setJiraKeyInput('');
      await fetchJiraLinks();
    } catch (err) {
      setJiraError(err instanceof Error ? err.message : 'Failed to link');
    }
  }

  async function handleRemoveJiraLink(linkId: number): Promise<void> {
    setJiraError(null);
    try {
      const res = await fetch(`/service/jira/links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink');
      await fetchJiraLinks();
    } catch (err) {
      setJiraError(err instanceof Error ? err.message : 'Failed to unlink');
    }
  }

  async function handleSave(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!testCaseId || testCaseProjectId == null) return;
    setSaving(true);
    try {
      const res = await fetch(`/service/test-cases/${encodeURIComponent(testCaseId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testCaseName,
          projectId: testCaseProjectId,
          steps: steps.map((s) => ({
            stepDescription: s.stepDescription,
            expectedResults: s.expectedResults,
            attachments: s.attachments,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to save');
      }
      const saved = await res.json();

      // Sync steps back from server to pick up any server-assigned IDs
      if (Array.isArray(saved.steps) && saved.steps.length > 0) {
        setSteps(
          saved.steps.map((s: TestCaseStep, i: number) =>
            assignUid({
              id: s.id,
              position: i + 1,
              stepDescription: s.stepDescription ?? '',
              expectedResults: s.expectedResults ?? '',
              attachments: Array.isArray(s.attachments) ? s.attachments : [],
            })
          )
        );
      }
      showToast('Test case saved successfully');
    } catch (err) {
      console.error('Save failed:', err);
      showToast(err instanceof Error ? err.message : 'Failed to save test case', 'error');
    } finally {
      setSaving(false);
    }
  }

  /** Register a step DOM element for FLIP tracking. */
  function stepRef(uid: number) {
    return (el: HTMLDivElement | null) => {
      if (el) stepElsRef.current.set(uid, el);
      else stepElsRef.current.delete(uid);
    };
  }

  if (loading) {
    return (
      <section className="page page--full-width">
        <p>Loading test case...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="page page--full-width">
        <p className="error-text">{loadError}</p>
      </section>
    );
  }

  return (
    <section className="page page--full-width">
      <div className="test-case-header-row">
        <h2>Test case {testCaseId ?? ''}</h2>

        {/* Linked Jira Issues — inline in header */}
        <div className="jira-links-inline">
          {jiraError && (
            <span className="jira-links-error" role="alert">{jiraError}</span>
          )}

          {jiraLoading ? (
            <span className="jira-links-loading">Loading…</span>
          ) : jiraLinks.length === 0 ? (
            <span className="jira-links-empty">No linked Jira issues.</span>
          ) : (
            jiraLinks.map((link) => (
              <span key={link.id} className="jira-link-chip">
                <a
                  href={
                    settings.jiraBaseUrl
                      ? `${settings.jiraBaseUrl}/browse/${link.jiraIssueKey}`
                      : undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`jira-link-chip-key${!settings.jiraBaseUrl ? ' jira-link-chip-key--no-url' : ''}`}
                  title={
                    settings.jiraBaseUrl
                      ? `Open ${link.jiraIssueKey} in Jira`
                      : 'Set a Jira Base URL in Settings to enable this link'
                  }
                >
                  {link.jiraIssueKey}
                </a>
                <button
                  type="button"
                  className="jira-link-chip-remove"
                  onClick={() => handleRemoveJiraLink(link.id)}
                  aria-label={`Unlink ${link.jiraIssueKey}`}
                  title="Unlink"
                >
                  ×
                </button>
              </span>
            ))
          )}

          <input
            type="text"
            className="modal-input jira-links-input"
            placeholder="PROJ-123"
            value={jiraKeyInput}
            onChange={(e) => setJiraKeyInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddJiraLink();
              }
            }}
          />
          <button
            type="button"
            className="modal-btn modal-btn--primary jira-links-add-btn"
            onClick={handleAddJiraLink}
          >
            Link
          </button>
        </div>
      </div>

      <hr className="section-divider" />

      <form ref={formRef} onSubmit={handleSave} className="test-case-form">
        {steps.map((step, index) => (
          <div
            key={step.uid}
            ref={stepRef(step.uid)}
            className="test-case-step-block"
          >
            <div className="test-case-step-header">
              <span className="test-case-step-number">Step {index + 1}</span>
              <div className="test-case-step-header-actions">
                <button
                  type="button"
                  className="test-case-step-move-btn"
                  onClick={() => handleMoveStepUp(index)}
                  disabled={index === 0}
                  title={index === 0 ? 'Already the first step' : `Move step ${index + 1} up`}
                  aria-label={`Move step ${index + 1} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="test-case-step-move-btn"
                  onClick={() => handleMoveStepDown(index)}
                  disabled={index === steps.length - 1}
                  title={index === steps.length - 1 ? 'Already the last step' : `Move step ${index + 1} down`}
                  aria-label={`Move step ${index + 1} down`}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="test-case-step-delete-btn"
                  onClick={() => handleDeleteStep(index)}
                  disabled={steps.length <= 1}
                  title={steps.length <= 1 ? 'Cannot delete the only step' : `Delete step ${index + 1}`}
                  aria-label={`Delete step ${index + 1}`}
                >
                  <HiOutlineTrash aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="test-case-step-row">
              <div className="test-case-step-col">
                <label
                  htmlFor={`step-action-${step.uid}`}
                  className="test-case-step-label"
                >
                  Step description
                </label>
                <textarea
                  id={`step-action-${step.uid}`}
                  className="modal-input test-case-step-textarea"
                  value={step.stepDescription}
                  onChange={(e) => handleStepChange(index, 'stepDescription', e.target.value)}
                  placeholder="What user should do"
                  rows={3}
                />
              </div>

              <div className="test-case-step-col">
                <label
                  htmlFor={`step-expected-${step.uid}`}
                  className="test-case-step-label"
                >
                  Expected results
                </label>
                <textarea
                  id={`step-expected-${step.uid}`}
                  className="modal-input test-case-step-textarea"
                  value={step.expectedResults}
                  onChange={(e) => handleStepChange(index, 'expectedResults', e.target.value)}
                  placeholder="What should happen"
                  rows={3}
                />
              </div>
            </div>

            <StepAttachmentsUpload
              uid={step.uid}
              attachments={step.attachments}
              error={step.attachmentError}
              onChange={(a) => handleAttachmentsChange(index, a)}
              onError={(msg) => handleAttachmentError(index, msg)}
            />
          </div>
        ))}

        <div className="test-case-step-add-row">
          <button
            type="button"
            className="modal-btn modal-btn--secondary test-case-step-add-btn"
            onClick={handleAddStep}
          >
            + Add step
          </button>
          <span className="test-case-step-add-hint">
            or press {navigator.userAgent.includes('Mac') ? '⌘ / Ctrl' : 'Ctrl'} + Enter
          </span>
        </div>

        <div className="test-case-form-actions">
          <button
            type="submit"
            className="modal-btn modal-btn--primary"
            disabled={saving}
          >
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="test-case-save-hint">
            or press {navigator.userAgent.includes('Mac') ? '⌘ / Ctrl' : 'Ctrl'} + S
          </span>
        </div>
      </form>
    </section>
  );
}
