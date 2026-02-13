import { useEffect } from 'react';

/**
 * Shows the browser's "Leave site? Changes you made may not be saved" dialog
 * when the user tries to close the tab or refresh, but only when `enabled` is true.
 * Use with form dirty state: enable when the form has unsaved changes.
 */
export function useBeforeUnload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault();
      // Modern browsers ignore the string; some older ones show it.
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);
}
