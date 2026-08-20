import { create } from 'zustand';

interface NotificationUiState {
  /** Panel dropdown đang mở (desktop bell) */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

export const useNotificationStore = create<NotificationUiState>((set) => ({
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),
}));
