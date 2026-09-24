import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReader } from "@/modules/identity/account";
import type {
  SavedWithdrawalDestination,
  WithdrawalDestinationRepository,
} from "@/modules/withdrawal/withdrawal";
import { WithdrawalMethodRegistry } from "@/modules/withdrawal/methods/registry";

export class WithdrawalDestinationService {
  constructor(
    private readonly destinations: WithdrawalDestinationRepository,
    private readonly accounts: AccountReader,
    private readonly methods: WithdrawalMethodRegistry,
    private readonly uow: UnitOfWork,
  ) {}

  async methodsFor(accountId: string) {
    const account = await this.requireAccount(accountId);
    return this.methods.listForAccount(account).map((method) => ({
      id: method.id,
      display_name: method.display_name,
      description: method.description,
      fields: method.fields,
    }));
  }

  async list(accountId: string) {
    const account = await this.requireAccount(accountId);
    const destinations = await this.destinations.listForAccount(accountId);
    return destinations.map((destination) => this.present(destination, account.country));
  }

  async get(accountId: string, id: string) {
    const account = await this.requireAccount(accountId);
    const destination = await this.destinations.findById(id);
    if (!destination || destination.accountId !== accountId)
      throw new Error("Withdrawal destination not found");
    return this.present(destination, account.country);
  }

  async create(
    accountId: string,
    input: { method: string; name: string; values: Record<string, string> },
  ) {
    const account = await this.requireAccount(accountId);
    const method = this.methods.requireAvailable(input.method, account);
    const destination: SavedWithdrawalDestination = {
      id: newId(),
      accountId,
      method: method.id,
      name: this.normalizeName(input.name),
      fields: this.methods.enrich(method, input.values),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.uow.transaction(() => this.destinations.create(destination));
    return this.present(destination, account.country);
  }

  async update(
    accountId: string,
    id: string,
    input: { status?: "archived"; name?: string; values?: Record<string, string> },
  ) {
    return this.uow.transaction(async () => {
      const account = await this.requireAccount(accountId);
      const destination = await this.destinations.findById(id);
      if (!destination || destination.accountId !== accountId)
        throw new Error("Withdrawal destination not found");
      if (input.status === "archived") {
        if (destination.status !== "active") return this.present(destination, account.country);
        const archived = { ...destination, status: "archived" as const, updatedAt: new Date() };
        await this.destinations.update(archived);
        return this.present(archived, account.country);
      }
      if (destination.status !== "active")
        throw new Error("Archived withdrawal destinations cannot be edited");
      const method = this.methods.requireAvailable(destination.method, account);
      const updated: SavedWithdrawalDestination = {
        ...destination,
        name: input.name === undefined ? destination.name : this.normalizeName(input.name),
        fields:
          input.values === undefined
            ? this.methods.reconcile(method, destination.fields)
            : this.methods.enrich(method, input.values),
        updatedAt: new Date(),
      };
      await this.destinations.update(updated);
      return this.present(updated, account.country);
    });
  }

  async resolveForWithdrawal(accountId: string, id: string) {
    const account = await this.requireAccount(accountId);
    const destination = await this.destinations.findById(id);
    if (!destination || destination.accountId !== accountId)
      throw new Error("Withdrawal destination not found");
    if (destination.status !== "active") throw new Error("This withdrawal destination is archived");
    const method = this.methods.requireAvailable(destination.method, account);
    return {
      savedDestinationId: destination.id,
      method: method.id,
      methodName: method.display_name,
      name: destination.name,
      fields: this.methods.reconcile(method, destination.fields),
    };
  }

  private async requireAccount(accountId: string) {
    const account = await this.accounts.findById?.(accountId);
    if (!account) throw new Error("Account not found");
    return account;
  }

  private present(destination: SavedWithdrawalDestination, country: string | null) {
    const method = this.methods.find(destination.method);
    const countries = method?.filters.countries;
    const available = Boolean(
      method?.enabled && (countries === null || (country !== null && countries?.includes(country))),
    );
    return {
      id: destination.id,
      method: {
        id: destination.method,
        display_name: method?.display_name ?? destination.method,
        available,
      },
      name: destination.name,
      fields: destination.fields,
      status: destination.status,
      created_at: destination.createdAt.toISOString(),
      updated_at: destination.updatedAt.toISOString(),
    };
  }

  private normalizeName(value: string) {
    const name = value.trim();
    if (!name || name.length > 100) throw new Error("Destination name must be 1 to 100 characters");
    return name;
  }
}
