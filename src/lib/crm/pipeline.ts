/**
 * Pipeline math — pure functions, no database. Mirrors
 * src/lib/sales/order-status.ts and src/lib/accounting/journal.ts
 * deliberately: the numbers a sales manager actually reads off a pipeline
 * screen (weighted forecast, win rate) live here, dependency-free, so a
 * test can hammer them without Postgres.
 */

export type OpportunityStage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export const STAGE_ORDER: OpportunityStage[] = ["new", "qualified", "proposal", "negotiation", "won", "lost"];

/**
 * Suggested probability when an opportunity enters a stage — a default the
 * service layer applies on creation and on stage change, never a formula
 * that overrides what a salesperson has manually set. See
 * prisma/schema/crm.prisma's Opportunity.probability doc comment.
 */
export const DEFAULT_PROBABILITY_BY_STAGE: Record<OpportunityStage, number> = {
  new: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

/** won/lost are terminal — an opportunity in either no longer counts as "open" pipeline. */
export function isTerminalStage(stage: OpportunityStage): boolean {
  return stage === "won" || stage === "lost";
}

/** The one required fact a closed-lost opportunity must carry — see Opportunity.lostReason's own doc comment. */
export function requiresLostReason(stage: OpportunityStage): boolean {
  return stage === "lost";
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PipelineOpportunity {
  stage: OpportunityStage;
  expectedValue: number;
  probability: number;
}

export interface PipelineSummary {
  openCount: number;
  /** Sum of expectedValue across every OPEN (non-terminal) opportunity — the raw pipeline size. */
  openValue: number;
  /** Sum of expectedValue * probability/100 across open opportunities — the forecast a sales manager actually trusts, since it isn't fooled by a huge deal sitting at 10% probability. */
  weightedValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  /** wonCount / (wonCount + lostCount), or null when nothing has closed yet — a 0% win rate and "no data" must never look the same. */
  winRate: number | null;
}

export function summarizePipeline(opportunities: PipelineOpportunity[]): PipelineSummary {
  let openCount = 0;
  let openValue = 0;
  let weightedValue = 0;
  let wonCount = 0;
  let wonValue = 0;
  let lostCount = 0;
  let lostValue = 0;

  for (const o of opportunities) {
    if (o.stage === "won") {
      wonCount++;
      wonValue = round2(wonValue + o.expectedValue);
    } else if (o.stage === "lost") {
      lostCount++;
      lostValue = round2(lostValue + o.expectedValue);
    } else {
      openCount++;
      openValue = round2(openValue + o.expectedValue);
      weightedValue = round2(weightedValue + o.expectedValue * (o.probability / 100));
    }
  }

  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? round2((wonCount / closedCount) * 100) : null;

  return { openCount, openValue, weightedValue, wonCount, wonValue, lostCount, lostValue, winRate };
}

/** Groups opportunities by stage, in pipeline order — what a Kanban board renders directly. */
export function groupByStage<T extends { stage: OpportunityStage }>(opportunities: T[]): Map<OpportunityStage, T[]> {
  const groups = new Map<OpportunityStage, T[]>(STAGE_ORDER.map((s) => [s, []]));
  for (const o of opportunities) {
    groups.get(o.stage)!.push(o);
  }
  return groups;
}
