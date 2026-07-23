"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import type { ButtonProps } from "@mui/material/Button";
import type { MouseEvent, ReactNode } from "react";

export type GridActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  color?: ButtonProps["color"];
  disabled?: boolean;
};

type GridActionsCellProps = {
  actions: GridActionItem[];
  /** Stop row click handlers (default true). */
  stopPropagation?: boolean;
};

/** Compact labeled icon actions for DataGrid cells — aligned and consistent. */
export function GridActionsCell({
  actions,
  stopPropagation = true,
}: GridActionsCellProps) {
  if (actions.length === 0) return null;

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      justifyContent="flex-end"
      sx={{ width: "100%", height: "100%" }}
      onClick={
        stopPropagation
          ? (event) => {
              event.stopPropagation();
            }
          : undefined
      }
    >
      {actions.map((action) => (
        <Button
          key={action.key}
          size="small"
          color={action.color ?? "primary"}
          disabled={action.disabled}
          startIcon={action.icon}
          onClick={action.onClick}
          sx={{
            minWidth: "auto",
            whiteSpace: "nowrap",
            lineHeight: 1.25,
            py: 0.25,
            "& .MuiButton-startIcon": {
              marginRight: 0.5,
              marginLeft: 0,
              "& > *:nth-of-type(1)": { fontSize: 18 },
            },
          }}
        >
          {action.label}
        </Button>
      ))}
    </Stack>
  );
}

/** Column width for a fixed max number of labeled icon actions. */
export function gridActionsColumnWidth(maxActions: number): number {
  return Math.max(160, maxActions * 120 + 24);
}
