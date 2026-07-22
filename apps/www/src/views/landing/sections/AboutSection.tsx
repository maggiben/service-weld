"use client";

import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useTranslation } from "react-i18next";
import { COMPANY } from "../company";
import { LandingSection } from "./LandingSection";

const BULLETS = ["gases", "rental", "exchange", "refill", "supplies"] as const;

export function AboutSection() {
  const { t } = useTranslation("landing");

  return (
    <LandingSection
      id="about"
      eyebrow={t("about.eyebrow")}
      title={t("about.title")}
      bgcolor="background.paper"
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 4, md: 6 }}
        alignItems="stretch"
      >
        <Box sx={{ flex: 1.1 }}>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ fontSize: "1.05rem", lineHeight: 1.75, mb: 2 }}
          >
            {t("about.body")}
          </Typography>
          <List disablePadding dense>
            {BULLETS.map((key) => (
              <ListItem
                key={key}
                disableGutters
                sx={{ alignItems: "flex-start", py: 0.75 }}
              >
                <ListItemIcon sx={{ minWidth: 36, mt: 0.25 }}>
                  <CheckCircleOutlineIcon color="primary" fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={t(`about.bullets.${key}`)}
                  slotProps={{
                    primary: {
                      variant: "body1",
                      sx: { lineHeight: 1.55 },
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
        <Box
          sx={{
            flex: 0.9,
            borderRadius: 2,
            overflow: "hidden",
            boxShadow: (theme) =>
              theme.palette.mode === "light"
                ? "0 8px 28px rgba(0,0,0,0.08)"
                : "0 8px 28px rgba(0,0,0,0.45)",
            bgcolor: "action.hover",
            minHeight: { xs: 240, md: 360 },
          }}
        >
          <Box
            component="img"
            src={COMPANY.images.about}
            alt={t("about.imageAlt")}
            width={900}
            height={900}
            loading="lazy"
            decoding="async"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </Box>
      </Stack>
    </LandingSection>
  );
}
