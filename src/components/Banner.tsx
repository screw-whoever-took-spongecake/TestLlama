import type { ReactElement } from 'react';
import type { BreadcrumbSegment } from '../contexts/BreadcrumbContext';

interface BannerProps {
  segments: BreadcrumbSegment[];
}

function Banner({ segments }: BannerProps): ReactElement {
  return (
    <header className="banner">
      <h1 className="banner-title">TestLlama</h1>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <span key={i} className="breadcrumb-item">
              {seg.onClick && !isLast ? (
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={seg.onClick}
                >
                  {seg.label}
                </button>
              ) : (
                <span className={isLast ? 'breadcrumb-current' : 'breadcrumb-link breadcrumb-link--plain'}>
                  {seg.label}
                </span>
              )}
              {!isLast && (
                <span className="breadcrumb-sep" aria-hidden="true">›</span>
              )}
            </span>
          );
        })}
      </nav>
    </header>
  );
}

export default Banner;
