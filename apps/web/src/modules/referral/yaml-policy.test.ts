import {describe,expect,it} from "vitest";
import {commissionPolicyFromYaml} from "./yaml-policy";
describe("YAML commission policy",()=>{
  it("loads contiguous percentage levels",()=>{const p=commissionPolicyFromYaml({distribution:{commission:{levels:{1:50,2:30,3:10}}}});expect(p.rates).toEqual([50,30,10]);expect(p.ratesBasisPoints).toEqual([5000,3000,1000]);});
  it("rejects gaps and totals above 100",()=>{expect(()=>commissionPolicyFromYaml({distribution:{commission:{levels:{1:50,3:10}}}})).toThrow();expect(()=>commissionPolicyFromYaml({distribution:{commission:{levels:{1:60,2:41}}}})).toThrow();});
  it("treats omitted policy as no referral allocation",()=>expect(commissionPolicyFromYaml({}).maximumRewardedDepth).toBe(0));
});
