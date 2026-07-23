"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { LandingSection } from "./LandingSection";

const REASONS = [
  "experience",
  "customers",
  "supply",
  "service",
  "expertise",
  "attention",
] as const;

export function WhyUsSection() {
  const { t: translate } = useTranslation("landing");

  return (
    <LandingSection
      id="why"
      eyebrow={translate("why.eyebrow")}
      title={translate("why.title")}
      subtitle={translate("why.subtitle")}
      bgcolor="background.paper"
    >
      <Grid container spacing={3}>
        {REASONS.map((key, index) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box sx={{ pr: { md: 2 } }}>
              <Typography
                variant="overline"
                color="primary"
                sx={{ fontWeight: 700, letterSpacing: "0.08em" }}
              >
                {String(index + 1).padStart(2, "0")}
              </Typography>
              <Typography
                component="h3"
                variant="h6"
                sx={{ mt: 0.5, mb: 1, fontWeight: 650 }}
              >
                {translate(`why.items.${key}.title`)}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ lineHeight: 1.65 }}
              >
                {translate(`why.items.${key}.body`)}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </LandingSection>
  );
}
