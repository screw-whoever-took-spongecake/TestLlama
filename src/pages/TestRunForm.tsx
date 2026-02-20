import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import StepAttachmentsUpload from '../components/StepAttachmentsUpload';
import ImageLightbox from '../components/ImageLightbox';
import Tooltip from '../components/Tooltip';
import { useSettings } from '../contexts/SettingsContext';
import type { TestRun, TestRunStep, TestRunStatus, StepStatus, TestRunJiraLink } from '../types/testRun';
import { isLockedStatus } from '../types/testRun';
import type { StepAttachment } from '../types/testCase';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

const STATUS_OPTIONS: { value: TestRunStatus; label: string }[] = [
  { value: 'ready_to_test', label: 'Ready to Test' },
  { value: 'in_progress',   label: 'In Progress' },
  { value: 'passed',        label: 'Passed' },
  { value: 'failed',        label: 'Failed' },
  { value: 'na',            label: 'N/A' },
];

const STEP_STATUS_OPTIONS: { value: StepStatus; label: string }[] = [
  { value: 'not_run',                 label: 'Not Run' },
  { value: 'passed',                  label: 'Passed' },
  { value: 'failed',                  label: 'Failed' },
  { value: 'na',                      label: 'N/A' },
  { value: 'passed_with_improvements', label: 'Passed w/ Improvements' },
];

const STEP_IMMUTABLE_TITLE = 'Step content copied from test case and cannot be edited';
const LOCKED_STEP_TITLE    = 'Passed and Failed test runs cannot be edited';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface EditableStep extends TestRunStep {
  attachmentError?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function TestRunForm(): ReactElement {
  const { testRunId } = useParams<{ testRunId: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { setOverride } = useBreadcrumb();
  const { settings } = useSettings();

  const [run, setRun]         = useState<TestRun | null>(null);
  const [steps, setSteps]     = useState<EditableStep[]>([]);
  const [status, setStatus]   = useState<TestRunStatus>('ready_to_test');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  // Jira links state
  const [jiraLinks, setJiraLinks]       = useState<TestRunJiraLink[]>([]);
  const [jiraKeyInput, setJiraKeyInput] = useState('');
  const [jiraLoading, setJiraLoading]   = useState(false);
  const [jiraError, setJiraError]       = useState<string | null>(null);

  // Used to skip the auto-save effect that fires when data first loads.
  const loadedRef      = useRef(false);
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks the status that was last successfully persisted to the DB.
  // doSave uses this to decide whether steps should be included: steps are only
  // saved when the run was NOT locked at the time of the last save. This ensures
  // that a status change is the only thing that can happen while locked, and that
  // any step edits made before transitioning TO a locked status are flushed.
  const lastSavedStatusRef = useRef<TestRunStatus>('ready_to_test');

  // ── cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);
    };
  }, []);

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchRun = useCallback(async () => {
    if (!testRunId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/service/test-runs/${encodeURIComponent(testRunId)}`);
      if (!res.ok) throw new Error('Failed to load test run');
      const data: TestRun & { steps: TestRunStep[] } = await res.json();
      // Reset the guard here — after the await — so it is still false when the
      // auto-save effect fires after the state updates below are applied. Setting
      // it before the fetch (as before) let the initial-mount effect consume the
      // false first, leaving the guard true by the time real data arrived.
      loadedRef.current = false;
      setRun(data);
      setStatus(data.status);
      lastSavedStatusRef.current = data.status;
      setSteps(
        Array.isArray(data.steps)
          ? data.steps.map((s) => ({ ...s, stepStatus: s.stepStatus ?? 'not_run' }))
          : []
      );
    } catch {
      setLoadError('Failed to load test run. It may have been deleted.');
    } finally {
      setLoading(false);
    }
  }, [testRunId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // ── Breadcrumb ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!run) return;
    const goToTestRuns = (): void => void navigate('/test-runs');
    const segments = [
      ...(run.projectName ? [{ label: run.projectName, onClick: goToTestRuns }] : []),
      { label: 'Test Runs', onClick: goToTestRuns },
      { label: `TR-${run.id} · ${run.name}` },
    ];
    setOverride(segments);
    return () => setOverride(null);
  }, [run, setOverride, navigate]);

  // ── Jira links ──────────────────────────────────────────────────────────────

  const fetchJiraLinks = useCallback(async () => {
    if (!testRunId) return;
    setJiraLoading(true);
    setJiraError(null);
    try {
      const res = await fetch(`/service/jira/run-links?testRunId=${encodeURIComponent(testRunId)}`);
      if (res.ok) {
        const data: TestRunJiraLink[] = await res.json();
        setJiraLinks(Array.isArray(data) ? data : []);
      }
    } catch {
      setJiraError('Failed to load Jira links');
    } finally {
      setJiraLoading(false);
    }
  }, [testRunId]);

  useEffect(() => {
    fetchJiraLinks();
  }, [fetchJiraLinks]);

  async function handleAddJiraLink(): Promise<void> {
    const key = jiraKeyInput.trim().toUpperCase();
    if (!key) return;
    if (!JIRA_KEY_PATTERN.test(key)) {
      setJiraError('Enter a valid Jira issue key (e.g. PROJ-123)');
      return;
    }
    setJiraError(null);
    try {
      const res = await fetch('/service/jira/run-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testRunId, jiraIssueKey: key }),
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
      const res = await fetch(`/service/jira/run-links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink');
      await fetchJiraLinks();
    } catch (err) {
      setJiraError(err instanceof Error ? err.message : 'Failed to unlink');
    }
  }

  // ── save ────────────────────────────────────────────────────────────────────

  const doSave = useCallback(async (currentStatus: TestRunStatus, currentSteps: EditableStep[]) => {
    if (!testRunId) return;
    setSaveState('saving');
    try {
      // Include steps only if the run was NOT locked when we last saved.
      // This enforces that status is the only change allowed while locked, while
      // still flushing any pending step edits when transitioning TO a locked status.
      const wasLocked = isLockedStatus(lastSavedStatusRef.current);
      const body: {
        status: string;
        steps?: { id: number; actualResults: string; actualResultAttachments: StepAttachment[]; checked: boolean; stepStatus: StepStatus }[];
      } = { status: currentStatus };

      if (!wasLocked) {
        body.steps = currentSteps.map((s) => ({
          id: s.id,
          actualResults: s.actualResults,
          actualResultAttachments: s.actualResultAttachments,
          checked: s.checked,
          stepStatus: s.stepStatus,
        }));
      }

      const res = await fetch(`/service/test-runs/${encodeURIComponent(testRunId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Save failed');
      }

      const updated: TestRun & { steps: TestRunStep[] } = await res.json();
      // Update run metadata (timestamps etc.) without touching status/steps
      // so we don't re-trigger the auto-save effect.
      setRun(updated);
      lastSavedStatusRef.current = currentStatus;
      setSaveState('saved');
      if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);
      savedFadeTimer.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveState('error');
      showToast(err instanceof Error ? err.message : 'Save failed');
    }
  }, [testRunId, showToast]);

  // ── auto-save on change ─────────────────────────────────────────────────────

  useEffect(() => {
    // Skip the flush that happens when fetchRun populates state.
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void doSave(status, steps);
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [status, steps, doSave]);

  // ── keyboard shortcut (immediate save, bypasses debounce) ──────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        void doSave(status, steps);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doSave, status, steps]);

  // ── step field helpers ──────────────────────────────────────────────────────

  function handleActualResultChange(index: number, value: string): void {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, actualResults: value } : s))
    );
  }

  function handleCheckboxChange(index: number, checked: boolean): void {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, checked } : s))
    );
  }

  function handleActualAttachmentsChange(index: number, attachments: StepAttachment[]): void {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, actualResultAttachments: attachments } : s))
    );
  }

  function handleActualAttachmentError(index: number, msg: string | undefined): void {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, attachmentError: msg } : s))
    );
  }

  function handleStepStatusChange(index: number, stepStatus: StepStatus): void {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, stepStatus } : s))
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="page page--full-width">
        <p>Loading test run…</p>
      </section>
    );
  }

  if (loadError || !run) {
    return (
      <section className="page page--full-width">
        <p className="error-text">{loadError ?? 'Test run not found.'}</p>
      </section>
    );
  }

  const isLocked = isLockedStatus(status);

  return (
    <section className="page page--full-width">
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="test-case-header-row">
        <h2>TR-{run.id} &middot; {run.name}</h2>

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
              <span key={link.id} className="jira-link-chip-wrapper">
                <Tooltip
                  content={
                    settings.jiraBaseUrl
                      ? `Open ${link.jiraIssueKey} in Jira`
                      : 'Set a Jira Base URL in Settings to enable this link'
                  }
                >
                  <a
                    href={
                      settings.jiraBaseUrl
                        ? `${settings.jiraBaseUrl}/browse/${link.jiraIssueKey}`
                        : undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`jira-link-chip${!settings.jiraBaseUrl ? ' jira-link-chip--no-url' : ''}`}
                  >
                    {link.jiraIssueKey}
                  </a>
                </Tooltip>
                <Tooltip content="Unlink">
                  <button
                    type="button"
                    className="jira-link-chip-remove"
                    onClick={() => handleRemoveJiraLink(link.id)}
                    aria-label={`Unlink ${link.jiraIssueKey}`}
                  >
                    ×
                  </button>
                </Tooltip>
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
                void handleAddJiraLink();
              }
            }}
          />
          <button
            type="button"
            className="modal-btn modal-btn--primary jira-links-add-btn"
            onClick={() => void handleAddJiraLink()}
          >
            Link
          </button>
        </div>

        <div className="test-run-header-right">
          <div className="test-run-status-selector">
            <label htmlFor="run-status-select" className="test-run-status-label">
              Status
            </label>
            <select
              id="run-status-select"
              className={`test-run-status-select test-run-status-select--${status}`}
              value={status}
              onChange={(e) => setStatus(e.target.value as TestRunStatus)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <span className={`test-run-autosave-indicator test-run-autosave-indicator--${saveState}`}>
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved'  && '✓ Saved'}
            {saveState === 'error'  && 'Save failed'}
          </span>
        </div>
      </div>

      <div className="test-run-meta">
        <span className="test-run-meta-item">
          <span className="test-run-meta-label">From test case:</span>{' '}
          <span className="test-run-meta-value">
            {run.sourceTestCaseName || 'Deleted test case'}
          </span>
        </span>
        <span className="test-run-meta-sep">·</span>
        <span className="test-run-meta-item">
          <span className="test-run-meta-label">Created:</span>{' '}
          <span className="test-run-meta-value">{formatDateTime(run.createdAt)}</span>
        </span>
        <span className="test-run-meta-sep">·</span>
        <span className="test-run-meta-item">
          <span className="test-run-meta-label">Updated:</span>{' '}
          <span className="test-run-meta-value">{formatDateTime(run.updatedAt)}</span>
        </span>
      </div>

      {/* ── Lock banner ─────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="test-run-lock-banner" role="status">
          This test run is marked as {status === 'passed' ? 'Passed' : 'Failed'} and is locked.
          {' '}Step data cannot be edited. Only the status can be changed.
        </div>
      )}

      <hr className="section-divider" />

      {/* ── Steps ───────────────────────────────────────────────────────── */}
      {steps.length === 0 ? (
        <p>This test run has no steps.</p>
      ) : (
        steps.map((step, index) => (
          <div key={step.id} className="test-case-step-block">
            {/* Step header: number + step status selector + progress checkbox */}
            <div className="test-case-step-header">
              <span className="test-case-step-number">Step {step.position}</span>
              <div className="test-case-step-header-actions">
                <Tooltip content={isLocked ? LOCKED_STEP_TITLE : 'Set step result status'}>
                  <select
                    className={`step-status-select step-status-select--${step.stepStatus}`}
                    value={step.stepStatus}
                    onChange={(e) => handleStepStatusChange(index, e.target.value as StepStatus)}
                    disabled={isLocked}
                    aria-label={`Step ${step.position} status`}
                  >
                    {STEP_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Tooltip>
                <Tooltip content={isLocked ? LOCKED_STEP_TITLE : 'Mark step complete'}>
                  <label className="test-run-checkbox-label">
                    <input
                      type="checkbox"
                      className="test-run-step-checkbox"
                      checked={step.checked}
                      onChange={(e) => handleCheckboxChange(index, e.target.checked)}
                      disabled={isLocked}
                      aria-label={`Step ${step.position} complete`}
                    />
                    Done
                  </label>
                </Tooltip>
              </div>
            </div>

            {/* Step description + Expected results — side by side like test case form */}
            <div className="test-case-step-row">
              <div className="test-case-step-col">
                <Tooltip content={STEP_IMMUTABLE_TITLE} position="bottom">
                  <label className="test-case-step-label" htmlFor={`step-desc-${step.id}`}>
                    Step description
                  </label>
                </Tooltip>
                <textarea
                  id={`step-desc-${step.id}`}
                  className="modal-input modal-input--immutable test-case-step-textarea"
                  value={step.stepDescription}
                  readOnly
                  tabIndex={-1}
                  rows={3}
                />
              </div>
              <div className="test-case-step-col">
                <Tooltip content={STEP_IMMUTABLE_TITLE} position="bottom">
                  <label className="test-case-step-label" htmlFor={`step-expected-${step.id}`}>
                    Expected results
                  </label>
                </Tooltip>
                <textarea
                  id={`step-expected-${step.id}`}
                  className="modal-input modal-input--immutable test-case-step-textarea"
                  value={step.expectedResults}
                  readOnly
                  tabIndex={-1}
                  rows={3}
                />
              </div>
            </div>

            {/* Test case attachments — immutable, read-only thumbnails */}
            {step.attachments.length > 0 && (
              <div className="test-case-step-attachments">
                <Tooltip content={STEP_IMMUTABLE_TITLE} position="bottom">
                  <span className="test-case-step-label">Test case attachments</span>
                </Tooltip>
                <div className="step-attachments-grid">
                  {step.attachments.map((att) => (
                    <div key={att.id} className="step-attachment-thumb step-attachment-thumb--readonly">
                      <Tooltip content="Click to enlarge">
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="step-attachment-img step-attachment-img--clickable"
                          onClick={() => setLightbox({ src: att.url, alt: att.filename })}
                        />
                      </Tooltip>
                      <span className="step-attachment-name" title={att.filename}>
                        {att.filename}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actual results — editable unless locked */}
            <div className="test-case-step-attachments">
              <Tooltip content={isLocked ? LOCKED_STEP_TITLE : undefined} position="bottom">
                <label className="test-case-step-label" htmlFor={`step-actual-${step.id}`}>
                  Actual results
                </label>
              </Tooltip>
              <textarea
                id={`step-actual-${step.id}`}
                className="modal-input test-case-step-textarea"
                value={step.actualResults}
                onChange={(e) => handleActualResultChange(index, e.target.value)}
                disabled={isLocked}
                placeholder={isLocked ? undefined : 'Describe what actually happened…'}
                rows={3}
              />
            </div>

            {/* Actual result attachments */}
            <StepAttachmentsUpload
              uid={`actual-${step.id}`}
              attachments={step.actualResultAttachments}
              error={step.attachmentError}
              onChange={(a) => handleActualAttachmentsChange(index, a)}
              onError={(msg) => handleActualAttachmentError(index, msg)}
              disabled={isLocked}
              disabledTitle={LOCKED_STEP_TITLE}
              label="Actual result attachments"
            />
          </div>
        ))
      )}
    </section>
  );
}
