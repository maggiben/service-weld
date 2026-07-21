"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/api/client";
import { useSessionStore } from "@/store/sessionStore";
import { useNotificationStore } from "@/store/notificationStore";

/** Polls open alert count into `notificationStore` while the shell is mounted. */
export function useAlertsInbox() {
  const canRead = useSessionStore((s) => s.hasCapability("alerts:read"));
  const setUnread = useNotificationStore((s) => s.setUnreadFromAlerts);

  const summaryQuery = useQuery({
    queryKey: ["alerts", "summary"],
    queryFn: () => api.alertsSummary(),
    enabled: canRead,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (summaryQuery.data) {
      setUnread(summaryQuery.data.open_count);
    }
  }, [summaryQuery.data, setUnread]);

  return summaryQuery;
}
