import { describe, expect, it } from "vitest";
import { expandEnv } from "./load-env.js";

describe("expandEnv", () => {
  it("expands references to earlier values and to the base environment", () => {
    const result = expandEnv(
      { PORT: "5433", URL: "postgresql://app:${PASSWORD}@127.0.0.1:${PORT}/astax" },
      { PASSWORD: "local" },
    );
    expect(result.URL).toBe("postgresql://app:local@127.0.0.1:5433/astax");
  });

  it("does not depend on the order of the values", () => {
    const result = expandEnv({ URL: "http://127.0.0.1:${PORT}", PORT: "${BASE}3", BASE: "843" });
    expect(result.URL).toBe("http://127.0.0.1:8433");
  });

  it("leaves unknown references empty", () => {
    expect(expandEnv({ A: "x${MISSING}y" }).A).toBe("xy");
  });

  it("refuses a reference cycle", () => {
    expect(() => expandEnv({ A: "${B}", B: "${A}" })).toThrow(/Cyclic/);
  });
});
