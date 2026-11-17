import { describe, expect, it } from "vitest";

import { buildPageRange } from "@/lib/utils/pagination";

describe("pagination range", () => {
  it("returns a single page for one page", () => {
    expect(buildPageRange(1, 1)).toEqual([1]);
  });

  it("shows a window around the current page with ellipsis gaps", () => {
    expect(buildPageRange(5, 10, 1)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });

  it("handles the first and last pages", () => {
    expect(buildPageRange(1, 5, 1)).toEqual([1, 2, "ellipsis", 5]);
    expect(buildPageRange(5, 5, 1)).toEqual([1, "ellipsis", 4, 5]);
  });

  it("does not duplicate ellipsis when the window touches an edge", () => {
    const range = buildPageRange(3, 10, 1);
    expect(range).toEqual([1, 2, 3, 4, "ellipsis", 10]);
  });
});
