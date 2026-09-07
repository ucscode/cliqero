import { z } from "zod";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

/** Canonical username input for Cliqero-owned HTTP contracts. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, "Username must use 3–32 lowercase letters, numbers, _ or -");

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}
