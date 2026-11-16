import { describe, expect, it } from "vitest";
import { err, mapResult, ok } from "@/lib/result";

describe("Result helpers", () => {
  it("maps successful values", () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });
  });

  it("preserves errors when mapping", () => {
    const failure = err("nope");
    expect(mapResult(failure, (value: number) => value * 3)).toBe(failure);
  });
});
