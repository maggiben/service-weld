"use client";

import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { appLoginUrl } from "@/site";
import { COMPANY } from "../company";

export function LandingFooter() {
  const { t: translate } = useTranslation("landing");
  const year = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: "#121212",
        color: "#FFFFFF",
        py: { xs: 4, md: 5 },
        mt: 0,
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={3}
          justifyContent="space-between"
          alignItems={{ md: "flex-start" }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {COMPANY.legalName}
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.75, opacity: 0.85, maxWidth: 360 }}
            >
              {translate("footer.tagline")}
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 1.5, opacity: 0.85 }}
              component="div"
            >
              <Link
                href={`tel:${COMPANY.phone.tel}`}
                color="inherit"
                underline="hover"
              >
                {COMPANY.phone.display}
              </Link>
              {" · "}
              <Link
                href={`mailto:${COMPANY.email}`}
                color="inherit"
                underline="hover"
              >
                {COMPANY.email}
              </Link>
            </Typography>
            <Typography
              variant="caption"
              sx={{ display: "block", mt: 2, opacity: 0.7 }}
            >
              © {year} {COMPANY.legalName}. {translate("footer.rights")}
            </Typography>
          </Box>
          <Stack spacing={1.25} component="nav" aria-label="Social">
            <Link
              href={COMPANY.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              underline="hover"
              sx={{
                opacity: 0.9,
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <FacebookIcon fontSize="small" aria-hidden />
              {translate("footer.facebook")}
            </Link>
            <Link
              href={COMPANY.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              underline="hover"
              sx={{
                opacity: 0.9,
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <InstagramIcon fontSize="small" aria-hidden />
              {translate("footer.instagram")}
            </Link>
            <Link
              href={appLoginUrl()}
              color="inherit"
              underline="hover"
              sx={{ opacity: 0.9 }}
            >
              {translate("footer.login")}
            </Link>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
