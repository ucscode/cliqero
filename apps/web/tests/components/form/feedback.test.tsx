import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormErrorSummary, FieldError } from "@/components/form/feedback";
import { ApiClientError } from "@/lib/api-client";

describe("shared form feedback", () => {
  it("shows a safe summary with a request reference for server correlation", () => {
    const html = renderToStaticMarkup(
      createElement(FormErrorSummary, {
        error: new ApiClientError(
          "Please correct the compare-at price.",
          400,
          "validation_error",
          {
            compare_at_price_minor: "Must exceed the listing price.",
          },
          "trace-123",
        ),
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Please correct the compare-at price.");
    expect(html).toContain("Reference: trace-123");
  });

  it("renders field feedback with a stable description target", () => {
    const html = renderToStaticMarkup(
      createElement(FieldError, { id: "price-error", message: "Enter a valid price." }),
    );
    expect(html).toContain('id="price-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid price.");
  });
});
