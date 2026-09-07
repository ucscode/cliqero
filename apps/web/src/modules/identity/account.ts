import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";
import { isValidUsername, normalizeUsername } from "./username";

export class Account {
  constructor(
    readonly id: Id,
    readonly email: string,
    username: string,
    readonly country: string | null = null,
    readonly displayName: string | null = null,
  ) {
    if (!email.includes("@")) throw new DomainInvariantError("A valid account email is required");
    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername))
      throw new DomainInvariantError("Account username is invalid");
    this.username = normalizedUsername;
  }

  readonly username: string;
}

export interface AccountReader {
  exists(accountId: Id): Promise<boolean>;
  findById?(accountId: Id): Promise<Account | null>;
}
