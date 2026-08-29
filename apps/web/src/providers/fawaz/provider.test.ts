import {describe,expect,it,vi} from "vitest";
import {FawazProvider} from "./provider";
describe("Fawaz provider",()=>{it("parses USD table rates",async()=>{const p=new FawazProvider(["https://fx"],vi.fn(async()=>new Response('{"date":"2026-08-29","usd":{"ngn":1500.27}}')));const q=await p.getRate("USD","NGN");expect(q.rate).toBe("1500.27");});});
