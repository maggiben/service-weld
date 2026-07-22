"use client";

import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { COMPANY, formatAddressLines } from "../company";
import { LandingSection } from "./LandingSection";

type RowProps = {
  Icon: SvgIconComponent;
  label: string;
  value: string;
  pending?: boolean;
};

function ContactRow({ Icon, label, value, pending }: RowProps) {
  return (
    <Stack direction="row" spacing={2} alignItems="flex-start">
      <Icon color="primary" sx={{ mt: 0.25 }} aria-hidden />
      <Box>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ lineHeight: 1.2 }}
        >
          {label}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 500,
            fontStyle: pending ? "italic" : "normal",
            color: pending ? "text.secondary" : "text.primary",
            whiteSpace: "pre-line",
          }}
        >
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

export function ContactSection() {
  const { t } = useTranslation("landing");
  const address = formatAddressLines(COMPANY.address).join("\n");

  return (
    <LandingSection
      id="contact"
      eyebrow={t("contact.eyebrow")}
      title={t("contact.title")}
      subtitle={t("contact.subtitle")}
      bgcolor="background.paper"
    >
      <Stack spacing={3} sx={{ maxWidth: 520 }}>
        <ContactRow
          Icon={PlaceOutlinedIcon}
          label={t("contact.addressLabel")}
          value={address}
        />
        {/* TODO(013): publish phone once verified against an official source */}
        <ContactRow
          Icon={PhoneOutlinedIcon}
          label={t("contact.phoneLabel")}
          value={t("contact.phonePending")}
          pending
        />
        {/* TODO(013): publish email once verified */}
        <ContactRow
          Icon={EmailOutlinedIcon}
          label={t("contact.emailLabel")}
          value={t("contact.emailPending")}
          pending
        />
        {/* TODO(013): publish business hours once verified */}
        <ContactRow
          Icon={ScheduleOutlinedIcon}
          label={t("contact.hoursLabel")}
          value={t("contact.hoursPending")}
          pending
        />
        <Typography variant="caption" color="text.secondary">
          {t("contact.verifyNote")}
        </Typography>
      </Stack>
    </LandingSection>
  );
}
