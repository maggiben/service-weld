"use client";

import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleIcon from "@mui/icons-material/People";
import PropaneTankIcon from "@mui/icons-material/PropaneTank";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import HandshakeIcon from "@mui/icons-material/Handshake";
import NotificationsIcon from "@mui/icons-material/Notifications";
import BuildIcon from "@mui/icons-material/Build";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import SettingsIcon from "@mui/icons-material/Settings";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import HistoryIcon from "@mui/icons-material/History";
import ImportExportIcon from "@mui/icons-material/ImportExport";
import DescriptionIcon from "@mui/icons-material/Description";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, PropsWithChildren } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import { useSessionStore } from "@/store/sessionStore";
import { useUiStore } from "@/store/uiStore";
import { useNotificationStore } from "@/store/notificationStore";
import { ToastHost } from "@/layout/ToastHost";
import { getThemePreset, resolveThemeId } from "@/theme";
import { AlertsBellMenu } from "@/features/alerts/AlertsBellMenu";
import { useAlertsInbox } from "@/features/alerts/useAlertsInbox";
import { userInitials } from "@/lib/userInitials";

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
    to: "/movements",
    labelKey: "nav.movements",
    capability: "movements:read",
    icon: <LocalShippingIcon />,
  },
  {
    to: "/refills",
    labelKey: "nav.refills",
    capability: "movements:read",
    icon: <LocalGasStationIcon />,
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
    to: "/delivery-notes",
    labelKey: "nav.delivery_notes",
    capability: "delivery_notes:read",
    icon: <DescriptionIcon />,
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
    to: "/batteries",
    labelKey: "nav.batteries",
    capability: "batteries:read",
    icon: <Inventory2Icon />,
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
    to: "/dashboard",
    labelKey: "nav.dashboard",
    capability: "billing:read",
    icon: <DashboardCustomizeIcon />,
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
  "/refills": "nav.refills",
  "/supplier-loans": "nav.supplier_loans",
  "/transfers": "nav.transfers",
  "/delivery-notes": "nav.delivery_notes",
  "/reconciliation": "nav.reconciliation",
  "/reports": "nav.reports",
  "/accessories": "nav.accessories",
  "/alerts": "nav.alerts",
  "/rates": "nav.rates",
  "/dashboard": "nav.dashboard",
  "/billing": "nav.billing",
  "/settings": "nav.settings",
  "/admin/users": "nav.users",
  "/admin/data": "nav.data_migration",
  "/audit-logs": "nav.audit",
};

export default function AppShell({ children }: PropsWithChildren) {
  const theme = useTheme();
  // noSsr: keep server + first client paint in sync (defaultMatches=false), then
  // update after mount — avoids hydration mismatch on drawer/AppBar chrome.
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });
  const { t: translate } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const hasCapability = useSessionStore((state) => state.hasCapability);
  const clearSession = useSessionStore((state) => state.clearSession);
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const themeId = useUiStore((state) => state.themeId);
  const setMode = useUiStore((state) => state.setMode);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const themePreset = getThemePreset(resolveThemeId(themeId));
  const mode = themePreset.mode;
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  useAlertsInbox();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

  const visibleNav = NAV_ITEMS.filter((item) => hasCapability(item.capability));

  const breadcrumbKey =
    Object.entries(BREADCRUMB_BY_PREFIX).find(([prefix]) =>
      pathname.startsWith(prefix),
    )?.[1] ?? "app.title";

  const handleLogout = async () => {
    setMenuAnchor(null);
    try {
      await api.logout();
    } catch {
      clearSession();
    }
    router.replace("/login");
  };

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const closeMenu = () => setMenuAnchor(null);

  const go = (path: string) => {
    closeMenu();
    router.push(path);
  };

  const drawer = (
    <Box sx={{ pt: 1 }}>
      <Toolbar>
        <Typography variant="subtitle1" noWrap>
          {translate("app.title")}
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
            <ListItemText primary={translate(item.labelKey)} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  const initials = userInitials(user?.username);

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
          <Box
            component={Link}
            href="/"
            aria-label={translate("app.title")}
            sx={{
              display: "flex",
              alignItems: "center",
              mr: 1.5,
              flexShrink: 0,
              lineHeight: 0,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Box
              component="img"
              src={
                themePreset.appBar.tone === "dark"
                  ? "/service-weld-remove-bg-bw.webp"
                  : "/service-weld-remove-bg-wb.webp"
              }
              alt="Service Weld"
              sx={{
                height: 36,
                width: "auto",
                display: "block",
              }}
            />
          </Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            {translate("app.title")}
          </Typography>
          {hasCapability("alerts:read") && <AlertsBellMenu />}
          <IconButton
            color="inherit"
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
            title={translate("actions.toggle_language")}
          >
            <Typography variant="caption">{locale.toUpperCase()}</Typography>
          </IconButton>
          <IconButton
            color="inherit"
            onClick={() => setMode(mode === "light" ? "dark" : "light")}
            title={translate("actions.toggle_theme")}
          >
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <IconButton
            color="inherit"
            onClick={openMenu}
            aria-controls={menuOpen ? "user-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? "true" : undefined}
            title={user?.username ?? translate("shell.user_menu")}
            sx={{ ml: 0.5 }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: 13,
                bgcolor: "secondary.main",
                color: "secondary.contrastText",
              }}
            >
              {initials}
            </Avatar>
          </IconButton>
          <Menu
            id="user-menu"
            anchorEl={menuAnchor}
            open={menuOpen}
            onClose={closeMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { minWidth: 220 } } }}
          >
            {user && (
              <Box sx={{ px: 2, py: 1.25 }}>
                <Typography variant="subtitle2" noWrap>
                  {user.username}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user.roles
                    .map((role) => translate(`enums.role.${role}`))
                    .join(", ")}
                </Typography>
              </Box>
            )}
            <Divider />
            <MenuItem onClick={() => go("/settings")}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              {translate("shell.menu.settings")}
            </MenuItem>
            {hasCapability("admin:write") && (
              <MenuItem onClick={() => go("/admin/users")}>
                <ListItemIcon>
                  <ManageAccountsIcon fontSize="small" />
                </ListItemIcon>
                {translate("shell.menu.users")}
              </MenuItem>
            )}
            {hasCapability("admin:write") && (
              <MenuItem onClick={() => go("/admin/data")}>
                <ListItemIcon>
                  <ImportExportIcon fontSize="small" />
                </ListItemIcon>
                {translate("shell.menu.data_migration")}
              </MenuItem>
            )}
            {hasCapability("audit:read") && (
              <MenuItem onClick={() => go("/audit-logs")}>
                <ListItemIcon>
                  <HistoryIcon fontSize="small" />
                </ListItemIcon>
                {translate("shell.menu.audit")}
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              {translate("actions.logout")}
            </MenuItem>
          </Menu>
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
            overflowY: "auto",
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
          <Typography color="text.primary">{translate("app.title")}</Typography>
          <Typography color="text.primary">
            {translate(breadcrumbKey)}
          </Typography>
        </Breadcrumbs>
        {children}
      </Box>
      <ToastHost />
    </Box>
  );
}
