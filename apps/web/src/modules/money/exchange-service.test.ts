import {describe,expect,it,vi} from "vitest";
import {ExchangeRateService} from "./exchange-service";
import type {ExchangeRateProvider,ExchangeRateQuote} from "./exchange";
const quote:ExchangeRateQuote={fromCurrency:"USD",toCurrency:"NGN",rate:"1500",source:"fallback",observedAt:new Date()};
describe("exchange rate service",()=>{it("falls back after primary failure",async()=>{const cache={get:vi.fn(async()=>null),put:vi.fn(async()=>{})};const providers:ExchangeRateProvider[]=[{getRate:vi.fn(async()=>{throw new Error("down");})},{getRate:vi.fn(async()=>quote)}];expect(await new ExchangeRateService(providers,cache).quote("USD","NGN")).toEqual(quote);});it("uses fresh cache without providers",async()=>{const cached={...quote,observedAt:new Date()};const cache={get:vi.fn(async()=>cached),put:vi.fn(async()=>{})};const provider={getRate:vi.fn()};expect(await new ExchangeRateService([provider],cache).quote("USD","NGN")).toBe(cached);expect(provider.getRate).not.toHaveBeenCalled();});});
