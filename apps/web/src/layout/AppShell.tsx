"use client";

import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LightModeIcon from "@mui/icons-material/LightMode";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleIcon from "@mui/icons-material/People";
import PropaneTankIcon from "@mui/icons-material/PropaneTank";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import HandshakeIcon from "@mui/icons-material/Handshake";
import NotificationsIcon from "@mui/icons-material/Notifications";
import BuildIcon from "@mui/icons-material/Build";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import AssessmentIcon from "@mui/icons-material/Assessment";
import Badge from "@mui/material/Badge";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import { useSessionStore } from "@/store/sessionStore";
import { useUiStore } from "@/store/uiStore";
import { useNotificationStore } from "@/store/notificationStore";
import { ToastHost } from "@/layout/ToastHost";
import { AlertsBellMenu } from "@/features/alerts/AlertsBellMenu";
import { useAlertsInbox } from "@/features/alerts/useAlertsInbox";

const DRAWER_WIDTH = 240;

interface NavItem {
  to: string;
  labelKey: string;
  capability: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/clients",
    labelKey: "nav.clients",
    capability: "clients:read",
    icon: <PeopleIcon />,
  },
  {
    to: "/cylinders",
    labelKey: "nav.cylinders",
    capability: "cylinders:read",
    icon: <PropaneTankIcon />,
  },
  {
    to: "/batteries",
    labelKey: "nav.batteries",
    capability: "batteries:read",
    icon: <Inventory2Icon />,
  },
  {
    to: "/movements",
    labelKey: "nav.movements",
    capability: "movements:read",
    icon: <LocalShippingIcon />,
  },
  {
    to: "/supplier-loans",
    labelKey: "nav.supplier_loans",
    capability: "supplier_loans:read",
    icon: <HandshakeIcon />,
  },
  {
    to: "/transfers",
    labelKey: "nav.transfers",
    capability: "transfers:read",
    icon: <SwapHorizIcon />,
  },
  {
    to: "/reconciliation",
    labelKey: "nav.reconciliation",
    capability: "reports:read",
    icon: <FactCheckIcon />,
  },
  {
    to: "/reports",
    labelKey: "nav.reports",
    capability: "reports:read",
    icon: <AssessmentIcon />,
  },
  {
    to: "/accessories",
    labelKey: "nav.accessories",
    capability: "accessories:read",
    icon: <BuildIcon />,
  },
  {
    to: "/alerts",
    labelKey: "nav.alerts",
    capability: "alerts:read",
    icon: <NotificationsIcon />,
  },
  {
    to: "/rates",
    labelKey: "nav.rates",
    capability: "rates:read",
    icon: <AttachMoneyIcon />,
  },
  {
    to: "/billing",
    labelKey: "nav.billing",
    capability: "billing:read",
    icon: <ReceiptLongIcon />,
  },
];

const BREADCRUMB_BY_PREFIX: Record<string, string> = {
  "/clients": "nav.clients",
  "/cylinders": "nav.cylinders",
  "/batteries": "nav.batteries",
  "/movements": "nav.movements",
  "/supplier-loans": "nav.supplier_loans",
  "/transfers": "nav.transfers",
  "/reconciliation": "nav.reconciliation",
  "/reports": "nav.reports",
  "/accessories": "nav.accessories",
  "/alerts": "nav.alerts",
  "/rates": "nav.rates",
  "/billing": "nav.billing",
};

export default function AppShell({ children }: PropsWithChildren) {
  const theme = useTheme();
  // noSsr: keep server + first client paint in sync (defaultMatches=false), then
  // update after mount — avoids hydration mismatch on drawer/AppBar chrome.
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const username = useSessionStore((s) => s.user?.username);
  const hasCapability = useSessionStore((s) => s.hasCapability);
  const clearSession = useSessionStore((s) => s.clearSession);
  const { locale, setLocale, mode, setMode, sidebarOpen, toggleSidebar } =
    useUiStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  useAlertsInbox();

  const visibleNav = NAV_ITEMS.filter((item) => hasCapability(item.capability));

  const breadcrumbKey =
    Object.entries(BREADCRUMB_BY_PREFIX).find(([prefix]) =>
      pathname.startsWith(prefix),
    )?.[1] ?? "app.title";

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      clearSession();
    }
    router.replace("/login");
  };

  const drawer = (
    <Box sx={{ pt: 1 }}>
      <Toolbar>
        <Typography variant="subtitle1" noWrap>
          {t("app.title")}
        </Typography>
      </Toolbar>
      <List>
        {visibleNav.map((item) => (
          <ListItemButton
            key={item.to}
            component={Link}
            href={item.to}
            selected={pathname.startsWith(item.to)}
            onClick={() => {
              if (!isDesktop) toggleSidebar();
            }}
          >
            <ListItemIcon>
              {item.to === "/alerts" && unreadCount > 0 ? (
                <Badge badgeContent={unreadCount} color="warning" max={99}>
                  {item.icon}
                </Badge>
              ) : (
                item.icon
              )}
            </ListItemIcon>
            <ListItemText primary={t(item.labelKey)} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          {!isDesktop && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={toggleSidebar}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            {t("app.title")}
          </Typography>
          {hasCapability("alerts:read") && <AlertsBellMenu />}
          <IconButton
            color="inherit"
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
            title={t("actions.toggle_language")}
          >
            <Typography variant="caption">{locale.toUpperCase()}</Typography>
          </IconButton>
          <IconButton
            color="inherit"
            onClick={() => setMode(mode === "light" ? "dark" : "light")}
            title={t("actions.toggle_theme")}
          >
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <IconButton
            color="inherit"
            onClick={handleLogout}
            title={t("actions.logout")}
          >
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isDesktop ? "permanent" : "temporary"}
        open={isDesktop || sidebarOpen}
        onClose={toggleSidebar}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        {drawer}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar />
        <Breadcrumbs
          separator={<ChevronRightIcon fontSize="small" />}
          sx={{ mb: 2 }}
        >
          <Typography color="text.primary">{t("app.title")}</Typography>
          <Typography color="text.primary">{t(breadcrumbKey)}</Typography>
        </Breadcrumbs>
        {username && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("shell.signed_in_as", { username })}
          </Typography>
        )}
        {children}
      </Box>
      <ToastHost />
    </Box>
  );
}
