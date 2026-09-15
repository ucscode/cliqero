import { PaymentProviderRegistry } from "@/modules/payment";
import { DevelopmentPaymentProvider } from "./provider";

export function isDevelopmentProviderEnabled(environment = process.env.NODE_ENV) {
  return environment === "development" || environment === "test";
}

export function registerDevelopmentPaymentProvider(
  registry: PaymentProviderRegistry,
  environment = process.env.NODE_ENV,
) {
  if (isDevelopmentProviderEnabled(environment))
    registry.register(new DevelopmentPaymentProvider());
  return registry;
}
