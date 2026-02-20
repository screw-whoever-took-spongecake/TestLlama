import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  position?: TooltipPosition;
  /** Use 'block' when wrapping a block-level element to avoid collapsing its width. */
  display?: 'inline-flex' | 'block';
}

/**
 * Wraps a trigger element in a relative container and shows a styled tooltip
 * bubble on hover. Hover is tracked on the wrapper so disabled buttons (which
 * don't fire their own mouse events) still trigger the tooltip correctly.
 * Renders nothing extra when `content` is falsy.
 */
export default function Tooltip({
  content,
  children,
  position = 'top',
  display = 'inline-flex',
}: TooltipProps): ReactElement {
  const [visible, setVisible] = useState(false);

  if (!content) return children;

  const posClass = position === 'top' ? '' : ` tooltip-bubble--${position}`;
  const wrapperStyle = display === 'block' ? { display: 'block' } : undefined;

  return (
    <span
      className="tooltip-wrapper"
      style={wrapperStyle}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className={`tooltip-bubble${posClass}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
