import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";
import { isValidUsername, normalizeUsername } from "./username";

export class Account {
  constructor(
    readonly id: Id,
    username: string,
    readonly country: string | null = null,
  ) {
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
  findAuthenticationEmail?(accountId: Id): Promise<string | null>;
}
