import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { recordMove } from "@/server/inventory/stock";
import { emit, type StockValuedEvent } from "@/server/core/events";
import { nextDocumentNumber } from "@/server/core/numbering";
import { scaleBomLines, computeProducedUnitCost } from "@/lib/manufacturing/bom";
import type { RequestContext } from "@/server/context";

/**
 * Work orders: draft (editable) -> confirmed (locked) -> done (stock
 * actually moved, immutable) or cancelled from either open state.
 *
 * Completion is the only place this module touches the stock ledger, and
 * it does so through the exact same recordMove() primitive every other
 * module uses -- see manufacturing.prisma's header for why that needed no
 * changes to P2 at all, only a new location kind and two new move-type
 * labels.
 */

export interface WorkOrderLineDTO {
  id: string;
  componentProductId: string;
  componentName: string;
  componentSku: string;
  plannedQty: number;
}

export interface WorkOrderDTO {
  id: string;
  number: string;
  bomId: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: string;
  scheduledDate: string | null;
  completedAt: string | null;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
  lines: WorkOrderLineDTO[];
}

const SEARCH_FIELDS = ["number", "product.name"];
const ALLOWED_FIELDS = ["number", "status", "quantity", "scheduledDate", "createdAt"];

export const createWorkOrderInputSchema = z.object({
  bomId: z.uuid(),
  warehouseId: z.uuid(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  scheduledDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderInputSchema>;

export const updateWorkOrderInputSchema = createWorkOrderInputSchema;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderInputSchema>;

function toDTO(row: {
  id: string;
  number: string;
  bomId: string;
  productId: string;
  product: { name: string; sku: string };
  warehouseId: string;
  warehouse: { name: string };
  quantity: { toString(): string };
  status: string;
  scheduledDate: Date | null;
  completedAt: Date | null;
  unitCost: { toString(): string } | null;
  notes: string | null;
  createdAt: Date;
  lines: { id: string; componentProductId: string; component: { name: string; sku: string }; plannedQty: { toString(): string } }[];
}): WorkOrderDTO {
  return {
    id: row.id,
    number: row.number,
    bomId: row.bomId,
    productId: row.productId,
    productName: row.product.name,
    productSku: row.product.sku,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    quantity: Number(row.quantity.toString()),
    status: row.status,
    scheduledDate: row.scheduledDate?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    unitCost: row.unitCost ? Number(row.unitCost.toString()) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((l) => ({
      id: l.id,
      componentProductId: l.componentProductId,
      componentName: l.component.name,
      componentSku: l.component.sku,
      plannedQty: Number(l.plannedQty.toString()),
    })),
  };
}

const INCLUDE = {
  product: { select: { name: true, sku: true } },
  warehouse: { select: { name: true } },
  lines: { include: { component: { select: { name: true, sku: true } } } },
} as const;

async function resolveScaledLines(tx: TenantTransaction, bomId: string, quantity: number) {
  const bom = await tx.billOfMaterial.findUniqueOrThrow({ where: { id: bomId }, include: { lines: true } });
  if (!bom.isActive) {
    throw new Error("This BOM is inactive and cannot be used for a new work order.");
  }
  const scaled = scaleBomLines(
    bom.lines.map((l) => ({ componentProductId: l.componentProductId, quantity: Number(l.quantity.toString()) })),
    Number(bom.quantity.toString()),
    quantity
  );
  return { bom, scaled };
}

export async function listWorkOrders(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<WorkOrderDTO>> {
  assertPermission(ctx.permissions, "manufacturing:workorder:read");

  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.workOrder.findMany({ where: compiled.where, orderBy: compiled.orderBy, skip: compiled.skip, take: compiled.take, include: INCLUDE }),
      tx.workOrder.count({ where: compiled.where }),
    ]);
    return { rows: rows.map(toDTO), total, page: query.page, pageSize: compiled.take };
  });
}

export async function getWorkOrder(ctx: RequestContext, id: string): Promise<WorkOrderDTO | null> {
  assertPermission(ctx.permissions, "manufacturing:workorder:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.workOrder.findUnique({ where: { id }, include: INCLUDE });
    return row ? toDTO(row) : null;
  });
}

export async function createWorkOrder(ctx: RequestContext, input: CreateWorkOrderInput): Promise<string> {
  assertPermission(ctx.permissions, "manufacturing:workorder:write");
  const data = createWorkOrderInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const { bom, scaled } = await resolveScaledLines(tx, data.bomId, data.quantity);
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "work_order");

    const workOrder = await tx.workOrder.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        bomId: data.bomId,
        productId: bom.productId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        scheduledDate: data.scheduledDate ?? null,
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        lines: {
          create: scaled.map((s) => ({ tenantId: ctx.tenantId, componentProductId: s.componentProductId, plannedQty: s.requiredQty })),
        },
      },
    });

    return workOrder.id;
  });
}

export async function updateWorkOrder(ctx: RequestContext, id: string, input: UpdateWorkOrderInput): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:workorder:write");
  const data = updateWorkOrderInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({ where: { id } });
    if (workOrder.status !== "draft") {
      throw new Error(`Only a draft work order can be edited -- this one is "${workOrder.status}".`);
    }

    const { bom, scaled } = await resolveScaledLines(tx, data.bomId, data.quantity);

    await tx.workOrderLine.deleteMany({ where: { workOrderId: id } });
    await tx.workOrder.update({
      where: { id },
      data: {
        bomId: data.bomId,
        productId: bom.productId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        scheduledDate: data.scheduledDate ?? null,
        notes: data.notes || null,
        updatedBy: ctx.userId,
        lines: {
          create: scaled.map((s) => ({ tenantId: ctx.tenantId, componentProductId: s.componentProductId, plannedQty: s.requiredQty })),
        },
      },
    });
  });
}

export async function confirmWorkOrder(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:workorder:confirm");

  await withTenant(ctx.tenantId, async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({ where: { id }, include: { bom: true } });
    if (workOrder.status !== "draft") {
      throw new Error(`Only a draft work order can be confirmed -- this one is "${workOrder.status}".`);
    }
    if (!workOrder.bom.isActive) {
      throw new Error("This work order's BOM has since been deactivated and cannot be confirmed.");
    }
    await tx.workOrder.update({ where: { id }, data: { status: "confirmed", updatedBy: ctx.userId } });
  });
}

export async function cancelWorkOrder(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:workorder:cancel");

  await withTenant(ctx.tenantId, async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({ where: { id } });
    if (workOrder.status !== "draft" && workOrder.status !== "confirmed") {
      throw new Error(`Only a draft or confirmed work order can be cancelled -- this one is "${workOrder.status}".`);
    }
    await tx.workOrder.update({ where: { id }, data: { status: "cancelled", updatedBy: ctx.userId } });
  });
}

/**
 * Completes a confirmed work order in one step, for its full planned
 * quantity (see manufacturing.prisma's scope note on why partial
 * completion is deferred): consumes every component at its current AVCO,
 * then produces the finished good at the sum of what those components
 * actually cost, divided by the quantity produced -- actual costing, not a
 * configured standard cost.
 */
export async function completeWorkOrder(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:workorder:complete");

  const valuationEvents = await withTenant(ctx.tenantId, async (tx) => {
    const workOrder = await tx.workOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (workOrder.status !== "confirmed") {
      throw new Error(`Only a confirmed work order can be completed -- this one is "${workOrder.status}".`);
    }

    const [stockLocation, productionLocation] = await Promise.all([
      tx.location.findFirstOrThrow({ where: { tenantId: ctx.tenantId, warehouseId: workOrder.warehouseId, kind: "internal" } }),
      tx.location.findFirstOrThrow({ where: { tenantId: ctx.tenantId, kind: "production", code: "PRODUCTION" } }),
    ]);

    const valuationEvents: StockValuedEvent[] = [];
    let totalComponentCost = 0;
    for (const line of workOrder.lines) {
      const { valuationEvent } = await recordMove(tx, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "consumption",
        productId: line.componentProductId,
        fromLocationId: stockLocation.id,
        toLocationId: productionLocation.id,
        quantity: Number(line.plannedQty.toString()),
        reference: workOrder.number,
      });
      if (valuationEvent) {
        valuationEvents.push(valuationEvent);
        totalComponentCost += Math.abs(valuationEvent.value);
      }
    }

    const quantity = Number(workOrder.quantity.toString());
    const unitCost = computeProducedUnitCost(totalComponentCost, quantity);

    const { valuationEvent: productionEvent } = await recordMove(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "production",
      productId: workOrder.productId,
      fromLocationId: productionLocation.id,
      toLocationId: stockLocation.id,
      quantity,
      unitCost,
      reference: workOrder.number,
    });
    if (productionEvent) valuationEvents.push(productionEvent);

    await tx.workOrder.update({
      where: { id },
      data: { status: "done", completedAt: new Date(), unitCost, updatedBy: ctx.userId },
    });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "WorkOrder", entityId: id, action: "completed", actorId: ctx.userId, actorName: ctx.userName, changes: { unitCost: { from: null, to: unitCost } } },
    });

    return valuationEvents;
  });

  // Consumption + production always net to zero within the same Inventory
  // Asset account (production's unitCost is DEFINED as totalComponentCost /
  // quantity -- see computeProducedUnitCost), so the GL subscriber
  // deliberately ignores both event types; emitted anyway for the same
  // reason every stock move gets one, and so a future subscriber (a
  // production-cost report, say) doesn't need stock.ts touched again.
  valuationEvents.forEach(emit);
}
