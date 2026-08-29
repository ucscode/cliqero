import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";

export class Account {
  constructor(readonly id: Id, readonly email: string, readonly handle: string, readonly country:string|null=null) {
    if (!email.includes("@")) throw new DomainInvariantError("A valid account email is required");
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(handle)) throw new DomainInvariantError("Account handle is invalid");
  }
}

export interface AccountReader {
  exists(accountId: Id): Promise<boolean>;
  findById?(accountId: Id): Promise<Account|null>;
}
