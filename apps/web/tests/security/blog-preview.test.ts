import { describe, expect, it } from "vitest";
import { issueBlogPreviewToken, verifyBlogPreviewToken } from "@/security/blog-preview";

describe("blog revision preview authorization", () => {
  it("binds a short-lived signature to one post, exact revision, and authenticated operator", () => {
    const token = issueBlogPreviewToken("post-1", "revision-1", "account-1", "test-secret", 1000);
    expect(
      verifyBlogPreviewToken(token, "post-1", "revision-1", "account-1", "test-secret", 1001),
    ).toBe(true);
    expect(
      verifyBlogPreviewToken(token, "post-2", "revision-1", "account-1", "test-secret", 1001),
    ).toBe(false);
    expect(
      verifyBlogPreviewToken(token, "post-1", "revision-2", "account-1", "test-secret", 1001),
    ).toBe(false);
    expect(
      verifyBlogPreviewToken(token, "post-1", "revision-1", "account-2", "test-secret", 1001),
    ).toBe(false);
    expect(
      verifyBlogPreviewToken(token, "post-1", "revision-1", "account-1", "wrong-secret", 1001),
    ).toBe(false);
    expect(
      verifyBlogPreviewToken(token, "post-1", "revision-1", "account-1", "test-secret", 1300),
    ).toBe(false);
  });
});
