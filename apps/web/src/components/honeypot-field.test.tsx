import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD_NAME } from "@/lib/honeypot";
import { HoneypotField } from "./honeypot-field";

describe("HoneypotField", () => {
  it("uses an opaque, inaccessible trap field instead of an autofill-prone website field", () => {
    const markup = renderToStaticMarkup(<HoneypotField />);
    expect(markup).toContain('name="referenceId"');
    expect(markup).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(markup).not.toContain('name="website"');
    expect(markup).toContain('autoComplete="off"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
