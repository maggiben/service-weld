"use client";

import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
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
  href?: string;
  pending?: boolean;
};

function ContactRow({ Icon, label, value, href, pending }: RowProps) {
  const valueNode = href ? (
    <Link
      href={href}
      underline="hover"
      color="inherit"
      sx={{ fontWeight: 500 }}
    >
      {value}
    </Link>
  ) : (
    value
  );

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
          component="div"
          sx={{
            fontWeight: 500,
            fontStyle: pending ? "italic" : "normal",
            color: pending ? "text.secondary" : "text.primary",
            whiteSpace: "pre-line",
          }}
        >
          {valueNode}
        </Typography>
      </Box>
    </Stack>
  );
}

export function ContactSection() {
  const { t: translate } = useTranslation("landing");
  const address = formatAddressLines(COMPANY.address).join("\n");

  return (
    <LandingSection
      id="contact"
      eyebrow={translate("contact.eyebrow")}
      title={translate("contact.title")}
      subtitle={translate("contact.subtitle")}
      bgcolor="background.paper"
    >
      <Stack spacing={3} sx={{ maxWidth: 520 }}>
        <ContactRow
          Icon={PlaceOutlinedIcon}
          label={translate("contact.addressLabel")}
          value={address}
        />
        <ContactRow
          Icon={PhoneOutlinedIcon}
          label={translate("contact.phoneLabel")}
          value={COMPANY.phone.display}
          href={`tel:${COMPANY.phone.tel}`}
        />
        <ContactRow
          Icon={EmailOutlinedIcon}
          label={translate("contact.emailLabel")}
          value={COMPANY.email}
          href={`mailto:${COMPANY.email}`}
        />
        <ContactRow
          Icon={ScheduleOutlinedIcon}
          label={translate("contact.hoursLabel")}
          value={COMPANY.hours.display}
        />
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ lineHeight: 1.2, display: "block", mb: 1.25 }}
          >
            {translate("contact.socialLabel")}
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Link
              href={COMPANY.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              color="inherit"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                fontWeight: 500,
              }}
            >
              <FacebookIcon color="primary" fontSize="small" aria-hidden />
              {translate("contact.facebook")}
            </Link>
            <Link
              href={COMPANY.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              color="inherit"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                fontWeight: 500,
              }}
            >
              <InstagramIcon color="primary" fontSize="small" aria-hidden />
              {translate("contact.instagram")}
            </Link>
          </Stack>
        </Box>
      </Stack>
    </LandingSection>
  );
}
