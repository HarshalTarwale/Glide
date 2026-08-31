import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Company profile — the piece Settings never exposed. bootstrap-tenant.ts
 * creates a Company with a country but no region and no tax ID, and until
 * now nothing let a tenant fill either in.
 *
 * That is a real gap, not a cosmetic one: the P1 GST engine correctly
 * refuses to compute tax when the seller's state is unknown (place of
 * supply cannot be determined), which tests/sales-orders.test.ts surfaced
 * by failing outright. A fresh Indian tenant could not create a single
 * sales order until this existed.
 */

export interface CompanyDTO {
  id: string;
  name: string;
  legalName: string | null;
  country: string;
  currency: string;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  /** True when the fields the active tax regime needs are actually filled
   *  in -- surfaced as a warning banner rather than a silent failure the
   *  next time someone tries to confirm an order. */
  isTaxReady: boolean;
}

export const updateCompanySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  legalName: z.string().max(200).nullish(),
  taxId: z.string().max(40).nullish(),
  addressLine1: z.string().max(200).nullish(),
  addressLine2: z.string().max(200).nullish(),
  city: z.string().max(100).nullish(),
  region: z.string().max(100).nullish(),
  postalCode: z.string().max(20).nullish(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

function toDTO(company: {
  id: string;
  name: string;
  legalName: string | null;
  country: string;
  currency: string;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
}): CompanyDTO {
  return {
    ...company,
    // A region is what every regime studied actually needs (place of
    // supply / nexus); taxId matters for a registered filer but an
    // unregistered one is a legitimate state too, so it does not gate
    // readiness on its own.
    isTaxReady: Boolean(company.region),
  };
}

export async function getCompany(ctx: RequestContext): Promise<CompanyDTO> {
  assertPermission(ctx.permissions, "core:company:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
    });
    return toDTO(company);
  });
}

export async function updateCompany(ctx: RequestContext, input: UpdateCompanyInput): Promise<CompanyDTO> {
  assertPermission(ctx.permissions, "core:company:write");
  const data = updateCompanySchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const existing = await tx.company.findFirstOrThrow({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, region: true },
    });

    const company = await tx.company.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        legalName: data.legalName || null,
        taxId: data.taxId || null,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        region: data.region || null,
        postalCode: data.postalCode || null,
        updatedBy: ctx.userId,
      },
    });

    if (existing.region !== company.region) {
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "Company",
          entityId: company.id,
          action: "updated",
          actorId: ctx.userId,
          actorName: ctx.userName,
          changes: { region: { from: existing.region, to: company.region } },
        },
      });
    }

    return toDTO(company);
  });
}
