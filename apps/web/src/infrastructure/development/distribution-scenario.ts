import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { formatMinorMoney, Money } from "@/modules/money/money";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import type { LedgerEntry } from "@/modules/ledger/ledger";

const DEFAULT_BUYER_USERNAME = "central_left_1";
const DEFAULT_SELLER_USERNAME = "fixture_catalogue";
const DEFAULT_LISTING_EXTERNAL_KEY = "toolkit-01";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export type DistributionScenarioArguments = {
  buyerUsername: string;
  listingId?: string;
};

export type PersistedDistributionLine = {
  label: string;
  username: string;
  amount: string;
  balanceState: string;
};

export type DevelopmentDistributionReport = {
  buyer: { username: string; id: string };
  listing: { id: string; title: string; price: string };
  fundingId: string;
  wallet: { before: string; funded: string; purchase: string; after: string; netChange: string };
  checkoutId: string;
  purchaseId: string;
  distributionId: string;
  entries: readonly PersistedDistributionLine[];
};

export function assertDevelopmentDistributionEnvironment(environment: string | undefined): void {
  if (environment !== "development")
    throw new Error("Development distribution scenario requires NODE_ENV=development");
}

export function parseDistributionScenarioArguments(
  args: readonly string[],
): DistributionScenarioArguments {
  if (args.length > 2)
    throw new Error("Usage: just dev-distribution [buyer-username] [listing-uuid]");

  const buyerUsername = args[0]?.trim() || DEFAULT_BUYER_USERNAME;
  if (!USERNAME_PATTERN.test(buyerUsername))
    throw new Error("Buyer must be a valid development account username");

  const listingId = args[1]?.trim() || undefined;
  if (listingId && !UUID_PATTERN.test(listingId))
    throw new Error("A supplied listing must be identified by its UUID");

  return { buyerUsername, listingId };
}

/** Runs only against the supplied application services; SQL is limited to read-only lookup/reporting. */
export class DevelopmentDistributionScenario {
  constructor(
    private readonly app: ApplicationContainer,
    private readonly environment: string | undefined = process.env.NODE_ENV,
  ) {}

  async run(input: DistributionScenarioArguments): Promise<DevelopmentDistributionReport> {
    assertDevelopmentDistributionEnvironment(this.environment);
    if (!USERNAME_PATTERN.test(input.buyerUsername))
      throw new Error("Buyer must be a valid development account username");
    if (input.listingId && !UUID_PATTERN.test(input.listingId))
      throw new Error("A supplied listing must be identified by its UUID");

    const buyer = await this.resolveAccount(input.buyerUsername, "buyer");
    const listing = input.listingId
      ? await this.app.listings.findById(input.listingId)
      : await this.resolveDefaultListing();
    if (!listing)
      throw new Error(
        input.listingId
          ? `Published listing ${input.listingId} was not found; supply a real listing UUID.`
          : "Default fixture listing was not found; run just seed-catalogue first.",
      );
    if (listing.state !== "published")
      throw new Error(
        `Listing ${listing.id} is ${listing.state}; a published listing is required.`,
      );
    if (listing.price.currency !== "USD")
      throw new Error("The selected listing does not use canonical USD pricing.");

    if (input.buyerUsername === DEFAULT_BUYER_USERNAME) {
      const uplines = await this.app.referralGraph.getUplines(buyer.id, 2);
      const byLevel = new Map(uplines.map(({ depth, accountId }) => [depth, accountId]));
      const expected = await Promise.all([
        this.resolveAccount("central_left", "Level 1 upline"),
        this.resolveAccount("central_user", "Level 2 upline"),
      ]);
      if (byLevel.get(1) !== expected[0].id || byLevel.get(2) !== expected[1].id)
        throw new Error(
          "The central_left_1 fixture hierarchy differs from the expected Level 1/Level 2 relationships; run just seed-users and inspect referral relationships.",
        );
    }

    const before = await this.app.wallet.summary(buyer.id);
    const amountMinor = listing.price.minorAmount;
    const funding = await this.app.fundingService.create({
      accountId: buyer.id,
      amountMinor,
      providerName: "development",
      idempotencyKey: `dev-distribution:funding:${randomUUID()}`,
    });
    const initialized = await this.app.fundingInitialization.process(funding.id);
    if (initialized?.state !== "awaiting_payment")
      throw new Error(
        `Development funding initialization ended in ${initialized?.state ?? "no state"}.`,
      );

    const confirmed = await this.app.fundingVerification.process(funding.id);
    if (confirmed?.state !== "confirmed")
      throw new Error(
        `Development funding verification ended in ${confirmed?.state ?? "no state"}.`,
      );

    const credit = await this.app.walletCredit.process(funding.id);
    if (!credit) throw new Error("Confirmed development funding did not create a wallet credit.");
    await this.app.walletAvailability.process(credit.id);
    const fundedWallet = await this.app.wallet.summary(buyer.id);
    if (fundedWallet.available.minorAmount !== before.available.minorAmount + amountMinor)
      throw new Error("The exact listing amount did not become available in the buyer wallet.");

    const checkout = await this.app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: `dev-distribution:checkout:${randomUUID()}`,
    });
    const payment = await this.app.walletCheckoutPayment.pay({
      buyerId: buyer.id,
      checkoutId: checkout.id,
    });
    if (payment.checkout.state !== "paid")
      throw new Error(`Wallet checkout ended in ${payment.checkout.state}.`);
    if (payment.shortfall.minorAmount !== 0n)
      throw new Error(
        `Wallet checkout retained a shortfall of ${formatMinorMoney(payment.shortfall)}.`,
      );

    const purchase = await this.app.purchases.findById(checkout.purchaseId);
    if (!purchase) throw new Error("Wallet checkout purchase was not persisted.");
    if (purchase.checkoutId === null)
      throw new Error(
        "Purchase is not linked to its wallet checkout; distribution policy would not be checkout-backed.",
      );
    if (purchase.checkoutId !== checkout.id)
      throw new Error("Purchase checkout identity does not match the created wallet checkout.");

    const entitlement = await this.app.entitlementIssuance.process(purchase.id);
    if (!entitlement) throw new Error("Paid purchase did not receive its entitlement.");
    const correlationId = randomUUID();
    const createdDistribution = await this.app.purchaseDistribution.process({
      purchaseId: purchase.id,
      correlationId,
    });
    const persistedDistribution = await this.app.ledger.findDistributionByPurchaseId(purchase.id);
    if (!persistedDistribution)
      throw new Error("Purchase distribution processor did not persist a distribution.");
    if (persistedDistribution.id !== createdDistribution.id)
      throw new Error("Persisted distribution identity does not match processor result.");

    const ledgerEntries = await this.app.ledger.findEntriesByPurchaseId(purchase.id);
    if (ledgerEntries.length === 0)
      throw new Error("Persisted purchase distribution has no ledger entries.");
    if (
      ledgerEntries.some(
        (entry) =>
          entry.purchaseId !== purchase.id || entry.distributionId !== persistedDistribution.id,
      )
    )
      throw new Error("Persisted ledger entries do not match this purchase distribution.");
    const entries = await this.projectPersistedEntries(ledgerEntries);

    const after = await this.app.wallet.summary(buyer.id);
    if (after.available.minorAmount !== before.available.minorAmount)
      throw new Error(
        "Wallet balance changed during the scenario; check for concurrent wallet activity.",
      );

    return {
      buyer: { username: buyer.username, id: buyer.id },
      listing: {
        id: listing.id,
        title: listing.title,
        price: formatMinorMoney(listing.price),
      },
      fundingId: funding.id,
      wallet: {
        before: formatMinorMoney(before.available),
        funded: `+${formatMinorMoney(Money.of(amountMinor, "USD"))}`,
        purchase: `-${formatMinorMoney(Money.of(amountMinor, "USD"))}`,
        after: formatMinorMoney(after.available),
        netChange: formatMinorMoney(
          Money.of(after.available.minorAmount - before.available.minorAmount, "USD"),
        ),
      },
      checkoutId: checkout.id,
      purchaseId: purchase.id,
      distributionId: persistedDistribution.id,
      entries,
    };
  }

  private async resolveAccount(username: string, description: string) {
    const { rows } = await this.app.database.query<{ id: string; username: string }>(
      "select uuid as id, username from identity_capability.accounts where username=$1",
      [username],
    );
    const account = rows[0];
    if (!account)
      throw new Error(
        `${description} account '${username}' was not found; development fixtures may be missing. Run just seed-users first.`,
      );
    return account;
  }

  private async resolveDefaultListing() {
    const seller = await this.resolveAccount(DEFAULT_SELLER_USERNAME, "Default listing seller");
    const listing = await this.app.listings.findByExternalKey(
      seller.id,
      DEFAULT_LISTING_EXTERNAL_KEY,
    );
    if (!listing)
      throw new Error(
        `Default listing ${DEFAULT_SELLER_USERNAME}/${DEFAULT_LISTING_EXTERNAL_KEY} was not found; run just seed-catalogue first.`,
      );
    return listing;
  }

  private async projectPersistedEntries(entries: readonly LedgerEntry[]) {
    const accountIds = [
      ...new Set(entries.flatMap((entry) => (entry.accountId ? [entry.accountId] : []))),
    ];
    const usernames = new Map<string, string>();
    if (accountIds.length > 0) {
      const result = await this.app.database.query<{ id: string; username: string }>(
        "select uuid as id, username from identity_capability.accounts where uuid = any($1::uuid[])",
        [accountIds],
      );
      for (const account of result.rows) usernames.set(account.id, account.username);
    }

    return entries.map((entry) => {
      const username = entry.accountId ? usernames.get(entry.accountId) : undefined;
      if (entry.accountId && !username)
        throw new Error(`Persisted ledger recipient ${entry.accountId} has no account username.`);
      const label =
        entry.recipientRole === "platform"
          ? "Platform"
          : entry.recipientRole === "referral"
            ? `Level ${entry.referralLevel ?? "?"}`
            : "Seller";
      return {
        label,
        username: username ?? "Platform",
        amount: formatMinorMoney(entry.amount),
        balanceState: entry.balanceState,
      };
    });
  }
}

export function formatDevelopmentDistributionReport(report: DevelopmentDistributionReport): string {
  const distribution = report.entries
    .map(
      (entry) =>
        `  ${entry.label.padEnd(12)} ${entry.username.padEnd(20)} ${entry.amount.padStart(10)}  (${entry.balanceState})`,
    )
    .join("\n");
  return [
    "Development distribution complete",
    "",
    "Buyer",
    `  username: ${report.buyer.username}`,
    `  account:  ${report.buyer.id}`,
    "",
    "Listing",
    `  id:       ${report.listing.id}`,
    `  title:    ${report.listing.title}`,
    `  price:    ${report.listing.price}`,
    `  funding:  ${report.fundingId}`,
    "",
    "Wallet",
    `  before:       ${report.wallet.before}`,
    `  funded:       ${report.wallet.funded}`,
    `  purchase:     ${report.wallet.purchase}`,
    `  after:        ${report.wallet.after}`,
    `  net change:   ${report.wallet.netChange}`,
    "",
    "Purchase",
    `  checkout:     ${report.checkoutId}`,
    `  purchase:     ${report.purchaseId}`,
    "",
    `Distribution ${report.distributionId}`,
    distribution,
  ].join("\n");
}

async function main(args: readonly string[]) {
  assertDevelopmentDistributionEnvironment(process.env.NODE_ENV);
  const input = parseDistributionScenarioArguments(args);
  if (!process.env.DATABASE_URL?.trim())
    throw new Error("DATABASE_URL is required in the development container.");
  const app = getContainer();
  try {
    const report = await new DevelopmentDistributionScenario(app).run(input);
    console.log(formatDevelopmentDistributionReport(report));
  } finally {
    await app.database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
