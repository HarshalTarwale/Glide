import { describe, expect, it } from "vitest";
import {
  isTerminalStage,
  requiresLostReason,
  summarizePipeline,
  groupByStage,
  DEFAULT_PROBABILITY_BY_STAGE,
  STAGE_ORDER,
  type PipelineOpportunity,
} from "@/lib/crm/pipeline";

describe("isTerminalStage / requiresLostReason", () => {
  it("won and lost are terminal; every other stage is open", () => {
    expect(isTerminalStage("won")).toBe(true);
    expect(isTerminalStage("lost")).toBe(true);
    for (const stage of ["new", "qualified", "proposal", "negotiation"] as const) {
      expect(isTerminalStage(stage)).toBe(false);
    }
  });

  it("only lost requires a reason -- winning needs no justification", () => {
    expect(requiresLostReason("lost")).toBe(true);
    expect(requiresLostReason("won")).toBe(false);
    expect(requiresLostReason("new")).toBe(false);
  });
});

describe("DEFAULT_PROBABILITY_BY_STAGE", () => {
  it("increases monotonically through the open stages, and matches the terminal outcomes exactly", () => {
    expect(DEFAULT_PROBABILITY_BY_STAGE.new).toBeLessThan(DEFAULT_PROBABILITY_BY_STAGE.qualified);
    expect(DEFAULT_PROBABILITY_BY_STAGE.qualified).toBeLessThan(DEFAULT_PROBABILITY_BY_STAGE.proposal);
    expect(DEFAULT_PROBABILITY_BY_STAGE.proposal).toBeLessThan(DEFAULT_PROBABILITY_BY_STAGE.negotiation);
    expect(DEFAULT_PROBABILITY_BY_STAGE.won).toBe(100);
    expect(DEFAULT_PROBABILITY_BY_STAGE.lost).toBe(0);
  });

  it("defines every stage in STAGE_ORDER, no more, no less", () => {
    expect(Object.keys(DEFAULT_PROBABILITY_BY_STAGE).sort()).toEqual([...STAGE_ORDER].sort());
  });
});

describe("summarizePipeline", () => {
  it("separates open pipeline from won/lost, and weights open value by probability", () => {
    const opportunities: PipelineOpportunity[] = [
      { stage: "new", expectedValue: 10000, probability: 10 },
      { stage: "negotiation", expectedValue: 20000, probability: 75 },
      { stage: "won", expectedValue: 5000, probability: 100 },
      { stage: "lost", expectedValue: 8000, probability: 0 },
    ];
    const summary = summarizePipeline(opportunities);

    expect(summary.openCount).toBe(2);
    expect(summary.openValue).toBe(30000);
    // 10000*0.10 + 20000*0.75 = 1000 + 15000 = 16000
    expect(summary.weightedValue).toBe(16000);
    expect(summary.wonCount).toBe(1);
    expect(summary.wonValue).toBe(5000);
    expect(summary.lostCount).toBe(1);
    expect(summary.lostValue).toBe(8000);
  });

  it("a huge low-probability deal contributes little to the weighted forecast, unlike the raw open value", () => {
    const opportunities: PipelineOpportunity[] = [{ stage: "new", expectedValue: 1000000, probability: 5 }];
    const summary = summarizePipeline(opportunities);
    expect(summary.openValue).toBe(1000000);
    expect(summary.weightedValue).toBe(50000);
  });

  it("win rate is null with nothing closed yet -- never conflated with a 0% win rate", () => {
    const summary = summarizePipeline([{ stage: "new", expectedValue: 1000, probability: 10 }]);
    expect(summary.winRate).toBeNull();
  });

  it("win rate is the share of closed deals that were won", () => {
    const opportunities: PipelineOpportunity[] = [
      { stage: "won", expectedValue: 1000, probability: 100 },
      { stage: "won", expectedValue: 1000, probability: 100 },
      { stage: "lost", expectedValue: 1000, probability: 0 },
    ];
    expect(summarizePipeline(opportunities).winRate).toBe(66.67);
  });

  it("a genuine 0% win rate (all closed deals lost) is reported as exactly 0, not null", () => {
    const opportunities: PipelineOpportunity[] = [{ stage: "lost", expectedValue: 1000, probability: 0 }];
    expect(summarizePipeline(opportunities).winRate).toBe(0);
  });

  it("an empty pipeline summarizes to all zeros and a null win rate, without throwing", () => {
    const summary = summarizePipeline([]);
    expect(summary).toEqual({ openCount: 0, openValue: 0, weightedValue: 0, wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0, winRate: null });
  });
});

describe("groupByStage", () => {
  it("buckets every opportunity under its stage, including empty stages", () => {
    const opportunities = [
      { id: "a", stage: "new" as const },
      { id: "b", stage: "new" as const },
      { id: "c", stage: "won" as const },
    ];
    const groups = groupByStage(opportunities);
    expect(groups.get("new")).toHaveLength(2);
    expect(groups.get("won")).toHaveLength(1);
    expect(groups.get("qualified")).toHaveLength(0);
    expect(groups.get("lost")).toHaveLength(0);
  });

  it("preserves STAGE_ORDER as the map's key order, for a Kanban board's column order", () => {
    const groups = groupByStage([]);
    expect([...groups.keys()]).toEqual(STAGE_ORDER);
  });
});
