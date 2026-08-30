import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import type { RequestContext } from "@/server/context";

/**
 * Partner service — the DAL for contacts.
 *
 * One model serves customer, supplier and contact (docs/architecture.md
 * §5.2, adopted from Odoo's res.partner in Stage 1 research specifically to
 * avoid the same company existing as unrelated records in five different
 * apps). The billing address and the primary tax registration are edited
 * inline with the partner, in the same transaction, because that is how a
 * user actually thinks about "adding a customer" — not as three separate
 * screens.
 */

export interface PartnerDTO {
  id: string;
  code: string | null;
  name: string;
  kind: "company" | "person";
  isCustomer: boolean;
  isSupplier: boolean;
  email: string | null;
  phone: string | null;
  currency: string | null;
  paymentTermDays: number;
  creditLimit: number | null;
  notes: string | null;
  isActive: boolean;
  // Flattened primary billing address, so the list and form don't need a
  // second round trip for the one address most screens actually show.
  billingCity: string | null;
  billingRegion: string | null;
  billingCountry: string | null;
  billingLine1: string | null;
  // Primary tax registration, e.g. GSTIN / VAT number / TRN / EIN.
  taxId: string | null;
  taxIdCountry: string | null;
}

const SEARCH_FIELDS = ["name", "code", "email", "phone"];
const ALLOWED_FIELDS = ["name", "code", "isCustomer", "isSupplier", "email", "createdAt"];

export const partnerInputSchema = z.object({
  code: z.string().max(32).nullish(),
  name: z.string().min(1, "Name is required").max(200),
  kind: z.enum(["company", "person"]).default("company"),
  isCustomer: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  email: z.email("Enter a valid email").nullish().or(z.literal("")),
  phone: z.string().max(32).nullish(),
  currency: z.string().length(3).nullish(),
  paymentTermDays: z.number().int().min(0).max(365).default(0),
  creditLimit: z.number().min(0).nullish(),
  notes: z.string().max(2000).nullish(),
  // Billing address, optional — a partner can be created before it's known.
  billingLine1: z.string().max(200).nullish(),
  billingCity: z.string().max(100).nullish(),
  billingRegion: z.string().max(100).nullish(),
  billingCountry: z.string().length(2).nullish(),
  billingPostalCode: z.string().max(20).nullish(),
  // Primary tax registration.
  taxId: z.string().max(40).nullish(),
  taxIdCountry: z.string().length(2).nullish(),
});

export type PartnerInput = z.infer<typeof partnerInputSchema>;

type PartnerRow = {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  isCustomer: boolean;
  isSupplier: boolean;
  email: string | null;
  phone: string | null;
  currency: string | null;
  paymentTermDays: number;
  creditLimit: { toString(): string } | null;
  notes: string | null;
  deletedAt: Date | null;
  addresses: { line1: string; city: string | null; region: string | null; country: string }[];
  taxInfo: { taxId: string; country: string }[];
};

function toDTO(row: PartnerRow): PartnerDTO {
  const address = row.addresses[0];
  const tax = row.taxInfo[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as PartnerDTO["kind"],
    isCustomer: row.isCustomer,
    isSupplier: row.isSupplier,
    email: row.email,
    phone: row.phone,
    currency: row.currency,
    paymentTermDays: row.paymentTermDays,
    creditLimit: row.creditLimit ? Number(row.creditLimit.toString()) : null,
    notes: row.notes,
    isActive: row.deletedAt === null,
    billingLine1: address?.line1 ?? null,
    billingCity: address?.city ?? null,
    billingRegion: address?.region ?? null,
    billingCountry: address?.country ?? null,
    taxId: tax?.taxId ?? null,
    taxIdCountry: tax?.country ?? null,
  };
}

const INCLUDE = {
  addresses: {
    where: { kind: "billing" as const },
    take: 1,
    orderBy: { isDefault: "desc" as const },
  },
  taxInfo: { take: 1, orderBy: { createdAt: "asc" as const } },
} as const;

export async function listPartners(
  ctx: RequestContext,
  query: RecordQuery
): Promise<RecordPage<PartnerDTO>> {
  assertPermission(ctx.permissions, "core:partner:read");

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.partner.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: INCLUDE,
      }),
      tx.partner.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => toDTO(r as unknown as PartnerRow)),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getPartner(ctx: RequestContext, id: string): Promise<PartnerDTO | null> {
  assertPermission(ctx.permissions, "core:partner:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.partner.findUnique({ where: { id }, include: INCLUDE });
    return row ? toDTO(row as unknown as PartnerRow) : null;
  });
}

export async function createPartner(
  ctx: RequestContext,
  input: PartnerInput
): Promise<PartnerDTO> {
  assertPermission(ctx.permissions, "core:partner:write");
  const data = partnerInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const partner = await tx.partner.create({
      data: {
        tenantId: ctx.tenantId,
        code: data.code || null,
        name: data.name,
        kind: data.kind,
        isCustomer: data.isCustomer,
        isSupplier: data.isSupplier,
        email: data.email || null,
        phone: data.phone || null,
        currency: data.currency || null,
        paymentTermDays: data.paymentTermDays,
        creditLimit: data.creditLimit ?? null,
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    if (data.billingLine1) {
      await tx.partnerAddress.create({
        data: {
          tenantId: ctx.tenantId,
          partnerId: partner.id,
          kind: "billing",
          isDefault: true,
          line1: data.billingLine1,
          city: data.billingCity || null,
          region: data.billingRegion || null,
          country: data.billingCountry || ctx.country,
          postalCode: data.billingPostalCode || null,
        },
      });
    }

    if (data.taxId) {
      await tx.partnerTaxInfo.create({
        data: {
          tenantId: ctx.tenantId,
          partnerId: partner.id,
          country: data.taxIdCountry || ctx.country,
          taxId: data.taxId,
          isRegistered: true,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Partner",
        entityId: partner.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { name: { from: null, to: data.name } },
      },
    });

    const full = await tx.partner.findUniqueOrThrow({ where: { id: partner.id }, include: INCLUDE });
    return toDTO(full as unknown as PartnerRow);
  });
}

export async function updatePartner(
  ctx: RequestContext,
  id: string,
  input: Partial<PartnerInput>
): Promise<PartnerDTO> {
  assertPermission(ctx.permissions, "core:partner:write");
  const data = partnerInputSchema.partial().parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const before = await tx.partner.findUniqueOrThrow({ where: { id } });

    await tx.partner.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code || null } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.isCustomer !== undefined ? { isCustomer: data.isCustomer } : {}),
        ...(data.isSupplier !== undefined ? { isSupplier: data.isSupplier } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.currency !== undefined ? { currency: data.currency || null } : {}),
        ...(data.paymentTermDays !== undefined ? { paymentTermDays: data.paymentTermDays } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit ?? null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        updatedBy: ctx.userId,
      },
    });

    // Billing address: one row, upserted rather than accumulated, since the
    // form always edits "the" billing address, not a list of them.
    if (data.billingLine1 !== undefined) {
      const existing = await tx.partnerAddress.findFirst({
        where: { partnerId: id, kind: "billing" },
        orderBy: { isDefault: "desc" },
      });
      if (data.billingLine1) {
        const fields = {
          line1: data.billingLine1,
          city: data.billingCity || null,
          region: data.billingRegion || null,
          country: data.billingCountry || ctx.country,
          postalCode: data.billingPostalCode || null,
        };
        if (existing) {
          await tx.partnerAddress.update({ where: { id: existing.id }, data: fields });
        } else {
          await tx.partnerAddress.create({
            data: { tenantId: ctx.tenantId, partnerId: id, kind: "billing", isDefault: true, ...fields },
          });
        }
      }
    }

    if (data.taxId !== undefined) {
      const existing = await tx.partnerTaxInfo.findFirst({ where: { partnerId: id }, orderBy: { createdAt: "asc" } });
      if (data.taxId) {
        const fields = { country: data.taxIdCountry || ctx.country, taxId: data.taxId };
        if (existing) {
          await tx.partnerTaxInfo.update({ where: { id: existing.id }, data: fields });
        } else {
          await tx.partnerTaxInfo.create({
            data: { tenantId: ctx.tenantId, partnerId: id, isRegistered: true, ...fields },
          });
        }
      }
    }

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    const asText = (v: unknown) => (v === null || v === undefined ? null : String(v));
    for (const key of ["name", "email", "phone", "isCustomer", "isSupplier"] as const) {
      if (data[key] === undefined) continue;
      const previous = (before as unknown as Record<string, unknown>)[key];
      if (asText(previous) !== asText(data[key])) {
        changes[key] = { from: asText(previous), to: asText(data[key]) };
      }
    }
    if (Object.keys(changes).length > 0) {
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "Partner",
          entityId: id,
          action: "updated",
          actorId: ctx.userId,
          actorName: ctx.userName,
          changes,
        },
      });
    }

    const full = await tx.partner.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return toDTO(full as unknown as PartnerRow);
  });
}

/** Soft delete. A partner referenced by historical orders/invoices must remain resolvable forever. */
export async function archivePartner(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "core:partner:write");

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.partner.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: ctx.userId } });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Partner",
        entityId: id,
        action: "archived",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}
