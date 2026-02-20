import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Tooltip from './Tooltip';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps): ReactElement {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${alt}`}
    >
      <Tooltip content="Close (Esc)" position="bottom">
        <button
          type="button"
          className="lightbox-close"
          onClick={onClose}
          aria-label="Close image preview"
        >
          ×
        </button>
      </Tooltip>
      <img
        src={src}
        alt={alt}
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
