import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentInstructions } from "@/components/payment/shared/instructions";

describe("payment instructions", () => {
  it("renders plain text and Markdown emphasis with a paragraph break", () => {
    const html = renderToStaticMarkup(
      <PaymentInstructions
        content={
          "Send exactly **20.00 USDT** on **TRC20** to **TFXA...**.\n\n**Submit the blockchain transaction hash after sending.**"
        }
      />,
    );

    expect(html).toContain(
      "<p>Send exactly <strong>20.00 USDT</strong> on <strong>TRC20</strong> to <strong>TFXA...</strong>.</p>",
    );
    expect(html).toContain(
      "<p><strong>Submit the blockchain transaction hash after sending.</strong></p>",
    );
  });

  it("keeps ordinary plain text compatible", () => {
    const html = renderToStaticMarkup(
      <PaymentInstructions content="Transfer the amount shown above." />,
    );

    expect(html).toContain("<p>Transfer the amount shown above.</p>");
    expect(html).not.toContain("<strong>");
  });

  it("does not execute or trust raw HTML", () => {
    const html = renderToStaticMarkup(
      <PaymentInstructions content={"<b>Not trusted</b>\n\n**Still safe**"} />,
    );

    expect(html).not.toContain("<b>Not trusted</b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Not trusted");
    expect(html).toContain("<strong>Still safe</strong>");
  });
});
