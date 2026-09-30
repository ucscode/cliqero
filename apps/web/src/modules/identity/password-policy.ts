/** Minimum password length shared by authentication entry points. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function assertPasswordMinimum(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

export function assertPasswordLength(password: string): void {
  assertPasswordMinimum(password);
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must contain no more than ${PASSWORD_MAX_LENGTH} characters`);
  }
}
