"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { LandingSection } from "./LandingSection";

/**
 * No verifiable public customer reviews were found for Service Weld S.R.L.
 * (municipal inauguration coverage quotes officials, not customers).
 * Spec 013 E1: ship an explicit placeholder — never fabricate testimonials.
 */
export function TestimonialsSection() {
  const { t: translate } = useTranslation("landing");

  return (
    <LandingSection
      id="testimonials"
      eyebrow={translate("testimonials.eyebrow")}
      title={translate("testimonials.title")}
    >
      <Box
        sx={{
          maxWidth: 720,
          p: { xs: 2.5, md: 3 },
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.7 }}
        >
          {translate("testimonials.placeholder")}
        </Typography>
      </Box>
    </LandingSection>
  );
}
