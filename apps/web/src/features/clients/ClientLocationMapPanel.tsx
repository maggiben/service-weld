"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { buildDirectionsUrl, buildMapsEmbedUrl } from "./clientLocationMap";

type ClientLocationMapPanelProps = {
  query: string;
  locale: string;
};

export function ClientLocationMapPanel({
  query,
  locale,
}: ClientLocationMapPanelProps) {
  const { t: translate } = useTranslation();
  const embedSrc = buildMapsEmbedUrl(
    query,
    locale.startsWith("en") ? "en" : "es",
  );
  const directionsHref = buildDirectionsUrl(query);

  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", minHeight: 360 }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="body2" color="text.secondary">
            {query}
          </Typography>
          <Button
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon />}
          >
            {translate("clients.detail.map.directions")}
          </Button>
        </Stack>
        <Box
          sx={{
            flex: 1,
            minHeight: 320,
            borderRadius: 1,
            overflow: "hidden",
            border: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Box
            component="iframe"
            title={translate("clients.detail.map.iframe_title")}
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
        </Box>
      </Stack>
    </Paper>
  );
}
