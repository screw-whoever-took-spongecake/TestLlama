import { useState, useRef } from 'react';
import type { ReactElement, DragEvent, ChangeEvent } from 'react';
import { HiOutlineTrash } from 'react-icons/hi2';
import type { StepAttachment } from '../types/testCase';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_ATTACHMENTS = 10;
const ACCEPTED_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg']);

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) return `"${file.name}" is not a PNG or JPG file.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" exceeds the 2 MB limit.`;
  return null;
}

export async function uploadFile(file: File): Promise<StepAttachment> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/service/attachments', { method: 'POST', body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Upload failed');
  }
  return res.json() as Promise<StepAttachment>;
}

export interface StepAttachmentsUploadProps {
  uid: number | string;
  attachments: StepAttachment[];
  error?: string;
  onChange: (attachments: StepAttachment[]) => void;
  onError: (msg: string | undefined) => void;
  disabled?: boolean;
  disabledTitle?: string;
  label?: string;
}

export default function StepAttachmentsUpload({
  uid,
  attachments,
  error,
  onChange,
  onError,
  disabled = false,
  disabledTitle,
  label = 'Attachments',
}: StepAttachmentsUploadProps): ReactElement {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFiles(files: FileList | File[]): Promise<void> {
    if (disabled) return;
    const list = Array.from(files);
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      onError(`Maximum of ${MAX_ATTACHMENTS} attachments per step reached.`);
      return;
    }
    const allowed = list.slice(0, remaining);
    if (list.length > remaining) {
      onError(`Only ${remaining} more attachment${remaining === 1 ? '' : 's'} allowed (max ${MAX_ATTACHMENTS} per step). ${list.length - remaining} file${list.length - remaining === 1 ? '' : 's'} skipped.`);
    } else {
      onError(undefined);
    }
    for (const file of allowed) {
      const err = validateFile(file);
      if (err) { onError(err); return; }
    }
    try {
      const newAttachments = await Promise.all(allowed.map(uploadFile));
      onChange([...attachments, ...newAttachments]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (!disabled && e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files?.length) processFiles(e.target.files);
    e.target.value = '';
  }

  function removeAttachment(id: string): void {
    if (disabled) return;
    onChange(attachments.filter((a) => a.id !== id));
    fetch(`/service/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }

  const isFull = attachments.length >= MAX_ATTACHMENTS;

  return (
    <div className="test-case-step-attachments">
      <span className="test-case-step-label">{label}</span>
      <div
        className={`step-attachments-drop-zone${dragging ? ' step-attachments-drop-zone--active' : ''}${isFull || disabled ? ' step-attachments-drop-zone--full' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !isFull) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        aria-label="Image attachment drop zone"
        title={disabled ? disabledTitle : undefined}
      >
        <span className="step-attachments-drop-hint">
          {disabled
            ? 'Attachments cannot be added'
            : isFull
              ? `Maximum of ${MAX_ATTACHMENTS} attachments reached.`
              : 'Drag \u0026 drop PNG or JPG images here'}
        </span>
        <button
          type="button"
          className="modal-btn modal-btn--secondary step-attachments-browse-btn"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isFull}
          title={disabled ? disabledTitle : isFull ? `Maximum of ${MAX_ATTACHMENTS} attachments per step` : undefined}
        >
          Browse
        </button>
        <span className="step-attachments-limit-hint">
          {attachments.length}/{MAX_ATTACHMENTS} · Max 2 MB per image
        </span>
        <input
          ref={inputRef}
          id={`step-attachments-input-${uid}`}
          type="file"
          accept=".png,.jpg,.jpeg"
          multiple
          className="step-attachments-file-input"
          onChange={handleInputChange}
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled}
        />
      </div>

      {error && (
        <p className="step-attachments-error" role="alert">{error}</p>
      )}

      {attachments.length > 0 && (
        <div className="step-attachments-grid">
          {attachments.map((att) => (
            <div key={att.id} className="step-attachment-thumb">
              <img
                src={att.url}
                alt={att.filename}
                className="step-attachment-img"
              />
              <span className="step-attachment-name" title={att.filename}>
                {att.filename}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="step-attachment-remove"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove attachment ${att.filename}`}
                  title="Remove"
                >
                  <HiOutlineTrash aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
