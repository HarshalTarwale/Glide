import "server-only";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-client";
import { SYSTEM_ROLES } from "@/lib/auth/permissions";
import { getCountry } from "@/lib/i18n/countries";

export const signupSchema = z.object({
  name: z.string().min(1, "Your name is required").max(120),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  organisation: z.string().min(1, "Organisation name is required").max(120),
  country: z.string().length(2),
});

export type SignupInput = z.infer<typeof signupSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Sign-up: the one flow that has to create a tenant before a tenant context
 * can exist.
 *
 * The trick is that we generate the tenant's UUID in application code FIRST,
 * then open the tenant context with it, then insert. Every INSERT then
 * satisfies its own `WITH CHECK (tenantId = app_current_tenant())` policy —
 * so sign-up needs no RLS bypass, no superuser role, and no special-case
 * policy. The isolation guarantee is never relaxed, not even here.
 */
export async function signup(input: SignupInput) {
  const data = signupSchema.parse(input);
  const pack = getCountry(data.country);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false as const, error: "An account with that email already exists." };
  }

  // The user row is global (not tenant-scoped), so it is created outside any
  // tenant context. One human, one account, potentially many tenants.
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash: await bcrypt.hash(data.password, 12),
    },
    select: { id: true },
  });

  const tenantId = randomUUID();

  await withTenant(tenantId, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        name: data.organisation,
        slug: `${slugify(data.organisation)}-${tenantId.slice(0, 6)}`,
        country: pack.code,
        currency: pack.currency,
        timeZone: pack.timeZone,
      },
    });

    await tx.company.create({
      data: {
        tenantId,
        name: data.organisation,
        country: pack.code,
        currency: pack.currency,
      },
    });

    // Seed the built-in roles for this tenant.
    await tx.role.createMany({
      data: SYSTEM_ROLES.map((r) => ({
        tenantId,
        name: r.name,
        description: r.description,
        permissions: [...r.permissions],
        recordScope: r.recordScope,
        isSystem: true,
      })),
    });

    const ownerRole = await tx.role.findFirstOrThrow({
      where: { tenantId, name: "Owner" },
      select: { id: true },
    });

    const membership = await tx.membership.create({
      data: { tenantId, userId: user.id, isOwner: true },
      select: { id: true },
    });

    await tx.membershipRole.create({
      data: { membershipId: membership.id, roleId: ownerRole.id },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: "Tenant",
        entityId: tenantId,
        action: "created",
        actorId: user.id,
        actorName: data.name,
        changes: { name: { from: null, to: data.organisation } },
      },
    });
  });

  return { ok: true as const, userId: user.id, tenantId };
}
