import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/referral/panel.tsx"), "utf8");

describe("referral table contract", () => {
  it("uses the list-oriented descendant endpoint and server-side cursor", () => {
    expect(source).toContain("/api/hierarchy/levels");
    expect(source).toContain("/api/hierarchy/descendants?");
    expect(source).toContain("level: String(selectedLevel)");
    expect(source).toContain('query.set("cursor", cursor)');
    expect(source).toContain(
      "setItems((current) => (appending ? [...current, ...page.items] : page.items))",
    );
    expect(source).not.toContain("/api/hierarchy/tree");
  });

  it("renders the required columns and resets pagination on level changes", () => {
    expect(source).toContain("Level");
    expect(source).toContain('id="referral-level"');
    expect(source).toContain("availableLevels.map");
    expect(source).toContain("{`Level ${option}`}");
    expect(source).not.toContain("DEPTH_OPTIONS");
    const header = source.slice(source.indexOf("<thead"), source.indexOf("</thead>"));
    expect(header.indexOf("Name")).toBeLessThan(header.indexOf("Downlines"));
    expect(header.indexOf("Downlines")).toBeLessThan(header.indexOf("Upline"));
    const body = source.slice(source.indexOf("<tbody"), source.indexOf("</tbody>"));
    expect(body.indexOf("item.directChildCount")).toBeLessThan(body.indexOf("item.upline"));
    expect(source).toContain("void loadPage(level, null)");
  });
});
