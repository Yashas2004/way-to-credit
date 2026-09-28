import { describe, expect, it } from "vitest";
import { dedupeById } from "./dedupeById";

describe("dedupeById", () => {
  it("keeps the first occurrence of an id across pages, in order", () => {
    const pages = [
      {
        items: [
          { id: "a", v: 1 },
          { id: "b", v: 1 },
        ],
      },
      {
        items: [
          { id: "b", v: 2 },
          { id: "c", v: 1 },
        ],
      },
    ];
    expect(dedupeById(pages)).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 1 },
      { id: "c", v: 1 },
    ]);
  });
});
