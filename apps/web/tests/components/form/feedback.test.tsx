import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { focusFirstInvalidField, FormErrorSummary, FieldError } from "@/components/form/feedback";
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
    expect(html).toContain("Please check the form and try again.");
    expect(html).toContain("Reference: trace-123");
  });

  it("shows a form-level summary even when every validation issue has an inline field", () => {
    const html = renderToStaticMarkup(
      createElement(FormErrorSummary, {
        error: new ApiClientError(
          "Invalid input",
          422,
          "validation_error",
          { email: "Enter a valid email address." },
          "trace-456",
        ),
        visibleFields: ["email"],
      }),
    );
    expect(html).toContain("Please check the form and try again.");
    expect(html).toContain("Reference: trace-456");
  });

  it("renders field feedback with a stable description target", () => {
    const html = renderToStaticMarkup(
      createElement(FieldError, { id: "price-error", message: "Enter a valid price." }),
    );
    expect(html).toContain('id="price-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid price.");
  });

  it("scrolls to and focuses the first available invalid control", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const input = { name: "email", focus, scrollIntoView };
    const documentRef = {
      querySelectorAll: () => [input],
      querySelector: () => null,
    } as unknown as Document;
    expect(
      focusFirstInvalidField(
        { username: "Unavailable", email: "Invalid" },
        ["username", "email"],
        documentRef,
      ),
    ).toBe("email");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
