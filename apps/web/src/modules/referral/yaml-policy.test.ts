import {describe,expect,it} from "vitest";
import {commissionPolicyFromYaml,loadYamlCommissionPolicy} from "./yaml-policy";
describe("YAML commission policy",()=>{
  it("loads contiguous percentage levels",()=>{const p=commissionPolicyFromYaml({distribution:{commission:{levels:{1:50,2:30,3:10}}}});expect(p.rates).toEqual([50,30,10]);expect(p.ratesBasisPoints).toEqual([5000,3000,1000]);});
  it("rejects gaps and totals above 100",()=>{expect(()=>commissionPolicyFromYaml({distribution:{commission:{levels:{1:50,3:10}}}})).toThrow();expect(()=>commissionPolicyFromYaml({distribution:{commission:{levels:{1:60,2:41}}}})).toThrow();});
  it("accepts an explicit empty schedule as a deliberate no-commission policy",()=>{const p=commissionPolicyFromYaml({distribution:{commission:{levels:{}}}});expect(p.rates).toEqual([]);expect(p.maximumRewardedDepth).toBe(0);});
  it("requires the runtime policy file instead of falling back to an example",()=>expect(()=>loadYamlCommissionPolicy("config/does-not-exist.yaml")).toThrow("Required configuration file is missing"));
  it("normalizes explicit null levels to no referral allocation",()=>expect(commissionPolicyFromYaml({distribution:{commission:{levels:null}}}).maximumRewardedDepth).toBe(0));
  it("rejects incomplete policy structure",()=>{expect(()=>commissionPolicyFromYaml({})).toThrow(/distribution/);expect(()=>commissionPolicyFromYaml({distribution:{}})).toThrow(/commission/);expect(()=>commissionPolicyFromYaml({distribution:{commission:{}}})).toThrow(/levels/);expect(()=>commissionPolicyFromYaml({distribution:{commission:{level:{1:50}}}})).toThrow(/levels/);});
});
