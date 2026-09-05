/**
 * Pure BOM/work-order math -- no database. The invariant this file
 * protects: a work order's required component quantities and its
 * finished-good unit cost are always RECOMPUTED from the BOM ratio and the
 * actual component costs consumed, never hand-entered or cached separately.
 */

export interface BomComponentRequirement {
  componentProductId: string;
  /** Quantity required for the FULL work order quantity, not per unit. */
  requiredQty: number;
}

/**
 * Scales each BOM line from "per batch" (the BOM's own `quantity`, e.g. "this
 * recipe makes 10 units") to "for this work order" (`workOrderQty`).
 */
export function scaleBomLines(
  lines: { componentProductId: string; quantity: number }[],
  bomBatchQty: number,
  workOrderQty: number
): BomComponentRequirement[] {
  if (bomBatchQty <= 0) {
    throw new Error("A BOM's batch quantity must be greater than zero.");
  }
  if (workOrderQty <= 0) {
    throw new Error("A work order's quantity must be greater than zero.");
  }

  const ratio = workOrderQty / bomBatchQty;
  return lines.map((l) => ({ componentProductId: l.componentProductId, requiredQty: round6(l.quantity * ratio) }));
}

/** Actual costing: the finished good's unit cost is whatever its components actually cost when consumed, spread over the quantity produced. Never a configured standard cost. */
export function computeProducedUnitCost(totalComponentCost: number, quantityProduced: number): number {
  if (quantityProduced <= 0) {
    throw new Error("Quantity produced must be greater than zero.");
  }
  return round4(totalComponentCost / quantityProduced);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
