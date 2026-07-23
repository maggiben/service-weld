"use client";

import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SyncIcon from "@mui/icons-material/Sync";
import TerminalIcon from "@mui/icons-material/Terminal";
import VerifiedIcon from "@mui/icons-material/Verified";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MIGRATION_PURGE_CONFIRMATION,
  type MigrationExportDataset,
  type MigrationWorkbookSlot,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RequireCapability } from "../auth/RequireAuth";
import {
  formatBytes,
  migrationErrorMessage,
} from "../features/migration/migrationLogic";
import { useNotificationStore } from "../store/notificationStore";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const left = document.createElement("a");
  left.href = url;
  left.download = filename;
  left.click();
  URL.revokeObjectURL(url);
}

function DataMigrationPageInner() {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useNotificationStore((state) => state.pushToast);
  const [tab, setTab] = useState(0);
  const [label, setLabel] = useState("");
  const [confirmSync, setConfirmSync] = useState(false);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [uploadingSlot, setUploadingSlot] =
    useState<MigrationWorkbookSlot | null>(null);
  const [uploadPct, setUploadPct] = useState<
    Partial<Record<MigrationWorkbookSlot, number>>
  >({});
  const terminalRef = useRef<HTMLPreElement | null>(null);
  const seenJobStart = useRef<string | null>(null);
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
    refetchInterval: (query) => {
      const job = query.state.data?.live_job;
      if (query.state.data?.busy || job?.state === "running") return 1000;
      return false;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["migration-data-status"] });

  const liveJob = statusQuery.data?.live_job ?? null;
  const jobRunning = Boolean(
    statusQuery.data?.busy || liveJob?.state === "running",
  );

  useEffect(() => {
    if (!liveJob || liveJob.state === "running") return;
    if (seenJobStart.current === liveJob.started_at) {
      // already toasted this completion
      return;
    }
    // Only toast if we were watching this job in the dialog / after start
    if (!jobDialogOpen && !confirmSync) return;
    seenJobStart.current = liveJob.started_at;
    if (liveJob.state === "succeeded") {
      const report = liveJob.result?.report as
        Record<string, unknown> | undefined;
      if (liveJob.kind === "sync") {
        pushToast(
          translate("migration_data.sync_ok", {
            snapshot: String(liveJob.result?.snapshot_id ?? "—"),
          }),
        );
      } else {
        pushToast(
          translate("migration_data.dry_run_ok", {
            clean: String(report?.imported_clean ?? "—"),
            flagged: String(report?.flagged ?? "—"),
          }),
        );
      }
      void invalidate();
    } else if (liveJob.state === "failed") {
      pushToast(liveJob.error ?? translate("migration_data.job_failed"));
    }
  }, [liveJob, jobDialogOpen, confirmSync, pushToast, translate]);

  useEffect(() => {
    if (!terminalOpen || !terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [liveJob?.lines?.length, terminalOpen]);

  const uploadMut = useMutation({
    mutationFn: async ({
      slot,
      file,
    }: {
      slot: MigrationWorkbookSlot;
      file: File;
    }) =>
      api.uploadMigrationWorkbook(slot, file, file.name, {
        onProgress: (pct) => setUploadPct((prev) => ({ ...prev, [slot]: pct })),
      }),
    onSuccess: () => {
      pushToast(translate("migration_data.upload_ok"));
      void invalidate();
    },
    onError: (err) => pushToast(migrationErrorMessage(err)),
    onSettled: (_d, _e, vars) => {
      setUploadingSlot(null);
      if (vars?.slot) {
        setUploadPct((prev) => {
          const next = { ...prev };
          delete next[vars.slot];
          return next;
        });
      }
    },
  });

  const startJobMut = useMutation({
    mutationFn: async (kind: "sync" | "dry_run") => {
      seenJobStart.current = null;
      if (kind === "sync") {
        return api.syncMigration({ label: label || undefined, dry_run: false });
      }
      return api.dryRunMigration({ label: label || undefined });
    },
    onSuccess: () => {
      setConfirmSync(false);
      setJobDialogOpen(true);
      setTerminalOpen(true);
      void invalidate();
    },
    onError: (err) => pushToast(migrationErrorMessage(err)),
  });

  const rollbackMut = useMutation({
    mutationFn: (snapshot_id: string) => api.rollbackMigration({ snapshot_id }),
    onSuccess: () => {
      pushToast(translate("migration_data.rollback_ok"));
      setRollbackId(null);
      void invalidate();
    },
    onError: (err) => pushToast(migrationErrorMessage(err)),
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
    onError: (err) => pushToast(migrationErrorMessage(err)),
  });

  const exportMut = useMutation({
    mutationFn: async (dataset: MigrationExportDataset) => {
      const { blob, filename } = await api.downloadMigrationExport(dataset);
      downloadBlob(blob, filename);
    },
    onSuccess: () => pushToast(translate("migration_data.export_ok")),
    onError: (err) => pushToast(migrationErrorMessage(err)),
  });

  const purgeMut = useMutation({
    mutationFn: () =>
      api.purgeBusinessData({ confirmation: MIGRATION_PURGE_CONFIRMATION }),
    onSuccess: () => {
      pushToast(translate("migration_data.purge_ok"));
      setPurgeOpen(false);
      setPurgeConfirm("");
      void invalidate();
    },
    onError: (err) => pushToast(migrationErrorMessage(err)),
  });

  const status = statusQuery.data;
  const busy =
    jobRunning ||
    startJobMut.isPending ||
    rollbackMut.isPending ||
    exportMut.isPending ||
    purgeMut.isPending ||
    uploadingSlot != null;
  const purgePhraseOk = purgeConfirm.trim() === MIGRATION_PURGE_CONFIRMATION;
  const guideBySlot = new Map(
    (status?.workbook_guide ?? []).map((gas) => [gas.slot, gas]),
  );

  const onPick = (slot: MigrationWorkbookSlot, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploadingSlot(slot);
    setUploadPct((prev) => ({ ...prev, [slot]: 0 }));
    uploadMut.mutate({ slot, file });
  };

  const progressPct = liveJob?.progress_pct;
  const canCloseJobDialog = !jobRunning;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {translate("migration_data.title")}
        </Typography>
        <Typography color="text.secondary" maxWidth={720}>
          {translate("migration_data.subtitle")}
        </Typography>
      </Box>

      {statusQuery.isError && (
        <Alert severity="error">
          {migrationErrorMessage(statusQuery.error)}
        </Alert>
      )}
      {busy && !jobDialogOpen && <LinearProgress />}

      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab
          icon={<CloudUploadIcon />}
          iconPosition="start"
          label={translate("migration_data.tab_import")}
        />
        <Tab
          icon={<CloudDownloadIcon />}
          iconPosition="start"
          label={translate("migration_data.tab_export")}
        />
        <Tab
          icon={<HistoryIcon />}
          iconPosition="start"
          label={translate("migration_data.tab_versions")}
        />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Alert severity="info">
            {translate("migration_data.import_help")}
          </Alert>
          <Alert severity="warning">
            {translate("migration_data.xls_only")}
          </Alert>

          {(["junin", "chacabuco", "propios"] as MigrationWorkbookSlot[]).map(
            (slot) => {
              const guide = guideBySlot.get(slot);
              const uploaded = status?.uploads.find(
                (item) => item.slot === slot,
              );
              const pct = uploadPct[slot];
              const isUploading = uploadingSlot === slot;
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
                        {isUploading ? (
                          <Chip
                            size="small"
                            color="info"
                            label={translate("migration_data.uploading", {
                              pct: pct ?? 0,
                            })}
                          />
                        ) : uploaded ? (
                          <Chip
                            size="small"
                            color="success"
                            label={translate("migration_data.uploaded")}
                          />
                        ) : (
                          <Chip
                            size="small"
                            color="warning"
                            label={translate("migration_data.missing")}
                          />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {guide?.description}
                      </Typography>
                      <Typography variant="caption" display="block" mt={0.5}>
                        {translate("migration_data.expect_file", {
                          name: guide?.filename_hint ?? `${slot}.xls`,
                        })}
                      </Typography>
                      {uploaded && !isUploading && (
                        <Typography variant="caption" display="block">
                          {uploaded.original_name} ·{" "}
                          {formatBytes(uploaded.size_bytes)} ·{" "}
                          {new Date(uploaded.uploaded_at).toLocaleString()}
                        </Typography>
                      )}
                      {isUploading && (
                        <Box mt={1.5}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            mb={0.5}
                          >
                            <Typography variant="caption">
                              {translate("migration_data.upload_progress")}
                            </Typography>
                            <Typography variant="caption">
                              {pct ?? 0}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pct ?? 0}
                          />
                        </Box>
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
                        onChange={(event) => {
                          onPick(slot, event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <Button
                        variant="contained"
                        startIcon={
                          isUploading ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <CloudUploadIcon />
                          )
                        }
                        disabled={busy}
                        onClick={() => fileRefs.current[slot]?.click()}
                      >
                        {uploaded
                          ? translate("migration_data.replace")
                          : translate("migration_data.upload")}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              );
            },
          )}

          <Divider />

          <TextField
            label={translate("migration_data.version_label")}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            helperText={translate("migration_data.version_label_help")}
            fullWidth
            disabled={busy}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              disabled={busy || !status?.ready_to_run}
              onClick={() => startJobMut.mutate("dry_run")}
            >
              {translate("migration_data.dry_run")}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SyncIcon />}
              disabled={busy || !status?.ready_to_run}
              onClick={() => setConfirmSync(true)}
            >
              {translate("migration_data.sync")}
            </Button>
            {(jobRunning || liveJob) && (
              <Button
                variant="text"
                startIcon={<TerminalIcon />}
                onClick={() => {
                  setJobDialogOpen(true);
                  setTerminalOpen(true);
                }}
              >
                {translate("migration_data.open_terminal")}
              </Button>
            )}
          </Stack>

          {!status?.ready_to_run && status && (
            <Alert severity="warning">
              {translate("migration_data.missing_slots", {
                slots: status.missing_slots.join(", "),
              })}
            </Alert>
          )}

          {status?.last_report && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {translate("migration_data.last_report")}
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
          <Alert severity="info">
            {translate("migration_data.export_help")}
          </Alert>
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
                    {translate(labelKey)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {translate(`${labelKey}_help`)}
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
                  {translate("migration_data.download")}
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Alert severity="info">
            {translate("migration_data.versions_help")}
          </Alert>
          {(status?.snapshots.length ?? 0) === 0 && (
            <Alert severity="warning">
              {translate("migration_data.no_snapshots")}
            </Alert>
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
                        label={translate("migration_data.marked_good")}
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
                        .map(([key, value]) => `${key}: ${value}`)
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
                      ? translate("migration_data.unmark_good")
                      : translate("migration_data.mark_good")}
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    startIcon={<RestartAltIcon />}
                    disabled={busy}
                    onClick={() => setRollbackId(snap.id)}
                  >
                    {translate("migration_data.rollback")}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderColor: "error.main",
              bgcolor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(211, 47, 47, 0.08)"
                  : "rgba(211, 47, 47, 0.04)",
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight={700}
              color="error"
              gutterBottom
            >
              {translate("migration_data.danger_zone")}
            </Typography>
            <Alert severity="error" sx={{ mb: 2 }}>
              {translate("migration_data.purge_warning")}
            </Alert>
            <Typography variant="body2" color="text.secondary" paragraph>
              {translate("migration_data.purge_keeps")}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {translate("migration_data.purge_deletes")}
            </Typography>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteForeverIcon />}
              disabled={busy}
              onClick={() => {
                setPurgeConfirm("");
                setPurgeOpen(true);
              }}
            >
              {translate("migration_data.purge_button")}
            </Button>
          </Paper>
        </Stack>
      )}

      <Dialog
        open={confirmSync}
        onClose={() => !startJobMut.isPending && setConfirmSync(false)}
      >
        <DialogTitle>
          {translate("migration_data.sync_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translate("migration_data.sync_confirm_body")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmSync(false)}
            disabled={startJobMut.isPending}
          >
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => startJobMut.mutate("sync")}
            disabled={startJobMut.isPending}
            startIcon={
              startJobMut.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SyncIcon />
              )
            }
          >
            {translate("migration_data.sync")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={jobDialogOpen}
        onClose={() => canCloseJobDialog && setJobDialogOpen(false)}
        maxWidth="md"
        fullWidth
        disableEscapeKeyDown={jobRunning}
      >
        <DialogTitle>
          {liveJob?.kind === "dry_run"
            ? translate("migration_data.job_title_dry_run")
            : translate("migration_data.job_title_sync")}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              {jobRunning ? (
                <Chip
                  size="small"
                  color="info"
                  label={translate("migration_data.job_running")}
                />
              ) : liveJob?.state === "succeeded" ? (
                <Chip
                  size="small"
                  color="success"
                  label={translate("migration_data.job_succeeded")}
                />
              ) : liveJob?.state === "failed" ? (
                <Chip
                  size="small"
                  color="error"
                  label={translate("migration_data.job_failed")}
                />
              ) : (
                <Chip
                  size="small"
                  label={translate("migration_data.job_idle")}
                />
              )}
              {liveJob?.phase && (
                <Typography variant="body2" color="text.secondary">
                  {translate("migration_data.job_phase", {
                    phase: liveJob.phase,
                  })}
                </Typography>
              )}
            </Stack>

            <Box>
              <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption">
                  {translate("migration_data.job_progress")}
                </Typography>
                <Typography variant="caption">
                  {progressPct != null ? `${progressPct}%` : "…"}
                </Typography>
              </Stack>
              <LinearProgress
                variant={progressPct != null ? "determinate" : "indeterminate"}
                value={progressPct ?? 0}
                color={liveJob?.state === "failed" ? "error" : "primary"}
              />
            </Box>

            {liveJob?.error && (
              <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
                {liveJob.error.slice(0, 4000)}
              </Alert>
            )}

            <Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <TerminalIcon fontSize="small" />
                  <Typography variant="subtitle2">
                    {translate("migration_data.terminal_title")}
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  onClick={() => setTerminalOpen((value) => !value)}
                  aria-label={translate("migration_data.terminal_toggle")}
                >
                  {terminalOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Stack>
              <Collapse in={terminalOpen}>
                <Box
                  ref={terminalRef}
                  component="pre"
                  sx={{
                    mt: 1,
                    m: 0,
                    p: 1.5,
                    bgcolor: "#0d1117",
                    color: "#c9d1d9",
                    borderRadius: 1,
                    overflow: "auto",
                    maxHeight: 320,
                    fontSize: 12,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {(liveJob?.lines?.length
                    ? liveJob.lines
                    : [translate("migration_data.terminal_waiting")]
                  ).join("\n")}
                </Box>
              </Collapse>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setJobDialogOpen(false)}
            disabled={!canCloseJobDialog}
          >
            {jobRunning
              ? translate("migration_data.job_running_hint")
              : translate("actions.close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(rollbackId)}
        onClose={() => !busy && setRollbackId(null)}
      >
        <DialogTitle>
          {translate("migration_data.rollback_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translate("migration_data.rollback_confirm_body")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackId(null)} disabled={busy}>
            {translate("actions.cancel")}
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
            {translate("migration_data.rollback")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={purgeOpen}
        onClose={() => {
          if (busy) return;
          setPurgeOpen(false);
          setPurgeConfirm("");
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error.main">
          {translate("migration_data.purge_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Alert severity="error" sx={{ mb: 2 }}>
              {translate("migration_data.purge_confirm_body")}
            </Alert>
            <Typography variant="body2" paragraph>
              {translate("migration_data.purge_type_prompt", {
                phrase: MIGRATION_PURGE_CONFIRMATION,
              })}
            </Typography>
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label={translate("migration_data.purge_type_label")}
            value={purgeConfirm}
            onChange={(event) => setPurgeConfirm(event.target.value)}
            disabled={busy}
            placeholder={MIGRATION_PURGE_CONFIRMATION}
            inputProps={{ autoComplete: "off", spellCheck: false }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setPurgeOpen(false);
              setPurgeConfirm("");
            }}
            disabled={busy}
          >
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy || !purgePhraseOk}
            onClick={() => purgeMut.mutate()}
            startIcon={
              purgeMut.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <DeleteForeverIcon />
              )
            }
          >
            {translate("migration_data.purge_button")}
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
