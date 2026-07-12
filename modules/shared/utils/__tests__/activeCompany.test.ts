/**
 * activeCompany.test.ts — REAL test for the ONE canonical service-layer
 * company resolver (modules/shared/utils/activeCompany.ts) that replaced six
 * inlined copies in the sales / finance / inventory / hr services.
 *
 * The critical guarantee is the PRIORITY: the sidebar switcher
 * (appStore.selectedCompany) MUST win over the phantom profile.company, or a
 * read asks Supabase for the wrong company's rows after a company switch — the
 * exact class of bug this consolidation exists to prevent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mutable state the store mocks read (hoisted so the vi.mock factories see it)
const state = vi.hoisted(() => ({
  selected: '' as string | undefined,
  profileCompany: undefined as string | undefined,
  appStoreThrows: false,
}));

vi.mock('@/modules/shared/store/appStore', () => ({
  useAppStore: {
    getState: () => {
      if (state.appStoreThrows) throw new Error('appStore not initialised');
      return { selectedCompany: state.selected };
    },
  },
}));
vi.mock('@/modules/auth/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      profile: state.profileCompany === undefined ? null : { company: state.profileCompany },
    }),
  },
}));

import { activeCompany } from '@/modules/shared/utils/activeCompany';

beforeEach(() => {
  state.selected = '';
  state.profileCompany = undefined;
  state.appStoreThrows = false;
});

describe('activeCompany — canonical service-layer resolver', () => {
  it('returns the sidebar-selected company when set', () => {
    state.selected = 'Nippon';
    expect(activeCompany()).toBe('Nippon');
  });

  it('the switcher WINS over profile.company (the anti-bug guarantee)', () => {
    // The go-live seed profile.company is "GTK" while the deploy switches to
    // Nippon. If profile.company won here, every read would fetch GTK's rows.
    state.selected = 'Nippon';
    state.profileCompany = 'GTK';
    expect(activeCompany()).toBe('Nippon');
  });

  it('falls back to profile.company only when no company is selected', () => {
    state.selected = '';
    state.profileCompany = 'GTK';
    expect(activeCompany()).toBe('GTK');
  });

  it('falls back to profile.company when appStore has not bootstrapped (throws)', () => {
    state.appStoreThrows = true;
    state.profileCompany = 'Glassco';
    expect(activeCompany()).toBe('Glassco');
  });

  it('returns "" when neither source is available (never a hardcoded company)', () => {
    state.selected = '';
    state.profileCompany = undefined; // profile === null
    expect(activeCompany()).toBe('');
  });
});
