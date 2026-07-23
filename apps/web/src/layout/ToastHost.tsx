"use client";

import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { useNotificationStore } from "@/store/notificationStore";

/** Renders toasts pushed to `notificationStore` (D-15 / 006 R9). */
export function ToastHost() {
  const toast = useNotificationStore((state) => state.toast);
  const clearToast = useNotificationStore((state) => state.clearToast);

  return (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={5000}
      onClose={clearToast}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="info" onClose={clearToast} variant="filled">
        {toast}
      </Alert>
    </Snackbar>
  );
}
