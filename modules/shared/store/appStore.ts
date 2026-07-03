
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Company } from '../types';

interface AppState {
  selectedCompany: Company;
  isSidebarOpen: boolean;
  setSelectedCompany: (company: Company) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedCompany: 'Nippon',
      isSidebarOpen: window.innerWidth > 1024,
      setSelectedCompany: (company) => set({ selectedCompany: company }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
    }),
    {
      name: 'glasstech-app',
      // Persist ONLY the selected company so a page refresh keeps you on the
      // company you were working in. Previously the switcher reset to 'Nippon'
      // on every reload (no persistence), so after approving e.g. a Glassco
      // order and refreshing, the app silently reverted to Nippon and the shared
      // Sales Orders tab filtered the wrong company → it looked empty.
      // RBAC is still enforced on boot: App.tsx falls back to the user's first
      // allowed company if the persisted one isn't permitted. isSidebarOpen is
      // intentionally NOT persisted (it derives from viewport width).
      partialize: (s) => ({ selectedCompany: s.selectedCompany }),
    },
  ),
);
