import type { WalletRepository } from "@/modules/wallet/wallet";

export class WalletService {
  constructor(private wallets: WalletRepository) {}
  summary(accountId: string) {
    return this.wallets.summary(accountId);
  }
  history(accountId: string, limit?: number) {
    return this.wallets.history(accountId, limit);
  }
}
