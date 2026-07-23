"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { appLoginUrl } from "@/site";
import { COMPANY } from "../company";

export function HeroSection() {
  const { t: translate } = useTranslation("landing");

  return (
    <Box
      component="section"
      aria-labelledby="hero-title"
      sx={{
        position: "relative",
        color: "#fff",
        minHeight: { xs: "78vh", md: "88vh" },
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <Box
        component="img"
        src={COMPANY.images.hero}
        alt=""
        width={1600}
        height={1067}
        fetchPriority="high"
        decoding="async"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(105deg, rgba(8,8,8,0.88) 0%, rgba(8,8,8,0.72) 42%, rgba(8,8,8,0.45) 100%)",
        }}
      />
      <Container
        maxWidth="lg"
        sx={{ position: "relative", py: { xs: 8, md: 12 } }}
      >
        <Stack spacing={3} sx={{ maxWidth: 640 }}>
          <Box
            component="img"
            src={COMPANY.images.logoDarkBg}
            alt={COMPANY.legalName}
            width={280}
            height={96}
            sx={{
              width: { xs: 200, sm: 260 },
              height: "auto",
              display: "block",
            }}
          />
          <Typography
            id="hero-title"
            component="h1"
            variant="h2"
            sx={{
              fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
              lineHeight: 1.15,
              fontWeight: 700,
            }}
          >
            {translate("hero.headline")}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: { xs: "1.05rem", md: "1.15rem" },
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.88)",
              maxWidth: 540,
            }}
          >
            {translate("hero.description")}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ pt: 1 }}
          >
            <Button
              href={appLoginUrl()}
              variant="contained"
              color="primary"
              size="large"
              sx={{ px: 3.5, py: 1.25 }}
            >
              {translate("hero.ctaLogin")}
            </Button>
            <Button
              href="#contact"
              variant="outlined"
              size="large"
              sx={{
                px: 3.5,
                py: 1.25,
                color: "#fff",
                borderColor: "rgba(255,255,255,0.55)",
                "&:hover": {
                  borderColor: "#fff",
                  bgcolor: "rgba(255,255,255,0.08)",
                },
              }}
            >
              {translate("hero.ctaContact")}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
