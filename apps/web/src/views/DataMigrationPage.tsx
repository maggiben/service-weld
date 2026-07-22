"use client";

import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import HistoryIcon from "@mui/icons-material/History";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SyncIcon from "@mui/icons-material/Sync";
import VerifiedIcon from "@mui/icons-material/Verified";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  MigrationExportDataset,
  MigrationWorkbookSlot,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RequireCapability } from "../auth/RequireAuth";
import { useNotificationStore } from "../store/notificationStore";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DataMigrationPageInner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useNotificationStore((s) => s.pushToast);
  const [tab, setTab] = useState(0);
  const [label, setLabel] = useState("");
  const [confirmSync, setConfirmSync] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] =
    useState<MigrationWorkbookSlot | null>(null);
  const fileRefs = useRef<
    Record<MigrationWorkbookSlot, HTMLInputElement | null>
  >({
    junin: null,
    chacabuco: null,
    propios: null,
  });

  const statusQuery = useQuery({
    queryKey: ["migration-data-status"],
    queryFn: () => api.getMigrationDataStatus(),
    refetchInterval: (q) => (q.state.data?.busy ? 3000 : false),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["migration-data-status"] });

  const uploadMut = useMutation({
    mutationFn: async ({
      slot,
      file,
    }: {
      slot: MigrationWorkbookSlot;
      file: File;
    }) => api.uploadMigrationWorkbook(slot, file, file.name),
    onSuccess: () => {
      pushToast(t("migration_data.upload_ok"));
      void invalidate();
    },
    onError: (err) => pushToast(errorMessage(err)),
    onSettled: () => setUploadingSlot(null),
  });

  const dryRunMut = useMutation({
    mutationFn: () => api.dryRunMigration({ label: label || undefined }),
    onSuccess: (result) => {
      pushToast(
        t("migration_data.dry_run_ok", {
          clean: String(result.report.imported_clean ?? "—"),
          flagged: String(result.report.flagged ?? "—"),
        }),
      );
      void invalidate();
    },
    onError: (err) => pushToast(errorMessage(err)),
  });

  const syncMut = useMutation({
    mutationFn: () =>
      api.syncMigration({ label: label || undefined, dry_run: false }),
    onSuccess: (result) => {
      pushToast(
        t("migration_data.sync_ok", {
          snapshot: result.snapshot_id ?? "—",
        }),
      );
      setConfirmSync(false);
      void invalidate();
    },
    onError: (err) => pushToast(errorMessage(err)),
  });

  const rollbackMut = useMutation({
    mutationFn: (snapshot_id: string) => api.rollbackMigration({ snapshot_id }),
    onSuccess: () => {
      pushToast(t("migration_data.rollback_ok"));
      setRollbackId(null);
      void invalidate();
    },
    onError: (err) => pushToast(errorMessage(err)),
  });

  const markGoodMut = useMutation({
    mutationFn: ({
      snapshot_id,
      good,
    }: {
      snapshot_id: string;
      good: boolean;
    }) => api.markMigrationSnapshotGood({ snapshot_id, good }),
    onSuccess: () => void invalidate(),
    onError: (err) => pushToast(errorMessage(err)),
  });

  const exportMut = useMutation({
    mutationFn: async (dataset: MigrationExportDataset) => {
      const { blob, filename } = await api.downloadMigrationExport(dataset);
      downloadBlob(blob, filename);
    },
    onSuccess: () => pushToast(t("migration_data.export_ok")),
    onError: (err) => pushToast(errorMessage(err)),
  });

  const status = statusQuery.data;
  const busy =
    status?.busy ||
    dryRunMut.isPending ||
    syncMut.isPending ||
    rollbackMut.isPending ||
    exportMut.isPending;
  const guideBySlot = new Map(
    (status?.workbook_guide ?? []).map((g) => [g.slot, g]),
  );

  const onPick = (slot: MigrationWorkbookSlot, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploadingSlot(slot);
    uploadMut.mutate({ slot, file });
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {t("migration_data.title")}
        </Typography>
        <Typography color="text.secondary" maxWidth={720}>
          {t("migration_data.subtitle")}
        </Typography>
      </Box>

      {statusQuery.isError && (
        <Alert severity="error">{errorMessage(statusQuery.error)}</Alert>
      )}
      {busy && <LinearProgress />}

      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab
          icon={<CloudUploadIcon />}
          iconPosition="start"
          label={t("migration_data.tab_import")}
        />
        <Tab
          icon={<CloudDownloadIcon />}
          iconPosition="start"
          label={t("migration_data.tab_export")}
        />
        <Tab
          icon={<HistoryIcon />}
          iconPosition="start"
          label={t("migration_data.tab_versions")}
        />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Alert severity="info">{t("migration_data.import_help")}</Alert>
          <Alert severity="warning">{t("migration_data.xls_only")}</Alert>

          {(["junin", "chacabuco", "propios"] as MigrationWorkbookSlot[]).map(
            (slot) => {
              const guide = guideBySlot.get(slot);
              const uploaded = status?.uploads.find((u) => u.slot === slot);
              return (
                <Paper key={slot} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Box flex={1}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={0.5}
                      >
                        <Typography variant="subtitle1" fontWeight={600}>
                          {guide?.title ?? slot}
                        </Typography>
                        {uploaded ? (
                          <Chip
                            size="small"
                            color="success"
                            label={t("migration_data.uploaded")}
                          />
                        ) : (
                          <Chip
                            size="small"
                            color="warning"
                            label={t("migration_data.missing")}
                          />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {guide?.description}
                      </Typography>
                      <Typography variant="caption" display="block" mt={0.5}>
                        {t("migration_data.expect_file", {
                          name: guide?.filename_hint ?? `${slot}.xls`,
                        })}
                      </Typography>
                      {uploaded && (
                        <Typography variant="caption" display="block">
                          {uploaded.original_name} ·{" "}
                          {formatBytes(uploaded.size_bytes)} ·{" "}
                          {new Date(uploaded.uploaded_at).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <input
                        ref={(el) => {
                          fileRefs.current[slot] = el;
                        }}
                        type="file"
                        accept=".xls,application/vnd.ms-excel"
                        hidden
                        onChange={(e) => {
                          onPick(slot, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        variant="contained"
                        startIcon={
                          uploadingSlot === slot ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <CloudUploadIcon />
                          )
                        }
                        disabled={busy}
                        onClick={() => fileRefs.current[slot]?.click()}
                      >
                        {uploaded
                          ? t("migration_data.replace")
                          : t("migration_data.upload")}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              );
            },
          )}

          <Divider />

          <TextField
            label={t("migration_data.version_label")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            helperText={t("migration_data.version_label_help")}
            fullWidth
            disabled={busy}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              disabled={busy || !status?.ready_to_run}
              onClick={() => dryRunMut.mutate()}
            >
              {t("migration_data.dry_run")}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SyncIcon />}
              disabled={busy || !status?.ready_to_run}
              onClick={() => setConfirmSync(true)}
            >
              {t("migration_data.sync")}
            </Button>
          </Stack>

          {!status?.ready_to_run && status && (
            <Alert severity="warning">
              {t("migration_data.missing_slots", {
                slots: status.missing_slots.join(", "),
              })}
            </Alert>
          )}

          {status?.last_report && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {t("migration_data.last_report")}
                {status.last_report_at
                  ? ` · ${new Date(status.last_report_at).toLocaleString()}`
                  : ""}
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  overflow: "auto",
                  maxHeight: 280,
                  fontSize: 12,
                }}
              >
                {JSON.stringify(status.last_report, null, 2)}
              </Box>
            </Paper>
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Alert severity="info">{t("migration_data.export_help")}</Alert>
          {(
            [
              ["all", "migration_data.export_all"],
              ["clients", "migration_data.export_clients"],
              ["cylinders", "migration_data.export_cylinders"],
              ["movements", "migration_data.export_movements"],
              ["exceptions", "migration_data.export_exceptions"],
            ] as const
          ).map(([dataset, labelKey]) => (
            <Paper key={dataset} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {t(labelKey)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(`${labelKey}_help`)}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={
                    exportMut.isPending ? (
                      <CircularProgress size={16} />
                    ) : (
                      <CloudDownloadIcon />
                    )
                  }
                  disabled={busy}
                  onClick={() =>
                    exportMut.mutate(dataset as MigrationExportDataset)
                  }
                >
                  {t("migration_data.download")}
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Alert severity="info">{t("migration_data.versions_help")}</Alert>
          {(status?.snapshots.length ?? 0) === 0 && (
            <Alert severity="warning">{t("migration_data.no_snapshots")}</Alert>
          )}
          {status?.snapshots.map((snap) => (
            <Paper key={snap.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
              >
                <Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    mb={0.5}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      {snap.label}
                    </Typography>
                    {snap.marked_good && (
                      <Chip
                        size="small"
                        color="success"
                        icon={<VerifiedIcon />}
                        label={t("migration_data.marked_good")}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" display="block">
                    {snap.id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(snap.created_at).toLocaleString()}
                    {snap.dump_bytes
                      ? ` · ${formatBytes(snap.dump_bytes)}`
                      : ""}
                  </Typography>
                  {snap.row_counts && (
                    <Typography variant="caption" display="block">
                      {Object.entries(snap.row_counts)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    startIcon={<VerifiedIcon />}
                    disabled={busy}
                    onClick={() =>
                      markGoodMut.mutate({
                        snapshot_id: snap.id,
                        good: !snap.marked_good,
                      })
                    }
                  >
                    {snap.marked_good
                      ? t("migration_data.unmark_good")
                      : t("migration_data.mark_good")}
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    startIcon={<RestartAltIcon />}
                    disabled={busy}
                    onClick={() => setRollbackId(snap.id)}
                  >
                    {t("migration_data.rollback")}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={confirmSync} onClose={() => !busy && setConfirmSync(false)}>
        <DialogTitle>{t("migration_data.sync_confirm_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("migration_data.sync_confirm_body")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSync(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => syncMut.mutate()}
            disabled={busy}
            startIcon={
              syncMut.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SyncIcon />
              )
            }
          >
            {t("migration_data.sync")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(rollbackId)}
        onClose={() => !busy && setRollbackId(null)}
      >
        <DialogTitle>{t("migration_data.rollback_confirm_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("migration_data.rollback_confirm_body")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackId(null)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy || !rollbackId}
            onClick={() => rollbackId && rollbackMut.mutate(rollbackId)}
            startIcon={
              rollbackMut.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RestartAltIcon />
              )
            }
          >
            {t("migration_data.rollback")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function DataMigrationPage() {
  return (
    <RequireCapability capability="admin:write">
      <DataMigrationPageInner />
    </RequireCapability>
  );
}
