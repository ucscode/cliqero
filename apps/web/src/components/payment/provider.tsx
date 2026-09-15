"use client";

import { createElement, useState, type ComponentType } from "react";
import { PaymentComponent, type PaymentProviderProps } from "./shared/status";
import { PaystackPayment } from "./paystack/payment";
import { NowPaymentsPayment } from "./nowpayments/payment";
import { DirectTrc20Payment } from "./direct-trc20/payment";
import { BankTransferPayment } from "./bank-transfer/payment";
import { DevelopmentPayment } from "./development/payment";

function GenericPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  return (
    <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
      {null}
    </PaymentComponent>
  );
}

const paymentComponents: Record<string, ComponentType<PaymentProviderProps>> = {
  paystack: PaystackPayment,
  nowpayments: NowPaymentsPayment,
  usdt_trc20: DirectTrc20Payment,
  bank_transfer: BankTransferPayment,
  development: DevelopmentPayment,
};

export function resolvePaymentComponent(provider: string) {
  return paymentComponents[provider] ?? GenericPayment;
}

export function PaymentProviderComponent(props: PaymentProviderProps) {
  return createElement(resolvePaymentComponent(props.funding.provider), props);
}
