"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import LocalGasStationOutlinedIcon from "@mui/icons-material/LocalGasStationOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { LandingSection } from "./LandingSection";

const SERVICES: { key: string; Icon: SvgIconComponent }[] = [
  { key: "refill", Icon: LocalGasStationOutlinedIcon },
  { key: "exchange", Icon: SwapHorizOutlinedIcon },
  { key: "rental", Icon: Inventory2OutlinedIcon },
  { key: "gases", Icon: ScienceOutlinedIcon },
  { key: "accessories", Icon: BuildOutlinedIcon },
  { key: "safety", Icon: HealthAndSafetyOutlinedIcon },
];

export function ServicesSection() {
  const { t } = useTranslation("landing");

  return (
    <LandingSection
      id="services"
      eyebrow={t("services.eyebrow")}
      title={t("services.title")}
      subtitle={t("services.subtitle")}
    >
      <Grid container spacing={2.5}>
        {SERVICES.map(({ key, Icon }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box
              sx={{
                height: "100%",
                p: 2.5,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  borderColor: "primary.main",
                  boxShadow: (theme) =>
                    theme.palette.mode === "light"
                      ? "0 4px 16px rgba(10,122,62,0.08)"
                      : "0 4px 16px rgba(0,0,0,0.35)",
                },
              }}
            >
              <Icon
                color="primary"
                sx={{ mb: 1.5, fontSize: 28 }}
                aria-hidden
              />
              <Typography
                component="h3"
                variant="h6"
                sx={{ mb: 1, fontWeight: 650 }}
              >
                {t(`services.items.${key}.title`)}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ lineHeight: 1.65 }}
              >
                {t(`services.items.${key}.body`)}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </LandingSection>
  );
}
