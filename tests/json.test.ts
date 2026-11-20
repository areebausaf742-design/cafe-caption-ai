import { describe, expect, it } from "vitest";

import { JsonExtractError, extractJsonObject } from "@/lib/json";

describe("extractJsonObject", () => {
  it("parses a clean object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds the object inside surrounding prose", () => {
    expect(extractJsonObject('Sure! Here it is:\n{"a":{"b":2}}\nHope that helps.')).toEqual({
      a: { b: 2 },
    });
  });

  it("refuses a reply with no object", () => {
    expect(() => extractJsonObject("I'm sorry, I can't help with that.")).toThrow(JsonExtractError);
  });

  it("refuses an array at the top level", () => {
    expect(() => extractJsonObject("[1,2,3]")).toThrow(JsonExtractError);
  });

  it("refuses truncated JSON", () => {
    expect(() => extractJsonObject('{"a":1,')).toThrow(JsonExtractError);
  });

  it("uses the caller's message", () => {
    expect(() => extractJsonObject("nope", "No dish here.")).toThrow("No dish here.");
  });
});
