"use client";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@/store/uiStore";
import { appLoginUrl } from "@/site";
import { COMPANY } from "../company";

const NAV = [
  { href: "#about", key: "about" },
  { href: "#services", key: "services" },
  { href: "#why", key: "why" },
  { href: "#testimonials", key: "testimonials" },
  { href: "#contact", key: "contact" },
] as const;

export function LandingHeader() {
  const { t: translate } = useTranslation("landing");
  const mode = useUiStore((state) => state.mode);
  const locale = useUiStore((state) => state.locale);
  const setMode = useUiStore((state) => state.setMode);
  const setLocale = useUiStore((state) => state.setLocale);
  const logoSrc =
    mode === "dark" ? COMPANY.images.logoDarkBg : COMPANY.images.logoLightBg;

  return (
    <>
      <Link
        href="#main"
        sx={{
          position: "absolute",
          left: -9999,
          zIndex: (theme) => theme.zIndex.tooltip + 1,
          bgcolor: "background.paper",
          color: "text.primary",
          px: 2,
          py: 1,
          "&:focus": { left: 8, top: 8 },
        }}
      >
        {translate("nav.skip")}
      </Link>
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          color: "text.primary",
        }}
      >
        <Container maxWidth="lg" disableGutters>
          <Toolbar
            sx={{ gap: 1, minHeight: { xs: 64, md: 72 }, px: { xs: 2, md: 3 } }}
          >
            <Box
              component="img"
              src={logoSrc}
              alt={COMPANY.legalName}
              width={140}
              height={48}
              sx={{
                height: { xs: 36, md: 44 },
                width: "auto",
                display: "block",
                mr: 1,
              }}
            />
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ display: { xs: "none", md: "flex" }, flexGrow: 1, ml: 2 }}
              component="nav"
              aria-label="Primary"
            >
              {NAV.map((item) => (
                <Button
                  key={item.key}
                  href={item.href}
                  color="inherit"
                  size="small"
                  sx={{ fontWeight: 500, color: "text.secondary" }}
                >
                  {translate(`nav.${item.key}`)}
                </Button>
              ))}
            </Stack>
            <Box sx={{ flexGrow: { xs: 1, md: 0 } }} />
            <IconButton
              size="small"
              onClick={() => setLocale(locale === "es" ? "en" : "es")}
              aria-label={translate("a11y.toggleLanguage")}
              title={translate("a11y.toggleLanguage")}
            >
              <Typography variant="caption" fontWeight={700}>
                {locale.toUpperCase()}
              </Typography>
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setMode(mode === "light" ? "dark" : "light")}
              aria-label={translate("a11y.toggleTheme")}
              title={translate("a11y.toggleTheme")}
            >
              {mode === "light" ? (
                <DarkModeIcon fontSize="small" />
              ) : (
                <LightModeIcon fontSize="small" />
              )}
            </IconButton>
            <Button
              href={appLoginUrl()}
              variant="contained"
              color="primary"
              size="small"
              sx={{ ml: 0.5 }}
            >
              {translate("nav.login")}
            </Button>
          </Toolbar>
        </Container>
      </AppBar>
    </>
  );
}
