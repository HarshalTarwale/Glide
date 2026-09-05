import "server-only";

import { randomUUID } from "node:crypto";
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
 *
 * The row-creation step below is raw SQL with `ON CONFLICT DO NOTHING` for
 * the same atomicity reason, NOT Prisma's `.upsert()`: inside an existing
 * interactive transaction, upsert is not guaranteed to compile to a single
 * atomic statement, and two transactions concurrently creating a company's
 * FIRST document of a fiscal year (e.g. two invoices raised in the same
 * moment) can both see "no row yet" and both attempt the INSERT, one of
 * them failing on the unique constraint instead of proceeding. This was
 * caught by tests/invoicing.test.ts creating three invoices concurrently --
 * a real scenario (two users, same instant), not a test artifact.
 */

const PREFIX: Record<string, string> = {
  sales_order: "SO",
  delivery: "DO",
  invoice: "INV",
  credit_note: "CN",
  payment: "PAY",
  journal_entry: "JE",
  purchase_order: "PO",
  receipt: "GR",
  bill: "BILL",
  bill_payment: "BPAY",
  work_order: "WO",
};

export async function nextDocumentNumber(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  docType: string,
  fiscalYear: number = new Date().getFullYear()
): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO number_sequence ("id", "tenantId", "companyId", "docType", "fiscalYear", "prefix", "padding", "next", "createdAt", "updatedAt")
    VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${companyId}::uuid, ${docType}, ${fiscalYear}, ${PREFIX[docType] ?? docType.toUpperCase()}, 4, 1, now(), now())
    ON CONFLICT ("companyId", "docType", "fiscalYear") DO NOTHING
  `;

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
