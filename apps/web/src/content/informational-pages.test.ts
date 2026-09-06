import { expect, it } from "vitest";
import {
  informationalPageSlugs,
  loadInformationalPageMetadata,
  parseInformationalPageMetadata,
} from "./informational-pages";

it("parses and validates informational-page front matter", () => {
  expect(
    parseInformationalPageMetadata(`---
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
  });
});

it("requires a non-empty title while allowing optional fields", () => {
  expect(() =>
    parseInformationalPageMetadata("---\ndescription: Missing title\n---\nContent"),
  ).toThrow();
  expect(parseInformationalPageMetadata("---\ntitle: Minimal\n---\nContent")).toEqual({
    title: "Minimal",
  });
});

it("loads metadata for every maintained MDX informational page", () => {
  for (const slug of informationalPageSlugs) {
    expect(loadInformationalPageMetadata(slug).title).toBeTruthy();
  }
});

it("keeps informational metadata free of internal architecture language", () => {
  for (const slug of informationalPageSlugs) {
    expect(loadInformationalPageMetadata(slug).title.toLowerCase()).not.toContain("ledger");
  }
});
