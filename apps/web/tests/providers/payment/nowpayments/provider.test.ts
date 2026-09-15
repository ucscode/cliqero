import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { NowPaymentsProvider } from "@/providers/payment/nowpayments/provider";

const id = "00000000-0000-4000-8000-000000000001";
const config = {
  apiKey: "test-key",
  ipnSecret: "ipn-secret",
  apiBaseUrl: "https://api-sandbox.nowpayments.io",
  ipnCallbackUrl: "https://public.example.test/api/payments/nowpayments/ipn",
  network: "ERC20",
  asset: "USDT",
  sandbox: { case: "success" as const },
  payCurrencies: ["usdterc20", "usdttrc20", "btc", "eth"],
};

describe("NOWPayments provider", () => {
  it("looks up the selected pair minimum in the requested fiat equivalent", async () => {
    const http = vi.fn(async () =>
      Response.json({ min_amount: "1.001973", fiat_equivalent: "1.01" }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);

    await expect(
      provider.minimumPaymentAmount({ currencyFrom: "USD", currencyTo: "USDTTRC20" }),
    ).resolves.toEqual(Money.of(101n, "USD"));
    expect(http).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api-sandbox.nowpayments.io/v1/min-amount?currency_from=usd&currency_to=usdttrc20&fiat_equivalent=usd",
      }),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
  });

  it("rejects malformed minimum responses and minimum lookup transport failures", async () => {
    const malformed = new NowPaymentsProvider(
      config,
      "nowpayments",
      vi.fn(async () => Response.json({ min_amount: "1.001973" })),
    );
    await expect(
      malformed.minimumPaymentAmount({ currencyFrom: "USD", currencyTo: "USDTTRC20" }),
    ).rejects.toMatchObject({ providerCode: "minimum_amount_invalid" });

    const unavailable = new NowPaymentsProvider(
      config,
      "nowpayments",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(
      unavailable.minimumPaymentAmount({ currencyFrom: "USD", currencyTo: "USDTTRC20" }),
    ).rejects.toMatchObject({
      operation: "transaction.minimum_amount",
      kind: "ambiguous",
    });
  });
  it("creates a payment and persists address/network instructions", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "0xabc",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdterc20",
        order_id: `np-${id}`,
        expiration_estimate_date: "2026-09-13T09:00:00.000Z",
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    const result = await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-1",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdterc20",
    });
    expect(result.reference).toBe(`np-${id}`);
    expect(result.metadata).toMatchObject({
      providerPaymentId: "123",
      paymentAddress: "0xabc",
      paymentCurrency: "USDTERC20",
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    expect(result.metadata).not.toHaveProperty("asset");
    expect(result.metadata).not.toHaveProperty("network");
    expect(http).toHaveBeenCalledWith(
      expect.objectContaining({ href: "https://api-sandbox.nowpayments.io/v1/payment" }),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
        body: expect.any(String),
      }),
    );
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined)?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      case: "success",
      pay_currency: "usdterc20",
      ipn_callback_url: "https://public.example.test/api/payments/nowpayments/ipn",
    });
  });

  it("preserves the exact provider payment identity returned by NOWPayments", async () => {
    const providerPaymentId = "Np-AbC123";
    const http = vi.fn(async () =>
      Response.json({
        payment_id: providerPaymentId,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: `np-${id}`,
      }),
    );
    const result = await new NowPaymentsProvider(config, "nowpayments", http).initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-case-preservation",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdttrc20",
    });

    expect(result.providerTransactionId).toBe(providerPaymentId);
    expect(result.metadata?.providerPaymentId).toBe(providerPaymentId);
  });

  it("does not invent an expiry when NOWPayments omits its provider deadline", async () => {
    const provider = new NowPaymentsProvider(
      config,
      "nowpayments",
      vi.fn(async () =>
        Response.json({
          payment_id: 123,
          payment_status: "waiting",
          pay_address: "Taddress",
          pay_amount: "10.25",
          price_amount: 10.25,
          price_currency: "usd",
          pay_currency: "usdttrc20",
          order_id: `np-${id}`,
        }),
      ),
    );

    const result = await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-without-provider-expiry",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdttrc20",
    });

    expect(result.metadata?.expiresAt).toBeUndefined();
  });

  it("preserves safe structured diagnostics from a rejected provider response", async () => {
    const http = vi.fn(async () =>
      Response.json(
        {
          status: false,
          code: "AMOUNT_TOO_SMALL",
          message: "The amount is below the minimum.",
          api_key: "must-not-be-persisted",
        },
        { status: 400 },
      ),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);

    await expect(
      provider.initiate({
        paymentId: id,
        amount: Money.of(100n, "USD"),
        idempotencyKey: "rejected-payment",
        buyerEmail: "buyer@example.test",
        paymentCurrency: "usdterc20",
      }),
    ).rejects.toMatchObject({
      httpStatus: 400,
      providerStatus: false,
      providerCode: "AMOUNT_TOO_SMALL",
      providerMessage: "The amount is below the minimum.",
    });
  });

  it("reads diagnostics nested under the provider error field", async () => {
    const http = vi.fn(async () =>
      Response.json({ error: { code: "MINIMUM_AMOUNT", message: "Too small" } }, { status: 400 }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);

    await expect(
      provider.initiate({
        paymentId: id,
        amount: Money.of(100n, "USD"),
        idempotencyKey: "nested-rejected-payment",
        buyerEmail: "buyer@example.test",
        paymentCurrency: "usdterc20",
      }),
    ).rejects.toMatchObject({
      httpStatus: 400,
      providerCode: "MINIMUM_AMOUNT",
      providerMessage: "Too small",
    });
  });

  it("never sends the sandbox test case to the live API", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(
      { ...config, apiBaseUrl: "https://api.nowpayments.io" },
      "nowpayments",
      http,
    );
    await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-live",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdterc20",
    });
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined)?.[1];
    expect(JSON.parse(String(request?.body))).not.toHaveProperty("case");
  });

  it.each([
    ["omitted", undefined],
    ["null", null],
  ])("does not send a case when sandbox simulation is %s", async (_label, sandbox) => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(
      { ...config, sandbox: sandbox ?? undefined },
      "nowpayments",
      http,
    );
    await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: `funding-${_label}`,
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdttrc20",
    });
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined)?.[1];
    expect(JSON.parse(String(request?.body))).not.toHaveProperty("case");
  });

  it("uses a selected allowlisted currency and verifies against the persisted selection", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          payment_id: 123,
          payment_status: "waiting",
          pay_address: "Taddress",
          pay_amount: "10.25",
          price_amount: 10.25,
          price_currency: "usd",
          pay_currency: "usdttrc20",
          order_id: `np-${id}`,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          payment_id: 123,
          payment_status: "finished",
          price_amount: 10.25,
          price_currency: "usd",
          pay_currency: "usdttrc20",
          order_id: `np-${id}`,
        }),
      );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    const result = await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-selected",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdttrc20",
    });
    expect(JSON.parse(String((http.mock.calls[0] as any)[1].body)).pay_currency).toBe("usdttrc20");
    expect(result.metadata?.paymentCurrency).toBe("USDTTRC20");
    expect(result.providerTransactionId).toBe("123");
    await expect(
      provider.verify({
        reference: `np-${id}`,
        expectedAmount: Money.of(1025n, "USD"),
        providerTransactionId: "123",
        initialization: { paymentCurrency: "USDTTRC20" },
      }),
    ).resolves.toMatchObject({ state: "confirmed" });
    await expect(
      provider.initiate({
        paymentId: id,
        amount: Money.of(1025n, "USD"),
        idempotencyKey: "funding-unsupported",
        buyerEmail: "buyer@example.test",
        paymentCurrency: "dogecoin",
      }),
    ).rejects.toThrow("unsupported");
  });

  it("requires a selected currency and never falls back during initialization", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        pay_address: "Taddress",
        pay_amount: "10.25",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);

    await expect(
      provider.initiate({
        paymentId: id,
        amount: Money.of(1025n, "USD"),
        idempotencyKey: "funding-missing-currency",
        buyerEmail: "buyer@example.test",
      }),
    ).rejects.toThrow("payment currency is required");
    expect(http).not.toHaveBeenCalled();
  });

  it("sends each selected configured currency as the singular API pay_currency", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "10.25",
        pay_currency: "btc",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);

    for (const currency of ["btc", "eth", "usdttrc20"]) {
      http.mockClear();
      await provider.initiate({
        paymentId: id,
        amount: Money.of(1025n, "USD"),
        idempotencyKey: `funding-${currency}`,
        buyerEmail: "buyer@example.test",
        paymentCurrency: currency,
      });
      const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit])[1];
      expect(JSON.parse(String(request.body)).pay_currency).toBe(currency);
    }
  });

  it("verifies only a finished payment and detects amount/reference mismatches", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "finished",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdterc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    const verified = await provider.verify({
      reference: `np-${id}`,
      expectedAmount: Money.of(1025n, "USD"),
      providerTransactionId: "123",
      initialization: { paymentCurrency: "usdterc20" },
    });
    expect(verified.state).toBe("confirmed");
    expect(verified.observation?.status).toBe("success");
    expect(verified.amount?.equals(Money.of(1025n, "USD"))).toBe(true);
    await expect(
      provider.verify({
        reference: "np-other",
        expectedAmount: Money.of(1025n, "USD"),
        providerTransactionId: "123",
      }),
    ).rejects.toThrow("reference mismatch");
  });

  it("rejects a payment on the wrong USDT network/currency", async () => {
    const provider = new NowPaymentsProvider(
      { ...config, network: "TRC20" },
      "nowpayments",
      vi.fn(async () =>
        Response.json({
          payment_id: 123,
          payment_status: "finished",
          pay_currency: "usdterc20",
          price_amount: 10.25,
          price_currency: "usd",
          order_id: `np-${id}`,
        }),
      ),
    );
    await expect(
      provider.verify({
        reference: `np-${id}`,
        expectedAmount: Money.of(1025n, "USD"),
        providerTransactionId: "123",
        initialization: { paymentCurrency: "usdttrc20" },
      }),
    ).rejects.toThrow("currency mismatch");
  });

  it("formats large minor amounts without floating-point conversion", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "9007199254740993",
        price_amount: "9007199254740993.01",
        price_currency: "usd",
        pay_currency: "usdterc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    await provider.initiate({
      paymentId: id,
      amount: Money.of(900719925474099301n, "USD"),
      idempotencyKey: "large-amount",
      buyerEmail: "buyer@example.test",
      paymentCurrency: "usdterc20",
    });
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit])[1];
    expect(String(request.body)).toContain('"price_amount":9007199254740993.01');
  });

  it("validates the documented sorted-JSON IPN signature", () => {
    const provider = new NowPaymentsProvider(config);
    const body = new TextEncoder().encode(JSON.stringify({ b: 2, a: 1 }));
    const canonical = '{"a":1,"b":2}';
    const signature = createHmac("sha512", "ipn-secret").update(canonical).digest("hex");
    expect(provider.verifyIpnSignature(body, signature)).toBe(true);
    expect(provider.verifyIpnSignature(body, signature.slice(0, -1) + "0")).toBe(false);
  });
});
