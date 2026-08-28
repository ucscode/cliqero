import type {UnitOfWork} from "@/kernel/unit-of-work";
import type {AccountReader} from "@/modules/identity/account";
import type {ReferralGraphRepository} from "@/modules/referral/referral";

export class ReferralGraphService {
  constructor(private readonly accounts:AccountReader,private readonly graph:ReferralGraphRepository,private readonly uow:UnitOfWork){}
  async establish(childAccountId:string,parentAccountId:string):Promise<void>{
    if(childAccountId===parentAccountId)throw new Error("Self-referral is not allowed");
    await this.uow.transaction(async()=>{
      const [childExists,parentExists]=await Promise.all([this.accounts.exists(childAccountId),this.accounts.exists(parentAccountId)]);
      if(!childExists||!parentExists)throw new Error("Referral account not found");
      await this.graph.assignParent(childAccountId,parentAccountId);
    });
  }
}

