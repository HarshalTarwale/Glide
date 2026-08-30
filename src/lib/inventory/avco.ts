/**
 * AVCO (weighted average cost) valuation — pure functions, no database.
 *
 * Mirrors src/lib/tax/'s shape deliberately: the money math that must be
 * exactly right lives in a dependency-free module a test can hammer without
 * spinning up Postgres. The service layer (src/server/inventory/stock.ts)
 * calls this; it never reimplements the formula inline.
 *
 * The formula: receiving stock moves the weighted average toward the new
 * cost. Consuming stock (delivery, negative adjustment) does NOT change the
 * average — it only removes value at whatever the average currently is.
 * This is the textbook distinction between AVCO and FIFO, and getting it
 * backwards is the single most common valuation bug in a from-scratch
 * inventory system.
 */

export interface ValuationBalance {
  /** Running on-hand quantity across every location, for this product. */
  qty: number;
  /** Running total value of that quantity. qty=0 implies value=0. */
  value: number;
}

export interface ValuationEvent {
  /** Positive = receiving (or a positive adjustment). Negative = consuming. */
  quantity: number;
  /**
   * Required for a receiving event (the cost being brought in).
   * Ignored for a consuming event — cost there comes from the current
   * average, never from what the caller passes.
   */
  unitCost?: number;
}

export interface ValuationResult extends ValuationBalance {
  /** The cost this specific event was recorded at. */
  eventUnitCost: number;
  /** value of just this event (eventUnitCost * quantity, signed). */
  eventValue: number;
}

export const ZERO_BALANCE: ValuationBalance = { qty: 0, value: 0 };

/** The current average cost implied by a balance. 0 when nothing is on hand. */
export function averageCost(balance: ValuationBalance): number {
  if (balance.qty <= 0) return 0;
  return balance.value / balance.qty;
}

/**
 * Applies one event to a running balance and returns the new balance plus
 * what that event itself was valued at. Never mutates its input.
 */
export function applyValuationEvent(
  balance: ValuationBalance,
  event: ValuationEvent
): ValuationResult {
  if (event.quantity === 0) {
    return { ...balance, eventUnitCost: 0, eventValue: 0 };
  }

  if (event.quantity > 0) {
    // Receiving: the new average is the weighted blend of what was already
    // on hand and what just arrived, at ITS cost.
    if (event.unitCost === undefined) {
      throw new Error("unitCost is required for a receiving event (positive quantity)");
    }
    const eventValue = event.quantity * event.unitCost;
    const qty = round6(balance.qty + event.quantity);
    const value = round4(balance.value + eventValue);
    return { qty, value, eventUnitCost: event.unitCost, eventValue: round4(eventValue) };
  }

  // Consuming: valued at the CURRENT average, which this event does not
  // change. Over-consumption (leaving qty negative) is a caller-level
  // validation concern — see docs/architecture.md §5.6 on why on-hand must
  // never silently go negative for owned (internal) stock; this function
  // stays honest about the arithmetic either way.
  const currentAvg = averageCost(balance);
  const eventValue = event.quantity * currentAvg; // quantity is negative
  const qty = round6(balance.qty + event.quantity);
  const value = round4(balance.value + eventValue);
  return { qty, value, eventUnitCost: currentAvg, eventValue: round4(eventValue) };
}

/**
 * Replays a full event history from zero. This is the reconciliation
 * primitive: given every StockValuationLayer for a product in movedAt
 * order, the result MUST equal the cached balance on the last layer. Used
 * by both the service (to compute the next layer) and by
 * tests/stock-ledger.test.ts (to prove the cache never drifted).
 */
export function replayValuation(events: ValuationEvent[]): ValuationBalance {
  let balance: ValuationBalance = ZERO_BALANCE;
  for (const event of events) {
    balance = applyValuationEvent(balance, event);
  }
  return balance;
}

// Matches the schema's NUMERIC(19,6) / NUMERIC(19,4) precision, so a cached
// DB value and a replayed-in-JS value compare equal rather than differing in
// the 15th decimal place from floating-point noise.
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
