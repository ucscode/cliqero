import {describe,expect,it} from "vitest";
import {ExactCurrencyConverter} from "./exchange";
import {Money} from "./money";
describe("exact exchange boundary",()=>{it("converts with decimal-string rates and deterministic rounding",()=>{const result=new ExactCurrencyConverter().convert(Money.of(1000n,"USD"),{fromCurrency:"USD",toCurrency:"NGN",rate:"1500.27",source:"test",observedAt:new Date()});expect(result.equals(Money.of(1500270n,"NGN"))).toBe(true);});it("rejects mismatched quotes",()=>{expect(()=>new ExactCurrencyConverter().convert(Money.of(100n,"USD"),{fromCurrency:"EUR",toCurrency:"NGN",rate:"1.2",source:"test",observedAt:new Date()})).toThrow();});});
