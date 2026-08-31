import { describe, expect, it } from "vitest";
import { NotFoundError } from "./errors.js";

describe("NotFoundError", () => {
  it("carries a 404 status code and a stable error code", () => {
    const err = new NotFoundError("Bank not found");

    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Bank not found");
  });
});
