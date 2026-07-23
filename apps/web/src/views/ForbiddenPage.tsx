"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { homePathForCapabilities } from "@/auth/homePath";
import { useSessionStore } from "@/store/sessionStore";

export default function ForbiddenPage() {
  const { t: translate } = useTranslation();
  const capabilities = useSessionStore((state) => state.user?.capabilities);
  const home = homePathForCapabilities(capabilities);

  return (
    <Box sx={{ py: 8, textAlign: "center" }}>
      <Typography variant="h4" gutterBottom>
        {translate("errors.forbidden_title")}
      </Typography>
      <Typography color="text.secondary">
        <Link href={home}>{translate("errors.forbidden_back")}</Link>
      </Typography>
    </Box>
  );
}
