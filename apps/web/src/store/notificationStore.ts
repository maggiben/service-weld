import { create } from "zustand";

interface NotificationState {
  unreadCount: number;
  toast: string | null;
  setUnreadFromAlerts: (count: number) => void;
  pushToast: (message: string) => void;
  clearToast: () => void;
}

/** In-app notifications only (D-15). External email/SMS/push deferred. */
export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  toast: null,
  setUnreadFromAlerts: (count) => set({ unreadCount: count }),
  pushToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),
}));
