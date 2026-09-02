import { describe, expect, it } from "vitest";
import { maskDatabaseUrl } from "./maskDatabaseUrl.js";

describe("maskDatabaseUrl", () => {
  it("replaces the password with *** but keeps everything else intact", () => {
    expect(
      maskDatabaseUrl("postgres://devuser:devpassword_local_only@localhost:5433/way_to_credit"),
    ).toBe("postgres://devuser:***@localhost:5433/way_to_credit");
  });

  it("leaves a URL with no password unchanged", () => {
    expect(maskDatabaseUrl("postgres://devuser@localhost:5433/way_to_credit")).toBe(
      "postgres://devuser@localhost:5433/way_to_credit",
    );
  });

  it("falls back to a fixed placeholder for an unparseable string, never throwing", () => {
    expect(maskDatabaseUrl("not a url")).toBe("(unparseable DATABASE_URL)");
  });
});
