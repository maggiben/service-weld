"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import {
  listThemePresets,
  resolveThemeId,
  type ThemeMode,
  type ThemePreset,
} from "@/theme";
import { useUiStore } from "@/store/uiStore";

function ThemeThumbnail({
  preset,
  selected,
  onSelect,
}: {
  preset: ThemePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t: translate } = useTranslation();
  const part = preset.preview;

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={translate(`settings.themes.${preset.nameKey}`)}
      sx={{
        appearance: "none",
        border: "2px solid",
        borderColor: selected ? "primary.main" : "divider",
        borderRadius: 2,
        p: 0,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        bgcolor: "background.paper",
        width: "100%",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        boxShadow: selected
          ? (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`
          : "none",
        "&:hover": {
          borderColor: selected ? "primary.main" : "text.secondary",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          height: 112,
          bgcolor: part.background,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <Box
          sx={{
            height: 22,
            bgcolor: part.appBar,
            color: part.appBarText,
            display: "flex",
            alignItems: "center",
            px: 1,
            gap: 0.75,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: 0.5,
              bgcolor: alpha(part.appBarText, 0.85),
              flexShrink: 0,
            }}
          />
          <Box
            sx={{
              height: 4,
              width: 36,
              borderRadius: 1,
              bgcolor: alpha(part.appBarText, 0.75),
            }}
          />
          <Box sx={{ flex: 1 }} />
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: alpha(part.appBarText, 0.7),
            }}
          />
        </Box>
        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              width: 28,
              bgcolor: part.sidebar,
              borderRight: `1px solid ${part.border}`,
              py: 0.75,
              px: 0.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            {[0.9, 0.55, 0.55, 0.4].map((opacity, item) => (
              <Box
                key={item}
                sx={{
                  height: 5,
                  borderRadius: 0.5,
                  bgcolor:
                    item === 0
                      ? alpha(part.primary, 0.85)
                      : alpha(part.text, opacity),
                }}
              />
            ))}
          </Box>
          <Box sx={{ flex: 1, p: 0.75, minWidth: 0 }}>
            <Box
              sx={{
                height: "100%",
                bgcolor: part.paper,
                border: `1px solid ${part.border}`,
                borderRadius: 0.75,
                p: 0.75,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  height: 6,
                  width: "55%",
                  borderRadius: 0.5,
                  bgcolor: part.text,
                }}
              />
              <Box
                sx={{
                  height: 4,
                  width: "80%",
                  borderRadius: 0.5,
                  bgcolor: part.textMuted,
                }}
              />
              <Box
                sx={{
                  height: 4,
                  width: "65%",
                  borderRadius: 0.5,
                  bgcolor: part.textMuted,
                }}
              />
              <Box sx={{ flex: 1 }} />
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Box
                  sx={{
                    height: 12,
                    width: 28,
                    borderRadius: 0.5,
                    bgcolor: part.primary,
                  }}
                />
                <Box
                  sx={{
                    height: 12,
                    width: 20,
                    borderRadius: 0.5,
                    bgcolor: alpha(part.secondary, 0.85),
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="subtitle2" color="text.primary">
          {translate(`settings.themes.${preset.nameKey}`)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {translate(`settings.themes.${preset.nameKey}_hint`)}
        </Typography>
      </Box>
    </Box>
  );
}

function ThemeGroup({ mode }: { mode: ThemeMode }) {
  const { t: translate } = useTranslation();
  const themeId = resolveThemeId(useUiStore((state) => state.themeId));
  const setThemeId = useUiStore((state) => state.setThemeId);
  const presets = listThemePresets(mode);

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        {translate(
          mode === "light" ? "settings.themes.light" : "settings.themes.dark",
        )}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "1fr 1fr 1fr",
          },
        }}
      >
        {presets.map((preset) => (
          <ThemeThumbnail
            key={preset.id}
            preset={preset}
            selected={themeId === preset.id}
            onSelect={() => setThemeId(preset.id)}
          />
        ))}
      </Box>
    </Box>
  );
}

export function ThemePicker() {
  const { t: translate } = useTranslation();

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" gutterBottom>
          {translate("settings.themes.title")}
        </Typography>
        <Typography color="text.secondary">
          {translate("settings.themes.subtitle")}
        </Typography>
      </Box>
      <ThemeGroup mode="light" />
      <ThemeGroup mode="dark" />
    </Stack>
  );
}
