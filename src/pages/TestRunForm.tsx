import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import { useParams, useBlocker, useNavigate, useOutletContext } from 'react-router-dom';
import { useToast } from '../components/Toast';
import StepAttachmentsUpload from '../components/StepAttachmentsUpload';
import type { TestRun, TestRunStep, TestRunStatus, StepStatus } from '../types/testRun';
import { isLockedStatus } from '../types/testRun';
import type { StepAttachment } from '../types/testCase';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import type { DashboardOutletContext } from '../components/DashboardContent';

const STATUS_OPTIONS: { value: TestRunStatus; label: string }[] = [
  { value: 'ready_to_test', label: 'Ready to Test' },
  { value: 'passed',        label: 'Passed' },
  { value: 'failed',        label: 'Failed' },
  { value: 'na',            label: 'N/A' },
];

const STEP_STATUS_OPTIONS: { value: StepStatus; label: string }[] = [
  { value: 'not_run',                label: 'Not Run' },
  { value: 'passed',                 label: 'Passed' },
  { value: 'failed',                 label: 'Failed' },
  { value: 'na',                     label: 'N/A' },
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

export default function TestRunForm(): ReactElement {
  const { testRunId } = useParams<{ testRunId: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { setActiveTab } = useOutletContext<DashboardOutletContext>();
  const { setOverride } = useBreadcrumb();

  const [run, setRun]         = useState<TestRun | null>(null);
  const [steps, setSteps]     = useState<EditableStep[]>([]);
  const [status, setStatus]   = useState<TestRunStatus>('ready_to_test');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── unsaved-changes guard ───────────────────────────────────────────────────

  // Block React Router in-app navigation when there are unsaved changes.
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const leave = window.confirm('You have unsaved changes. Leave without saving?');
      if (leave) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, blocker.state]);

  // Block browser-level navigation (tab close, refresh, address bar).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchRun = useCallback(async () => {
    if (!testRunId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/service/test-runs/${encodeURIComponent(testRunId)}`);
      if (!res.ok) throw new Error('Failed to load test run');
      const data: TestRun & { steps: TestRunStep[] } = await res.json();
      setRun(data);
      setStatus(data.status as TestRunStatus);
      setSteps(
        Array.isArray(data.steps)
          ? data.steps.map((s) => ({ ...s, stepStatus: (s.stepStatus as StepStatus) ?? 'not_run' }))
          : []
      );
      setIsDirty(false);
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
    const goToTestRuns = (): void => {
      setActiveTab('test-runs');
      navigate('/');
    };
    const segments = [
      ...(run.projectName ? [{ label: run.projectName, onClick: goToTestRuns }] : []),
      { label: 'Test Runs', onClick: goToTestRuns },
      { label: `TR-${run.id} · ${run.name}` },
    ];
    setOverride(segments);
    return () => setOverride(null);
  }, [run, setOverride, setActiveTab, navigate]);

  // ── step field helpers ──────────────────────────────────────────────────────

  function handleActualResultChange(index: number, value: string): void {
    setIsDirty(true);
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, actualResults: value } : s))
    );
  }

  function handleCheckboxChange(index: number, checked: boolean): void {
    setIsDirty(true);
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, checked } : s))
    );
  }

  function handleActualAttachmentsChange(index: number, attachments: StepAttachment[]): void {
    setIsDirty(true);
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
    setIsDirty(true);
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, stepStatus } : s))
    );
  }

  // ── save ────────────────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    if (!testRunId || saving) return;
    setSaving(true);
    try {
      const isLocked = isLockedStatus(status);
      const body: {
        status: string;
        steps?: { id: number; actualResults: string; actualResultAttachments: StepAttachment[]; checked: boolean; stepStatus: StepStatus }[];
      } = { status };

      if (!isLocked) {
        body.steps = steps.map((s) => ({
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
      setRun(updated);
      setStatus(updated.status as TestRunStatus);
      setSteps(updated.steps ? updated.steps.map((s) => ({ ...s, stepStatus: (s.stepStatus as StepStatus) ?? 'not_run' })) : []);
      setIsDirty(false);
      showToast('Test run saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
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
      {/* ── Header — mirrors test-case-header-row ────────────────────────── */}
      <div className="test-case-header-row">
        <h2>TR-{run.id} &middot; {run.name}</h2>

        <div className="test-run-status-selector">
          <label htmlFor="run-status-select" className="test-run-status-label">
            Status
          </label>
          <select
            id="run-status-select"
            className="test-run-status-select"
            value={status}
            onChange={(e) => { setStatus(e.target.value as TestRunStatus); setIsDirty(true); }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
          {status === 'passed'
            ? 'This test run is marked as Passed and is locked. Step data cannot be edited.'
            : 'This test run is marked as Failed and is locked. Step data cannot be edited.'}
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
                <select
                  className={`step-status-select step-status-select--${step.stepStatus}`}
                  value={step.stepStatus}
                  onChange={(e) => handleStepStatusChange(index, e.target.value as StepStatus)}
                  disabled={isLocked}
                  title={isLocked ? LOCKED_STEP_TITLE : 'Set step result status'}
                  aria-label={`Step ${step.position} status`}
                >
                  {STEP_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <label
                  className="test-run-checkbox-label"
                  title={isLocked ? LOCKED_STEP_TITLE : 'Mark step complete'}
                >
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
              </div>
            </div>

            {/* Step description + Expected results — side by side like test case form */}
            <div className="test-case-step-row">
              <div className="test-case-step-col">
                <label className="test-case-step-label" htmlFor={`step-desc-${step.id}`}>
                  Step description
                </label>
                <textarea
                  id={`step-desc-${step.id}`}
                  className="modal-input test-case-step-textarea"
                  value={step.stepDescription}
                  readOnly
                  disabled
                  title={STEP_IMMUTABLE_TITLE}
                  rows={3}
                />
              </div>
              <div className="test-case-step-col">
                <label className="test-case-step-label" htmlFor={`step-expected-${step.id}`}>
                  Expected results
                </label>
                <textarea
                  id={`step-expected-${step.id}`}
                  className="modal-input test-case-step-textarea"
                  value={step.expectedResults}
                  readOnly
                  disabled
                  title={STEP_IMMUTABLE_TITLE}
                  rows={3}
                />
              </div>
            </div>

            {/* Test case attachments — immutable, read-only thumbnails */}
            {step.attachments.length > 0 && (
              <div className="test-case-step-attachments">
                <span className="test-case-step-label" title={STEP_IMMUTABLE_TITLE}>
                  Test case attachments
                </span>
                <div className="step-attachments-grid">
                  {step.attachments.map((att) => (
                    <div key={att.id} className="step-attachment-thumb step-attachment-thumb--readonly">
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="step-attachment-img"
                        title={STEP_IMMUTABLE_TITLE}
                      />
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
              <label className="test-case-step-label" htmlFor={`step-actual-${step.id}`}>
                Actual results
              </label>
              <textarea
                id={`step-actual-${step.id}`}
                className="modal-input test-case-step-textarea"
                value={step.actualResults}
                onChange={(e) => handleActualResultChange(index, e.target.value)}
                disabled={isLocked}
                title={isLocked ? LOCKED_STEP_TITLE : undefined}
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

      {/* ── Save — mirrors test-case-form-actions ───────────────────────── */}
      <div className="test-case-form-actions">
        <button
          type="button"
          className="modal-btn modal-btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <span className="btn-spinner" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
