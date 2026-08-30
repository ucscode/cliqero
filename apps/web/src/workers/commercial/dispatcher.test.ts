import {describe,expect,it,vi} from "vitest";
import type {ApplicationContainer} from "@/infrastructure/container";
import {CommercialWorkflowDispatcher} from "./dispatcher";

describe("CommercialWorkflowDispatcher failure isolation",()=>{
  function application(events:string[]){
    const items=(prefix:string)=>[{id:`${prefix}-poison`},{id:`${prefix}-healthy`}];
    const processing=(family:string)=>async(id:string)=>{events.push(`${family}:${id}`);if(id.endsWith("poison"))throw new Error(`${family} failed`);};
    return {
      fundingInitialization:{findWork:async()=>items("initialization"),process:processing("initialization")},
      funding:{findWork:async(state:string)=>state==="verification_pending"?items("verification"):items("funding")},
      fundingVerification:{process:processing("verification")},
      walletCredit:{process:processing("wallet-credit")},
      walletRepository:{findPendingCredits:async()=>items("credit")},
      walletAvailability:{process:processing("wallet-availability")},
      checkoutRepository:{findAwaitingFunds:async()=>items("checkout")},
      checkoutPayment:{process:processing("checkout")},
      purchases:{findCompletedWithoutEntitlement:async()=>items("entitlement"),findCompletedWithoutDistribution:async()=>items("distribution")},
      entitlementIssuance:{process:processing("entitlement")},
      purchaseDistribution:{process:async({purchaseId}:{purchaseId:string})=>processing("distribution")(purchaseId)},
      listingMediaDeletion:{findWork:async()=>items("media"),process:processing("media")},
    } as unknown as ApplicationContainer;
  }

  it("continues past poison items and across every processor family",async()=>{const events:string[]=[];const logger={error:vi.fn()};const dispatcher=new CommercialWorkflowDispatcher(application(events),logger);expect(await dispatcher.runOnce()).toBe(8);for(const family of ["initialization","verification","wallet-credit","wallet-availability","checkout","entitlement","distribution","media"]){expect(events).toContain(`${family}:${family==="wallet-credit"?"funding":family==="wallet-availability"?"credit":family}-healthy`);}expect(logger.error).toHaveBeenCalledTimes(8);expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({processor_family:"entitlement",work_id:"entitlement-poison"}),"commercial.workflow.item.failed");expect(events).toContain("distribution:distribution-healthy");});

  it("continues to unrelated families when discovery for one family fails",async()=>{const events:string[]=[];const app=application(events);app.fundingInitialization.findWork=async()=>{throw new Error("discovery unavailable");};const logger={error:vi.fn()};await new CommercialWorkflowDispatcher(app,logger).runOnce();expect(events).toContain("verification:verification-healthy");expect(events).toContain("distribution:distribution-healthy");expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({processor_family:"funding-initialization",work_id:undefined}),"commercial.workflow.discovery.failed");});
});
