import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Global keyboard shortcuts for ERP navigation.
 * 
 * Shortcuts:
 *   Alt+1  → Dashboard
 *   Alt+2  → HR
 *   Alt+3  → Sales
 *   Alt+4  → Finance
 *   Alt+5  → Procurement
 *   Alt+6  → Production
 *   Alt+7  → Inventory
 *   Alt+8  → Logistics
 *   Escape → Close any open panel/modal (handled locally)
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutMap = {
    'Alt+1': () => navigate('/'),
    'Alt+2': () => navigate('/hr'),
    'Alt+3': () => navigate('/sales'),
    'Alt+4': () => navigate('/accounts'),
    'Alt+5': () => navigate('/requisitions'),
    'Alt+6': () => navigate('/production'),
    'Alt+7': () => navigate('/inventory'),
    'Alt+8': () => navigate('/logistics'),
    'Alt+9': () => navigate('/md-dashboard'),
  };

  const handler = useCallback((e: KeyboardEvent) => {
    // Don't trigger inside inputs/textareas
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = [
      e.altKey ? 'Alt' : '',
      e.ctrlKey ? 'Ctrl' : '',
      e.shiftKey ? 'Shift' : '',
      e.key,
    ].filter(Boolean).join('+');

    const action = shortcuts[key];
    if (action) {
      e.preventDefault();
      action();
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

export default useKeyboardShortcuts;
