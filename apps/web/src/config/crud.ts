import { loadSiteConfiguration } from "./site-loader";

/** Resolves the server-enforced maximum for a cursor-paginated CRUD collection. */
export function crudMaxRows(override?: number): number {
  if (override !== undefined) {
    if (!Number.isInteger(override) || override < 1 || override > 200)
      throw new Error("CRUD maxRows must be an integer between 1 and 200");
    return override;
  }
  return loadSiteConfiguration().crud.table.max_rows;
}
