"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type SectionProps = {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  bgcolor?: string;
};

/** Shared section shell: landmark, max width, consistent vertical rhythm. */
export function LandingSection({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  bgcolor = "background.default",
}: SectionProps) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{
        bgcolor,
        py: { xs: 7, md: 10 },
        scrollMarginTop: 72,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 720, mb: { xs: 4, md: 5 } }}>
          {eyebrow ? (
            <Typography
              variant="overline"
              color="primary"
              sx={{ letterSpacing: "0.12em", fontWeight: 700 }}
            >
              {eyebrow}
            </Typography>
          ) : null}
          <Typography
            id={`${id}-title`}
            component="h2"
            variant="h3"
            sx={{
              mt: eyebrow ? 0.5 : 0,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{
                mt: 1.5,
                fontSize: { xs: "1rem", md: "1.05rem" },
                lineHeight: 1.65,
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {children}
      </Container>
    </Box>
  );
}
