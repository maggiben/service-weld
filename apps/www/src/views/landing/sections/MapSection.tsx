"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildDirectionsUrl,
  buildMapsEmbedUrl,
  formatAddressOneLine,
} from "../company";
import { LandingSection } from "./LandingSection";

/** Lazy-loads the map iframe when the section approaches the viewport (013 C6). */
export function MapSection() {
  const { t: translate } = useTranslation("landing");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [showMap, setShowMap] = useState(false);
  const address = formatAddressOneLine();
  const embedSrc = buildMapsEmbedUrl(address);
  const directionsHref = buildDirectionsUrl(address);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || showMap) return;
    if (typeof IntersectionObserver === "undefined") {
      setShowMap(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowMap(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showMap]);

  return (
    <LandingSection
      id="map"
      eyebrow={translate("map.eyebrow")}
      title={translate("map.title")}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="body1" color="text.secondary">
            {address}
          </Typography>
          <Button
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            color="primary"
            endIcon={<OpenInNewIcon />}
          >
            {translate("map.directions")}
          </Button>
        </Stack>
        <Box
          ref={hostRef}
          sx={{
            borderRadius: 2,
            overflow: "hidden",
            border: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
            height: { xs: 280, md: 400 },
          }}
        >
          {showMap ? (
            <Box
              component="iframe"
              title={translate("map.iframeTitle")}
              src={embedSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              sx={{
                border: 0,
                width: "100%",
                height: "100%",
                display: "block",
              }}
            />
          ) : (
            <Box
              sx={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                color: "text.secondary",
                px: 2,
                textAlign: "center",
              }}
            >
              <Typography variant="body2">{address}</Typography>
            </Box>
          )}
        </Box>
      </Stack>
    </LandingSection>
  );
}
