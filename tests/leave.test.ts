import { describe, it, expect } from "vitest";
import { computeLeaveDays, computeLeaveBalance, rangesOverlap } from "@/lib/hr/leave";

describe("computeLeaveDays", () => {
  it("counts a single weekday as 1 day", () => {
    expect(computeLeaveDays(new Date("2026-09-07T00:00:00Z"), new Date("2026-09-07T00:00:00Z"))).toBe(1);
  });

  it("counts a Mon-Fri work week as 5 days", () => {
    expect(computeLeaveDays(new Date("2026-09-07T00:00:00Z"), new Date("2026-09-11T00:00:00Z"))).toBe(5);
  });

  it("excludes weekends spanned by the range", () => {
    // Mon 2026-09-07 .. Mon 2026-09-14 = 2 full weeks minus the two weekends
    expect(computeLeaveDays(new Date("2026-09-07T00:00:00Z"), new Date("2026-09-14T00:00:00Z"))).toBe(6);
  });

  it("counts zero days when the range is entirely a weekend", () => {
    expect(computeLeaveDays(new Date("2026-09-05T00:00:00Z"), new Date("2026-09-06T00:00:00Z"))).toBe(0);
  });

  it("throws when the end date is before the start date", () => {
    expect(() => computeLeaveDays(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-01T00:00:00Z"))).toThrow();
  });
});

describe("computeLeaveBalance", () => {
  it("subtracts approved days from the allocation", () => {
    expect(computeLeaveBalance({ annualAllocation: 20, approvedDaysTaken: 5 })).toEqual({ allocated: 20, taken: 5, remaining: 15 });
  });

  it("allows remaining to go negative rather than clamping", () => {
    expect(computeLeaveBalance({ annualAllocation: 10, approvedDaysTaken: 12 }).remaining).toBe(-2);
  });

  it("reports the full allocation when nothing has been taken", () => {
    expect(computeLeaveBalance({ annualAllocation: 20, approvedDaysTaken: 0 }).remaining).toBe(20);
  });
});

describe("rangesOverlap", () => {
  const d = (s: string) => new Date(s);

  it("detects a fully contained overlap", () => {
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-10"), d("2026-09-03"), d("2026-09-05"))).toBe(true);
  });

  it("detects a partial overlap at the edge", () => {
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-05"), d("2026-09-05"), d("2026-09-10"))).toBe(true);
  });

  it("returns false for two ranges that never touch", () => {
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-05"), d("2026-09-06"), d("2026-09-10"))).toBe(false);
  });
});
