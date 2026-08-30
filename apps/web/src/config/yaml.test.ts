import {describe,expect,it} from "vitest";
import {loadYamlConfiguration,parseYamlConfiguration,resolveEnvironmentPlaceholders} from "./yaml";
describe("YAML environment placeholders",()=>{
  const env={APP_URL:"https://app.example",HOST:"example.test",PORT:"443"};
  it("resolves embedded and repeated placeholders",()=>expect(resolveEnvironmentPlaceholders("%env(PROTOCOL)%://%env(HOST)%:%env(PORT)%/x",{...env,PROTOCOL:"https"})).toBe("https://example.test:443/x"));
  it("resolves nested objects and arrays",()=>expect(resolveEnvironmentPlaceholders({a:["%env(APP_URL)%/one",{b:"pre-%env(HOST)%"}]},env)).toEqual({a:["https://app.example/one",{b:"pre-example.test"}]}));
  it("leaves ordinary values and supports escaping",()=>expect(resolveEnvironmentPlaceholders(["plain","%%env(APP_URL)%%"],env)).toEqual(["plain","%env(APP_URL)%"]));
  it("reports only the missing variable and source path",()=>expect(()=>resolveEnvironmentPlaceholders("%env(MISSING_SECRET)%",{OTHER:"secret-value"},"config.yaml")).toThrow('Missing environment variable "MISSING_SECRET" while resolving config.yaml'));
  it("supports required-file validation without changing optional loading",()=>{expect(loadYamlConfiguration("config/does-not-exist.yaml")).toBeNull();expect(()=>loadYamlConfiguration("config/does-not-exist.yaml",{}, {required:true})).toThrow("Required configuration file is missing");});
  it("resolves repository-relative configuration from a nested runtime directory",()=>{
    const previous=process.cwd();
    try { process.chdir(`${previous}/src`); expect(parseYamlConfiguration("config/modules/payment/paystack.example.yaml")).not.toBeNull(); }
    finally { process.chdir(previous); }
  });
});
