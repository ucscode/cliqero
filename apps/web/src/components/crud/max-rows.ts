export const CRUD_MAX_ROWS_MIN = 1;
export const CRUD_MAX_ROWS_MAX = 200;

export function validateCrudMaxRows(maxRows: number): number {
  if (!Number.isInteger(maxRows) || maxRows < CRUD_MAX_ROWS_MIN || maxRows > CRUD_MAX_ROWS_MAX) {
    throw new Error("CRUD maxRows must be an integer between 1 and 200");
  }

  return maxRows;
}

export function resolveCrudMaxRows(configuredMaxRows: number, override?: number): number {
  return validateCrudMaxRows(override ?? configuredMaxRows);
}
