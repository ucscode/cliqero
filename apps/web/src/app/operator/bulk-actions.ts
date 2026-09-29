"use server";

import { headers } from "next/headers";
import { getContainer } from "@/infrastructure/container";
import {
  OperatorBulkWorkflow,
  type OperatorBulkCommand,
} from "@/application/operator/bulk-workflow";

export async function runOperatorBulkAction(command: OperatorBulkCommand) {
  const container = getContainer();
  const request = new Request("http://localhost/operator/bulk-action", {
    headers: new Headers(await headers()),
  });
  const principal = await container.principalResolver.resolve(request);
  if (principal.kind !== "user_session")
    throw new Error("An authenticated operator session is required.");
  return new OperatorBulkWorkflow(container).execute(principal.account, command);
}
