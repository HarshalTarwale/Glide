import { describe, it, expect } from "vitest";
import { scaleBomLines, computeProducedUnitCost } from "@/lib/manufacturing/bom";

describe("scaleBomLines", () => {
  it("scales 1:1 when the BOM batch quantity equals the work order quantity", () => {
    const result = scaleBomLines([{ componentProductId: "a", quantity: 2 }], 1, 1);
    expect(result).toEqual([{ componentProductId: "a", requiredQty: 2 }]);
  });

  it("scales down for a batch BOM run at a smaller work order quantity", () => {
    // BOM makes 10 units from 3 units of component "a" -- a work order for 5 needs 1.5.
    const result = scaleBomLines([{ componentProductId: "a", quantity: 3 }], 10, 5);
    expect(result[0].requiredQty).toBe(1.5);
  });

  it("scales up for a work order larger than the BOM's batch size", () => {
    const result = scaleBomLines([{ componentProductId: "a", quantity: 2 }], 1, 4);
    expect(result[0].requiredQty).toBe(8);
  });

  it("scales every line by the same ratio", () => {
    const result = scaleBomLines(
      [
        { componentProductId: "a", quantity: 2 },
        { componentProductId: "b", quantity: 5 },
      ],
      2,
      6
    );
    expect(result).toEqual([
      { componentProductId: "a", requiredQty: 6 },
      { componentProductId: "b", requiredQty: 15 },
    ]);
  });

  it("throws when the BOM batch quantity is zero or negative", () => {
    expect(() => scaleBomLines([{ componentProductId: "a", quantity: 1 }], 0, 5)).toThrow();
  });

  it("throws when the work order quantity is zero or negative", () => {
    expect(() => scaleBomLines([{ componentProductId: "a", quantity: 1 }], 1, 0)).toThrow();
  });
});

describe("computeProducedUnitCost", () => {
  it("divides total component cost evenly across the quantity produced", () => {
    expect(computeProducedUnitCost(100, 10)).toBe(10);
  });

  it("rounds to 4 decimal places", () => {
    expect(computeProducedUnitCost(10, 3)).toBe(3.3333);
  });

  it("throws when quantity produced is zero or negative", () => {
    expect(() => computeProducedUnitCost(100, 0)).toThrow();
  });
});
