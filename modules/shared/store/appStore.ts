
import { create } from 'zustand';
import { Company } from '../types';

interface AppState {
  selectedCompany: Company;
  isSidebarOpen: boolean;
  setSelectedCompany: (company: Company) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedCompany: 'GTK',
  isSidebarOpen: window.innerWidth > 1024,
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
}));
