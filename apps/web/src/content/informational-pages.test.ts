import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogMarkdown } from "@/components/blog-markdown";
import { loadInformationalPage, parseInformationalPage } from "./informational-pages";

it("parses validated informational-page front matter and Markdown content", () => {
  expect(
    parseInformationalPage(`---
title: Example policy
description: A maintained summary.
updated: 2026-09-06
---

## A heading

Useful **Markdown**.`),
  ).toEqual({
    title: "Example policy",
    description: "A maintained summary.",
    updated: "2026-09-06",
    content: "## A heading\n\nUseful **Markdown**.",
  });
});

it("requires a non-empty title while allowing optional description and updated fields", () => {
  expect(() => parseInformationalPage("---\ndescription: Missing title\n---\nContent")).toThrow();
  expect(parseInformationalPage("---\ntitle: Minimal\n---\nContent")).toEqual({
    title: "Minimal",
    content: "Content",
  });
});

it("loads the maintained privacy and terms documents", () => {
  expect(loadInformationalPage("privacy").content).toContain("Information we use");
  expect(loadInformationalPage("terms").content).toContain("Using the service");
});

it("uses the shared sanitized Markdown renderer", () => {
  const output = renderToStaticMarkup(
    createElement(BlogMarkdown, {
      content: "[Safe link](https://example.test)\n\n<script>alert(1)</script>",
    }),
  );
  expect(output).toContain('href="https://example.test"');
  expect(output).not.toContain("<script>");
});
