/**
 * Pure leave-calculation functions -- no DB, no framework. The invariant
 * this file protects: the number of days a leave request consumes and the
 * balance remaining against it must always be RECOMPUTED from dates and
 * approved requests, never stored as a separately-maintained counter that
 * can drift. Same discipline as sales/order-status.ts and
 * invoicing/invoice-status.ts.
 */

/** Inclusive business-day count between two dates, weekends (Sat/Sun) excluded. */
export function computeLeaveDays(startDate: Date, endDate: Date): number {
  if (endDate < startDate) {
    throw new Error("End date cannot be before the start date.");
  }

  let count = 0;
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

export interface LeaveBalanceInput {
  annualAllocation: number;
  /** Sum of `days` across this employee's approved requests of this leave type, within the balance year. */
  approvedDaysTaken: number;
}

export interface LeaveBalance {
  allocated: number;
  taken: number;
  remaining: number;
}

/** Never a stored counter -- see this file's header. Remaining can go negative (approved past the allocation); callers decide whether that's a hard stop. */
export function computeLeaveBalance(input: LeaveBalanceInput): LeaveBalance {
  return {
    allocated: input.annualAllocation,
    taken: input.approvedDaysTaken,
    remaining: input.annualAllocation - input.approvedDaysTaken,
  };
}

/** True if two [start,end] date ranges (inclusive) overlap -- used to block a second overlapping request for the same employee. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
