import { describe, expect, it } from "vitest";
import { applyValuationEvent, averageCost, replayValuation, ZERO_BALANCE } from "@/lib/inventory/avco";

describe("AVCO — receiving", () => {
  it("first receipt sets the average to its own cost", () => {
    const result = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    expect(result.qty).toBe(100);
    expect(result.value).toBe(1000);
    expect(averageCost(result)).toBe(10);
  });

  it("a second receipt at a different cost blends into a weighted average", () => {
    // Textbook AVCO example: 100 @ 10 then 100 @ 20 -> average 15, not 10 or 20.
    let balance = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    balance = applyValuationEvent(balance, { quantity: 100, unitCost: 20 });

    expect(balance.qty).toBe(200);
    expect(balance.value).toBe(3000);
    expect(averageCost(balance)).toBe(15);
  });

  it("weights by quantity, not by count of receipts", () => {
    // 10 @ 100 (small qty, high cost) then 990 @ 10 (huge qty, low cost)
    // should land close to 10, not halfway between 100 and 10.
    let balance = applyValuationEvent(ZERO_BALANCE, { quantity: 10, unitCost: 100 });
    balance = applyValuationEvent(balance, { quantity: 990, unitCost: 10 });

    expect(balance.qty).toBe(1000);
    expect(balance.value).toBe(10900); // 10*100 + 990*10
    expect(averageCost(balance)).toBeCloseTo(10.9, 4);
  });
});

describe("AVCO — consuming", () => {
  it("a delivery removes value at the CURRENT average, not at any receipt cost", () => {
    let balance = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    balance = applyValuationEvent(balance, { quantity: 100, unitCost: 20 }); // avg now 15

    const afterDelivery = applyValuationEvent(balance, { quantity: -50 });

    expect(afterDelivery.qty).toBe(150);
    expect(afterDelivery.value).toBe(2250); // 150 * 15
    // The average itself does not move on consumption.
    expect(averageCost(afterDelivery)).toBe(15);
  });

  it("consuming everything leaves qty and value at exactly zero", () => {
    let balance = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    balance = applyValuationEvent(balance, { quantity: -100 });

    expect(balance.qty).toBe(0);
    expect(balance.value).toBe(0);
    expect(averageCost(balance)).toBe(0);
  });

  it("a delivery's own eventUnitCost is the average at the moment it happened", () => {
    let balance = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    balance = applyValuationEvent(balance, { quantity: 100, unitCost: 20 }); // avg 15

    const delivery = applyValuationEvent(balance, { quantity: -30 });
    expect(delivery.eventUnitCost).toBe(15);
    expect(delivery.eventValue).toBe(-450);
  });
});

describe("AVCO — errors", () => {
  it("refuses to receive stock with no cost given", () => {
    expect(() => applyValuationEvent(ZERO_BALANCE, { quantity: 10 })).toThrow(/unitCost is required/);
  });

  it("a zero-quantity event is a no-op", () => {
    const balance = applyValuationEvent(ZERO_BALANCE, { quantity: 100, unitCost: 10 });
    const same = applyValuationEvent(balance, { quantity: 0 });
    expect(same.qty).toBe(balance.qty);
    expect(same.value).toBe(balance.value);
    expect(same.eventValue).toBe(0);
  });
});

describe("AVCO — replay reconciles with incremental application", () => {
  it("replaying a whole history from scratch equals applying events one at a time", () => {
    const events = [
      { quantity: 100, unitCost: 10 },
      { quantity: -20 },
      { quantity: 50, unitCost: 12 },
      { quantity: -60 },
      { quantity: 200, unitCost: 8 },
      { quantity: -100 },
    ];

    let incremental = ZERO_BALANCE;
    for (const e of events) incremental = applyValuationEvent(incremental, e);

    const replayed = replayValuation(events);

    expect(replayed).toEqual(incremental);
  });

  it("a real multi-step scenario matches a hand-computed figure", () => {
    // Hand computation:
    //   +100 @ 10  -> qty 100,  value 1000,           avg 10
    //   +50  @ 16  -> qty 150,  value 1000+800=1800,  avg 12
    //   -80        -> qty 70,   value 1800-80*12=840, avg 12 (unchanged)
    //   +30  @ 9   -> qty 100,  value 840+270=1110,   avg 11.10
    const balance = replayValuation([
      { quantity: 100, unitCost: 10 },
      { quantity: 50, unitCost: 16 },
      { quantity: -80 },
      { quantity: 30, unitCost: 9 },
    ]);

    expect(balance.qty).toBe(100);
    expect(balance.value).toBe(1110);
    expect(averageCost(balance)).toBeCloseTo(11.1, 4);
  });
});
