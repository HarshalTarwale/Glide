import "server-only";

import type { TenantTransaction } from "@/lib/db/tenant-client";

/**
 * Document numbering, per company / doc type / fiscal year -- the first
 * real use of the NumberSequence model P0's schema shipped with.
 *
 * Gapless within a series (required for tax compliance in India and the
 * EU): the increment happens via an atomic UPDATE ... RETURNING inside the
 * caller's existing transaction, so two concurrent order creations cannot
 * both read `next = 42` and both mint "SO-0042" -- the second writer blocks
 * on the row lock implicit in the UPDATE until the first commits.
 */

const PREFIX: Record<string, string> = {
  sales_order: "SO",
  delivery: "DO",
};

export async function nextDocumentNumber(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  docType: string,
  fiscalYear: number = new Date().getFullYear()
): Promise<string> {
  await tx.numberSequence.upsert({
    where: { companyId_docType_fiscalYear: { companyId, docType, fiscalYear } },
    update: {},
    create: { tenantId, companyId, docType, fiscalYear, prefix: PREFIX[docType] ?? docType.toUpperCase(), next: 1 },
  });

  // Prisma has no UPDATE ... RETURNING helper, so this is raw SQL for the
  // atomicity, not for expressiveness: increment and read the PRE-increment
  // value in one round trip, under the row lock the UPDATE itself takes.
  const rows = await tx.$queryRaw<{ prefix: string; padding: number; taken: number }[]>`
    UPDATE number_sequence
    SET "next" = "next" + 1, "updatedAt" = now()
    WHERE "companyId" = ${companyId}::uuid AND "docType" = ${docType} AND "fiscalYear" = ${fiscalYear}
    RETURNING prefix, padding, "next" - 1 AS taken
  `;

  const row = rows[0];
  // Defensive Number() coercion: driver-level int parsing for a computed
  // expression column is not worth trusting blindly for a value that ends
  // up on every printed document number.
  const number = String(Number(row.taken)).padStart(row.padding, "0");
  return `${row.prefix}-${fiscalYear}-${number}`;
}
