"use client";

import { Fragment } from "react";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "../../ui/button";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

type OperatorActionBase = {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  requiredCapability?: Capability;
};

export type OperatorAction =
  | (OperatorActionBase & {
      type: "link";
      href: string;
      target?: "_blank";
      rel?: "noopener noreferrer";
    })
  | (OperatorActionBase & { type: "action"; onSelect: () => void });

export function visibleOperatorActions(
  actions: readonly OperatorAction[],
  capabilities: readonly string[],
) {
  return actions.filter(
    (action) =>
      !action.requiredCapability || hasCapability(capabilities, action.requiredCapability),
  );
}

export function operatorActionMenuItem(action: OperatorAction) {
  const className = action.destructive ? "text-red-700 focus:text-red-800" : undefined;
  if (action.type === "link")
    return (
      <DropdownMenuItem disabled={action.disabled} asChild={!action.disabled} className={className}>
        {action.disabled ? (
          <span>{action.label}</span>
        ) : (
          <Link href={action.href} target={action.target} rel={action.rel}>
            {action.label}
          </Link>
        )}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenuItem disabled={action.disabled} onSelect={action.onSelect} className={className}>
      {action.label}
    </DropdownMenuItem>
  );
}

export function OperatorActionsMenu({
  actions,
  label = "Row actions",
  capabilities = [],
}: {
  actions: readonly OperatorAction[];
  label?: string;
  capabilities?: readonly string[];
}) {
  const visibleActions = visibleOperatorActions(actions, capabilities);
  if (visibleActions.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className="hover:bg-slate-200 focus-visible:ring-2"
        >
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibleActions.map((action) => (
          <Fragment key={action.label}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            {operatorActionMenuItem(action)}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
