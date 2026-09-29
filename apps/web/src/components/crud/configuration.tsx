"use client";

import { createContext, useContext, type ReactNode } from "react";
import { resolveCrudMaxRows } from "./max-rows";

const CrudMaxRowsContext = createContext(50);

export function CrudConfigurationProvider({
  maxRows,
  children,
}: {
  maxRows: number;
  children: ReactNode;
}) {
  return <CrudMaxRowsContext.Provider value={maxRows}>{children}</CrudMaxRowsContext.Provider>;
}

export function useCrudMaxRows(override?: number) {
  const configuredMaxRows = useContext(CrudMaxRowsContext);
  return resolveCrudMaxRows(configuredMaxRows, override);
}
