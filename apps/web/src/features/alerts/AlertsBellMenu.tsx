"use client";

import NotificationsIcon from "@mui/icons-material/Notifications";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import { useNotificationStore } from "@/store/notificationStore";
import { alertEntityHref, formatAlertDetail } from "./alertDisplay";

const PREVIEW_LIMIT = 8;

export function AlertsBellMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const previewQuery = useQuery({
    queryKey: ["alerts", "preview", PREVIEW_LIMIT],
    queryFn: () =>
      api.listAlerts({
        limit: PREVIEW_LIMIT,
        open: true,
        sort: "-created_at",
      }),
    enabled: open,
    staleTime: 30_000,
  });

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const goToAlerts = () => {
    handleClose();
    router.push("/alerts");
  };

  const alerts = previewQuery.data?.data ?? [];

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        title={t("nav.alerts")}
        aria-label={t("nav.alerts")}
        aria-controls={open ? "alerts-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
      >
        <Badge badgeContent={unreadCount} color="warning" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu
        id="alerts-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { width: 380, maxWidth: "calc(100vw - 24px)" },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">{t("alerts.menu.title")}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("alerts.menu.open_count", { count: unreadCount })}
          </Typography>
        </Box>
        <Divider />
        {previewQuery.isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!previewQuery.isLoading && alerts.length === 0 && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("alerts.menu.empty")}
            </Typography>
          </Box>
        )}
        {alerts.map((alert) => {
          const href = alertEntityHref(alert) ?? "/alerts";
          const typeLabel = t(`enums.alert_type.${alert.alert_type}`, {
            defaultValue: alert.alert_type,
          });
          return (
            <MenuItem
              key={alert.id}
              component={Link}
              href={href}
              onClick={handleClose}
              sx={{
                alignItems: "flex-start",
                whiteSpace: "normal",
                py: 1.25,
              }}
            >
              <ListItemText
                primary={typeLabel}
                secondary={formatAlertDetail(alert, t)}
                primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                secondaryTypographyProps={{
                  variant: "caption",
                  color: "text.secondary",
                }}
              />
            </MenuItem>
          );
        })}
        <Divider />
        <Box sx={{ px: 1, py: 1 }}>
          <Button fullWidth size="small" onClick={goToAlerts}>
            {t("alerts.menu.view_all")}
          </Button>
        </Box>
      </Menu>
    </>
  );
}
