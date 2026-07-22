"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { listThemePresets, type ThemeMode, type ThemePreset } from "@/theme";
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
  const { t } = useTranslation();
  const p = preset.preview;

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={t(`settings.themes.${preset.nameKey}`)}
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
          bgcolor: p.background,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <Box
          sx={{
            height: 22,
            bgcolor: p.appBar,
            color: p.appBarText,
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
              bgcolor: alpha(p.appBarText, 0.85),
              flexShrink: 0,
            }}
          />
          <Box
            sx={{
              height: 4,
              width: 36,
              borderRadius: 1,
              bgcolor: alpha(p.appBarText, 0.75),
            }}
          />
          <Box sx={{ flex: 1 }} />
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: alpha(p.appBarText, 0.7),
            }}
          />
        </Box>
        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              width: 28,
              bgcolor: p.sidebar,
              borderRight: `1px solid ${p.border}`,
              py: 0.75,
              px: 0.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            {[0.9, 0.55, 0.55, 0.4].map((opacity, i) => (
              <Box
                key={i}
                sx={{
                  height: 5,
                  borderRadius: 0.5,
                  bgcolor:
                    i === 0 ? alpha(p.primary, 0.85) : alpha(p.text, opacity),
                }}
              />
            ))}
          </Box>
          <Box sx={{ flex: 1, p: 0.75, minWidth: 0 }}>
            <Box
              sx={{
                height: "100%",
                bgcolor: p.paper,
                border: `1px solid ${p.border}`,
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
                  bgcolor: p.text,
                }}
              />
              <Box
                sx={{
                  height: 4,
                  width: "80%",
                  borderRadius: 0.5,
                  bgcolor: p.textMuted,
                }}
              />
              <Box
                sx={{
                  height: 4,
                  width: "65%",
                  borderRadius: 0.5,
                  bgcolor: p.textMuted,
                }}
              />
              <Box sx={{ flex: 1 }} />
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Box
                  sx={{
                    height: 12,
                    width: 28,
                    borderRadius: 0.5,
                    bgcolor: p.primary,
                  }}
                />
                <Box
                  sx={{
                    height: 12,
                    width: 20,
                    borderRadius: 0.5,
                    bgcolor: alpha(p.secondary, 0.85),
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="subtitle2" color="text.primary">
          {t(`settings.themes.${preset.nameKey}`)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t(`settings.themes.${preset.nameKey}_hint`)}
        </Typography>
      </Box>
    </Box>
  );
}

function ThemeGroup({ mode }: { mode: ThemeMode }) {
  const { t } = useTranslation();
  const themeId = useUiStore((s) => s.themeId);
  const setThemeId = useUiStore((s) => s.setThemeId);
  const presets = listThemePresets(mode);

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        {t(mode === "light" ? "settings.themes.light" : "settings.themes.dark")}
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
  const { t } = useTranslation();

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" gutterBottom>
          {t("settings.themes.title")}
        </Typography>
        <Typography color="text.secondary">
          {t("settings.themes.subtitle")}
        </Typography>
      </Box>
      <ThemeGroup mode="light" />
      <ThemeGroup mode="dark" />
    </Stack>
  );
}
