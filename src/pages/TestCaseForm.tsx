import { useState, useEffect, useCallback } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { HiXMark, HiArrowUp, HiArrowDown } from 'react-icons/hi2';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import type { TestCaseStep } from '../types/testCase';

const API = '/service';
const NAME_MAX_LENGTH = 50;
const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving?';

function clampName(value: string): string {
  return value.slice(0, NAME_MAX_LENGTH);
}

export default function TestCaseForm(): ReactElement {
  const { testCaseId } = useParams<{ testCaseId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<TestCaseStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useBeforeUnload(dirty);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm(UNSAVED_MESSAGE);
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker.state, blocker]);

  const fetchCase = useCallback(async (): Promise<void> => {
    if (!testCaseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/test-cases/${encodeURIComponent(testCaseId)}`);
      if (!res.ok) {
        if (res.status === 404) setError('Test case not found');
        else setError('Failed to load test case');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProjectId(typeof data.projectId === 'number' ? data.projectId : null);
      setName(clampName(data.name ?? ''));
      setSteps(Array.isArray(data.steps) ? data.steps.map((s: TestCaseStep) => ({ actual: String(s?.actual ?? ''), expected: String(s?.expected ?? '') })) : []);
      setDirty(false);
    } catch {
      setError('Failed to load test case');
    } finally {
      setLoading(false);
    }
  }, [testCaseId]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  function addStep(): void {
    setSteps((prev) => [...prev, { actual: '', expected: '' }]);
    setDirty(true);
  }

  function removeStep(index: number): void {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function updateStep(index: number, field: 'actual' | 'expected', value: string): void {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    setDirty(true);
  }

  function moveStep(index: number, direction: 'up' | 'down'): void {
    setSteps((prev) => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!testCaseId || projectId == null) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/test-cases/${encodeURIComponent(testCaseId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          projectId,
          steps,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Save failed');
      }
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="page">
        <h2>Test case</h2>
        <p style={{ color: 'var(--main-muted)' }}>Loading…</p>
      </section>
    );
  }

  if (error && !name && steps.length === 0) {
    return (
      <section className="page">
        <h2>Test case</h2>
        <div className="test-cases-error" role="alert">{error}</div>
        <button type="button" className="modal-btn modal-btn--secondary" onClick={() => navigate('/')}>
          Back to Test Cases
        </button>
      </section>
    );
  }

  return (
    <section className="page test-case-form-page">
      <div className="test-case-form-header">
        <h2>Edit test case</h2>
        <p className="test-case-form-id">
          ID: <strong>{testCaseId ?? '—'}</strong>
        </p>
      </div>

      {error && (
        <div className="test-cases-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="test-case-form">
        <label htmlFor="tc-name" className="modal-label">
          Name <span className="modal-label-hint">(max {NAME_MAX_LENGTH} characters)</span>
        </label>
        <input
          id="tc-name"
          type="text"
          className="modal-input"
          value={name}
          onChange={(e) => { setName(clampName(e.target.value)); setDirty(true); }}
          maxLength={NAME_MAX_LENGTH}
          placeholder="Test case name"
          required
        />

        <div className="test-case-form-steps">
          <div className="test-case-form-steps-header">
            <h3 className="test-case-form-steps-title">Steps</h3>
            <button
              type="button"
              className="test-cases-create-btn"
              onClick={addStep}
            >
              Add step
            </button>
          </div>

          {steps.length === 0 ? (
            <p className="test-case-form-steps-empty">
              No steps yet. Click &quot;Add step&quot; to add one.
            </p>
          ) : (
            <ol className="test-case-form-steps-list" start={1}>
              {steps.map((step, index) => (
                <li key={index} className="test-case-form-step">
                  <span className="test-case-form-step-num">{index + 1}.</span>
                  <div className="test-case-form-step-fields">
                    <label className="test-case-form-step-label">
                      Actual
                      <textarea
                        className="test-case-form-step-input"
                        value={step.actual}
                        onChange={(e) => updateStep(index, 'actual', e.target.value)}
                        placeholder="Actual result"
                        rows={2}
                      />
                    </label>
                    <label className="test-case-form-step-label">
                      Expected
                      <textarea
                        className="test-case-form-step-input"
                        value={step.expected}
                        onChange={(e) => updateStep(index, 'expected', e.target.value)}
                        placeholder="Expected result"
                        rows={2}
                      />
                    </label>
                  </div>
                  <div className="test-case-form-step-actions">
                    <button
                      type="button"
                      className="test-case-form-step-move"
                      onClick={() => moveStep(index, 'up')}
                      disabled={index === 0}
                      title={index === 0 ? 'Already first' : 'Move step up'}
                      aria-label="Move step up"
                    >
                      <HiArrowUp />
                    </button>
                    <button
                      type="button"
                      className="test-case-form-step-move"
                      onClick={() => moveStep(index, 'down')}
                      disabled={index === steps.length - 1}
                      title={index === steps.length - 1 ? 'Already last' : 'Move step down'}
                      aria-label="Move step down"
                    >
                      <HiArrowDown />
                    </button>
                    <button
                      type="button"
                      className="test-case-form-step-delete"
                      onClick={() => removeStep(index)}
                      title="Remove step"
                      aria-label="Remove step"
                    >
                      <HiXMark />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="test-case-form-actions">
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <button
            type="submit"
            className="modal-btn modal-btn--primary"
            disabled={saving}
            title={saving ? 'Saving…' : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
