"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

export interface OperatorAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function OperatorActionsMenu({
  actions,
  label = "Row actions",
}: {
  actions: readonly OperatorAction[];
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            onSelect={action.onSelect}
            className={action.destructive ? "text-red-700 focus:text-red-800" : undefined}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
