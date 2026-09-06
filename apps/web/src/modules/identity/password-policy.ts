/** Minimum password length shared by authentication entry points. */
export const PASSWORD_MIN_LENGTH = 8;

export function assertPasswordMinimum(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}
