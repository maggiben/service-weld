"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <Box sx={{ py: 8, textAlign: "center" }}>
      <Typography variant="h4" gutterBottom>
        {t("errors.forbidden_title")}
      </Typography>
      <Typography color="text.secondary">
        <Link href="/clients">{t("errors.forbidden_back")}</Link>
      </Typography>
    </Box>
  );
}
