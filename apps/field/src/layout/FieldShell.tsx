"use client";

import HomeIcon from "@mui/icons-material/Home";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SyncIcon from "@mui/icons-material/Sync";
import Badge from "@mui/material/Badge";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type PropsWithChildren } from "react";
import { useOutboxStore } from "@/store/outboxStore";
import { startOutboxSyncer } from "@/sync/syncer";

export default function FieldShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const pending = useOutboxStore((s) => s.pendingCount());
  const conflicts = useOutboxStore((s) => s.conflictCount());
  const syncBadge = pending + conflicts;

  useEffect(() => startOutboxSyncer(), []);

  const tab = pathname.startsWith("/capture")
    ? 1
    : pathname.startsWith("/sync")
      ? 2
      : 0;

  return (
    <Box sx={{ pb: 8, minHeight: "100dvh" }}>
      {children}
      <Paper
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0 }}
        elevation={8}
      >
        <BottomNavigation showLabels value={tab}>
          <BottomNavigationAction
            label="Inicio"
            icon={<HomeIcon />}
            component={Link}
            href="/"
          />
          <BottomNavigationAction
            label="Captura"
            icon={<QrCodeScannerIcon />}
            component={Link}
            href="/capture"
          />
          <BottomNavigationAction
            label="Sync"
            icon={
              <Badge badgeContent={syncBadge} color="warning" max={99}>
                <SyncIcon />
              </Badge>
            }
            component={Link}
            href="/sync"
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
