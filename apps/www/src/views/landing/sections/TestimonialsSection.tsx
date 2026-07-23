"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import {
  TESTIMONIAL_IDS,
  TESTIMONIAL_PHOTOS,
  type TestimonialId,
} from "../company";
import { LandingSection } from "./LandingSection";

/**
 * Temporary illustrative customer quotes (stock portraits + invented copy)
 * until verifiable public reviews are available. Marked as illustrative in UI.
 */

const scroll = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
`;

function ReviewCard({ id }: { id: TestimonialId }) {
  const { t: translate } = useTranslation("landing");

  return (
    <Box
      sx={{
        flex: "0 0 auto",
        width: { xs: 280, sm: 320 },
        p: 2.5,
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: (theme) =>
          theme.palette.mode === "light"
            ? "0 4px 18px rgba(0,0,0,0.06)"
            : "0 4px 18px rgba(0,0,0,0.35)",
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ mb: 1.75 }}
      >
        <Avatar
          src={TESTIMONIAL_PHOTOS[id]}
          alt=""
          sx={{ width: 48, height: 48 }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {translate(`testimonials.items.${id}.name`)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {translate(`testimonials.items.${id}.role`)}
          </Typography>
        </Box>
      </Stack>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ lineHeight: 1.65 }}
      >
        “{translate(`testimonials.items.${id}.quote`)}”
      </Typography>
    </Box>
  );
}

export function TestimonialsSection() {
  const { t: translate } = useTranslation("landing");
  const loop = [...TESTIMONIAL_IDS, ...TESTIMONIAL_IDS];

  return (
    <LandingSection
      id="testimonials"
      eyebrow={translate("testimonials.eyebrow")}
      title={translate("testimonials.title")}
      subtitle={translate("testimonials.subtitle")}
    >
      <Box
        sx={{
          overflow: "hidden",
          maskImage:
            "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
        }}
      >
        <Stack
          direction="row"
          spacing={2.5}
          aria-label={translate("testimonials.title")}
          sx={{
            width: "max-content",
            py: 0.5,
            animation: `${scroll} 48s linear infinite`,
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
              flexWrap: "wrap",
              width: "100%",
              justifyContent: "center",
            },
            "&:hover": {
              animationPlayState: "paused",
            },
          }}
        >
          {loop.map((id, index) => (
            <ReviewCard key={`${id}-${index}`} id={id} />
          ))}
        </Stack>
      </Box>
    </LandingSection>
  );
}
