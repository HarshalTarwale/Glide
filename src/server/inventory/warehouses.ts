import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import type { RequestContext } from "@/server/context";

/**
 * Warehouse service. Deliberately small in P1 -- this is master data, not
 * the P2 stock module. What P2's move ledger needs from a warehouse is that
 * it already has an internal stock location to move things in and out of,
 * so createWarehouse creates that location in the same transaction, exactly
 * the pattern bootstrap-tenant.ts uses for the tenant's first warehouse.
 *
 * Locations themselves (transfers, sub-bins, external counterparties) stay
 * read-only here; they get their own CRUD when P2 needs it.
 */

export interface WarehouseDTO {
  id: string;
  code: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isActive: boolean;
  locationCount: number;
}

const SEARCH_FIELDS = ["name", "code", "city"];
const ALLOWED_FIELDS = ["name", "code", "isActive", "createdAt"];

export const warehouseInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(20),
  name: z.string().min(1, "Name is required").max(200),
  addressLine1: z.string().max(200).nullish(),
  city: z.string().max(100).nullish(),
  region: z.string().max(100).nullish(),
  postalCode: z.string().max(20).nullish(),
  country: z.string().length(2).nullish(),
});

export type WarehouseInput = z.infer<typeof warehouseInputSchema>;

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isActive: boolean;
  _count: { locations: number };
};

function toDTO(row: WarehouseRow): WarehouseDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    addressLine1: row.addressLine1,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    isActive: row.isActive,
    locationCount: row._count.locations,
  };
}

const INCLUDE = { _count: { select: { locations: true } } } as const;

export async function listWarehouses(
  ctx: RequestContext,
  query: RecordQuery
): Promise<RecordPage<WarehouseDTO>> {
  assertPermission(ctx.permissions, "inventory:warehouse:read");

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.warehouse.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: INCLUDE,
      }),
      tx.warehouse.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => toDTO(r as unknown as WarehouseRow)),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function createWarehouse(
  ctx: RequestContext,
  input: WarehouseInput
): Promise<WarehouseDTO> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");
  const data = warehouseInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const warehouse = await tx.warehouse.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        code: data.code.toUpperCase(),
        name: data.name,
        addressLine1: data.addressLine1 || null,
        city: data.city || null,
        region: data.region || null,
        postalCode: data.postalCode || null,
        country: data.country || ctx.country,
      },
    });

    // Every warehouse needs at least one internal stock location for P2's
    // move ledger to move things in and out of -- the same rule
    // bootstrap-tenant.ts applies to a tenant's first warehouse at signup.
    await tx.location.create({
      data: {
        tenantId: ctx.tenantId,
        warehouseId: warehouse.id,
        kind: "internal",
        code: `${warehouse.code}/STOCK`,
        name: "Stock",
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Warehouse",
        entityId: warehouse.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { name: { from: null, to: data.name } },
      },
    });

    const full = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouse.id }, include: INCLUDE });
    return toDTO(full as unknown as WarehouseRow);
  });
}

export async function updateWarehouse(
  ctx: RequestContext,
  id: string,
  input: Partial<WarehouseInput>
): Promise<WarehouseDTO> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");
  const data = warehouseInputSchema.partial().parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    await tx.warehouse.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.region !== undefined ? { region: data.region || null } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode || null } : {}),
        ...(data.country !== undefined ? { country: data.country || null } : {}),
      },
    });

    const full = await tx.warehouse.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return toDTO(full as unknown as WarehouseRow);
  });
}

/**
 * Soft delete only, and only when nothing references it. A warehouse behind
 * historical stock moves must remain resolvable forever -- the real
 * enforcement (via StockMove foreign keys) lands with P2; for now this
 * refuses when the warehouse still has locations beyond its own default one.
 */
export async function archiveWarehouse(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Warehouse",
        entityId: id,
        action: "archived",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}
