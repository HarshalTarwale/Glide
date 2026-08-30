import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner, updatePartner, listPartners, archivePartner } from "@/server/core/partners";
import { createWarehouse, updateWarehouse, listWarehouses, archiveWarehouse } from "@/server/inventory/warehouses";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";
import { EMPTY_QUERY } from "@/lib/query/record-query";

/**
 * End-to-end verification of the P1 CRUD gap closed this session: contacts
 * (Partner) and warehouses now have real service functions and real UI, not
 * just a schema. This exercises the exact functions the Server Actions in
 * src/app/app/contacts and src/app/app/inventory/warehouses call.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string, country = "IN"): Promise<RequestContext> {
  const result = await signup({
    name: "Test Owner",
    email: `crud-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country,
  });
  if (!result.ok) throw new Error(result.error);

  return withTenant(result.tenantId, async (tx) => {
    const membership = await tx.membership.findFirstOrThrow({
      where: { tenantId: result.tenantId, userId: result.userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = membership.roles.map((r) => r.role);
    return {
      userId: result.userId,
      userName: "Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country,
      currency: country === "IN" ? "INR" : "USD",
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };
  });
}

describeWithDb("Partner (Contacts) service", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("creates a partner with billing address and tax id in one call", async () => {
    const ctx = await makeOwnerContext("Partner CRUD Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      code: "ACME",
      name: "Acme Industrial Supplies",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      email: "accounts@acme.example.com",
      phone: null,
      currency: "INR",
      paymentTermDays: 30,
      creditLimit: null,
      notes: null,
      billingLine1: "12 Industrial Estate",
      billingCity: "Mumbai",
      billingRegion: "Maharashtra",
      billingCountry: "IN",
      billingPostalCode: "400001",
      taxId: "27AABCU9603R1ZX",
      taxIdCountry: "IN",
    });

    expect(partner.name).toBe("Acme Industrial Supplies");
    expect(partner.billingCity).toBe("Mumbai");
    expect(partner.taxId).toBe("27AABCU9603R1ZX");
    expect(partner.isCustomer).toBe(true);
  });

  it("updates a partner's billing address without duplicating the row", async () => {
    const ctx = await makeOwnerContext("Partner Update Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      name: "Nexa Retail",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 0,
      billingLine1: "Old Address",
      billingCity: "Pune",
      billingCountry: "IN",
    });

    const updated = await updatePartner(ctx, partner.id, {
      billingLine1: "New Address",
      billingCity: "Nashik",
    });

    expect(updated.billingLine1).toBe("New Address");
    expect(updated.billingCity).toBe("Nashik");

    // Upsert, not accumulate: exactly one billing address row should exist.
    const count = await withTenant(ctx.tenantId, (tx) =>
      tx.partnerAddress.count({ where: { partnerId: partner.id, kind: "billing" } })
    );
    expect(count).toBe(1);
  });

  it("lists only non-archived partners, and archive is reversible-by-inspection", async () => {
    const ctx = await makeOwnerContext("Partner List Co");
    tenantIds.push(ctx.tenantId);

    const p1 = await createPartner(ctx, { name: "Keep Me", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });
    const p2 = await createPartner(ctx, { name: "Archive Me", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });

    await archivePartner(ctx, p2.id);

    const page = await listPartners(ctx, EMPTY_QUERY);
    const names = page.rows.map((r) => r.name);
    expect(names).toContain("Keep Me");
    expect(names).not.toContain("Archive Me");

    const archivedRow = await withTenant(ctx.tenantId, (tx) =>
      tx.partner.findUniqueOrThrow({ where: { id: p2.id } })
    );
    expect(archivedRow.deletedAt).not.toBeNull();
    void p1;
  });
});

describeWithDb("Warehouse service", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("creates a warehouse with its own internal stock location", async () => {
    const ctx = await makeOwnerContext("Warehouse CRUD Co");
    tenantIds.push(ctx.tenantId);

    const warehouse = await createWarehouse(ctx, {
      code: "north",
      name: "North Depot",
      city: "Delhi",
      region: "Delhi",
    });

    expect(warehouse.code).toBe("NORTH"); // uppercased
    expect(warehouse.locationCount).toBe(1);

    const location = await withTenant(ctx.tenantId, (tx) =>
      tx.location.findFirstOrThrow({ where: { warehouseId: warehouse.id } })
    );
    expect(location.kind).toBe("internal");
    expect(location.code).toBe("NORTH/STOCK");
  });

  it("a fresh tenant already has its signup-time warehouse manageable through this service", async () => {
    const ctx = await makeOwnerContext("Warehouse List Co");
    tenantIds.push(ctx.tenantId);

    const page = await listWarehouses(ctx, EMPTY_QUERY);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].code).toBe("MAIN");
    expect(page.rows[0].locationCount).toBeGreaterThanOrEqual(1);
  });

  it("preserves the address on update instead of blanking it", async () => {
    const ctx = await makeOwnerContext("Warehouse Update Co");
    tenantIds.push(ctx.tenantId);

    const warehouse = await createWarehouse(ctx, {
      code: "EAST",
      name: "East Depot",
      addressLine1: "5 Port Road",
      city: "Chennai",
    });

    const renamed = await updateWarehouse(ctx, warehouse.id, { name: "East Depot (Renamed)" });

    expect(renamed.name).toBe("East Depot (Renamed)");
    // The regression this guards: WarehouseDTO originally omitted
    // addressLine1/postalCode, so the edit form could never round-trip them
    // and every save would null them out.
    expect(renamed.addressLine1).toBe("5 Port Road");
    expect(renamed.city).toBe("Chennai");
  });

  it("archives a warehouse without deleting its stock location history", async () => {
    const ctx = await makeOwnerContext("Warehouse Archive Co");
    tenantIds.push(ctx.tenantId);

    const warehouse = await createWarehouse(ctx, { code: "TEMP", name: "Temp Depot" });
    await archiveWarehouse(ctx, warehouse.id);

    const page = await listWarehouses(ctx, EMPTY_QUERY);
    expect(page.rows.find((w) => w.id === warehouse.id)).toBeUndefined();

    const location = await withTenant(ctx.tenantId, (tx) =>
      tx.location.findFirst({ where: { warehouseId: warehouse.id } })
    );
    expect(location).not.toBeNull();
  });
});
