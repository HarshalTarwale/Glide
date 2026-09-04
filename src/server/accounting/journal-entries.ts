import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { isBalanced, sumLines } from "@/lib/accounting/journal";
import { nextDocumentNumber } from "@/server/core/numbering";
import type { RequestContext } from "@/server/context";

/**
 * The general ledger. THE non-negotiable rule, per
 * prisma/schema/accounting.prisma's own header comment: a journal entry
 * may only be posted when its debits equal its credits
 * (src/lib/accounting/journal.ts's isBalanced -- checked here, not in a
 * DB trigger, so the same check can run live in the UI while drafting).
 * Posted entries are immutable -- no code path here edits one; a
 * correction is a new, opposite entry, the same discipline as every other
 * posted document in this codebase.
 */

export interface JournalEntryLineDTO {
  id: string;
  sequence: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  debit: number;
  credit: number;
  partnerId: string | null;
}

export interface JournalEntryDTO {
  id: string;
  number: string;
  date: string;
  description: string;
  status: "draft" | "posted";
  postedAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  totalDebit: number;
  totalCredit: number;
  lines: JournalEntryLineDTO[];
}

export interface JournalEntryListItemDTO {
  id: string;
  number: string;
  date: string;
  description: string;
  status: "draft" | "posted";
  sourceType: string | null;
  total: number;
}

const SEARCH_FIELDS = ["number", "description"];
const ALLOWED_FIELDS = ["number", "date", "status"];

const journalLineInputSchema = z.object({
  accountId: z.uuid(),
  description: z.string().max(500).nullish(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  partnerId: z.uuid().nullish(),
});

export const createJournalEntryInputSchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1, "A description is required").max(500),
  lines: z.array(journalLineInputSchema).min(2, "A journal entry needs at least two lines"),
});
export type CreateJournalEntryInput = z.infer<typeof createJournalEntryInputSchema>;

/* ------------------------------------------------------------------ */
/* Shared internal primitive -- also used by gl-subscriber.ts           */
/* ------------------------------------------------------------------ */

export interface PostJournalEntryArgs {
  tenantId: string;
  companyId: string;
  date: Date;
  description: string;
  sourceType?: string;
  sourceId?: string;
  createdBy?: string;
  lines: { accountId: string; debit: number; credit: number; description?: string | null; partnerId?: string | null }[];
}

/**
 * Creates a journal entry ALREADY POSTED -- the same "created already
 * final" shape as P3's Delivery and P4's CreditNote, used for every
 * auto-posted entry (gl-subscriber.ts) since nothing about "invoice #123
 * was posted" is ever a draft fact. Manual entries go through
 * createJournalEntry() below instead, which supports an actual draft
 * state for someone building an entry by hand.
 *
 * Throws (never silently no-ops) if the lines don't balance -- the one
 * invariant this whole module exists to enforce.
 */
export async function postJournalEntryDirect(tx: TenantTransaction, args: PostJournalEntryArgs): Promise<string> {
  if (!isBalanced(args.lines)) {
    const { totalDebit, totalCredit } = sumLines(args.lines);
    throw new Error(`Journal entry does not balance: debit ${totalDebit} vs credit ${totalCredit}.`);
  }

  const number = await nextDocumentNumber(tx, args.tenantId, args.companyId, "journal_entry");
  const now = new Date();

  const entry = await tx.journalEntry.create({
    data: {
      tenantId: args.tenantId,
      companyId: args.companyId,
      number,
      date: args.date,
      description: args.description,
      status: "posted",
      postedAt: now,
      sourceType: args.sourceType ?? null,
      sourceId: args.sourceId ?? null,
      createdBy: args.createdBy ?? null,
    },
  });

  let sequence = 1;
  for (const line of args.lines) {
    await tx.journalEntryLine.create({
      data: {
        tenantId: args.tenantId,
        journalEntryId: entry.id,
        sequence: sequence++,
        accountId: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
        partnerId: line.partnerId ?? null,
      },
    });
  }

  return entry.id;
}

/* ------------------------------------------------------------------ */
/* Manual entries                                                       */
/* ------------------------------------------------------------------ */

export async function createJournalEntry(ctx: RequestContext, input: CreateJournalEntryInput): Promise<string> {
  assertPermission(ctx.permissions, "accounting:journal:write");
  const data = createJournalEntryInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "journal_entry");

    const entry = await tx.journalEntry.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        date: data.date,
        description: data.description,
        status: "draft",
        createdBy: ctx.userId,
      },
    });

    let sequence = 1;
    for (const line of data.lines) {
      await tx.journalEntryLine.create({
        data: {
          tenantId: ctx.tenantId,
          journalEntryId: entry.id,
          sequence: sequence++,
          accountId: line.accountId,
          description: line.description ?? null,
          debit: line.debit,
          credit: line.credit,
          partnerId: line.partnerId ?? null,
        },
      });
    }

    return entry.id;
  });
}

export async function updateJournalEntryLines(ctx: RequestContext, entryId: string, input: CreateJournalEntryInput): Promise<void> {
  assertPermission(ctx.permissions, "accounting:journal:write");
  const data = createJournalEntryInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.status !== "draft") {
      throw new Error("Only a draft journal entry can be edited. A posted entry is immutable -- create a reversing entry instead.");
    }

    await tx.journalEntryLine.deleteMany({ where: { journalEntryId: entryId } });
    let sequence = 1;
    for (const line of data.lines) {
      await tx.journalEntryLine.create({
        data: {
          tenantId: ctx.tenantId,
          journalEntryId: entryId,
          sequence: sequence++,
          accountId: line.accountId,
          description: line.description ?? null,
          debit: line.debit,
          credit: line.credit,
          partnerId: line.partnerId ?? null,
        },
      });
    }
    await tx.journalEntry.update({ where: { id: entryId }, data: { date: data.date, description: data.description } });
  });
}

export async function postJournalEntry(ctx: RequestContext, entryId: string): Promise<void> {
  assertPermission(ctx.permissions, "accounting:journal:post");

  await withTenant(ctx.tenantId, async (tx) => {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
    if (entry.status !== "draft") {
      throw new Error(`Only a draft entry can be posted (this one is ${entry.status}).`);
    }

    const lines = entry.lines.map((l) => ({ debit: Number(l.debit.toString()), credit: Number(l.credit.toString()) }));
    if (!isBalanced(lines)) {
      const { totalDebit, totalCredit } = sumLines(lines);
      throw new Error(`This entry does not balance: debit ${totalDebit} vs credit ${totalCredit}. Fix the lines before posting.`);
    }

    await tx.journalEntry.update({ where: { id: entryId }, data: { status: "posted", postedAt: new Date() } });
  });
}

export async function deleteJournalEntry(ctx: RequestContext, entryId: string): Promise<void> {
  assertPermission(ctx.permissions, "accounting:journal:write");

  await withTenant(ctx.tenantId, async (tx) => {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.status !== "draft") {
      throw new Error("Only a draft journal entry can be deleted. A posted entry is immutable -- create a reversing entry instead.");
    }
    await tx.journalEntry.delete({ where: { id: entryId } });
  });
}

/* ------------------------------------------------------------------ */
/* Queries                                                              */
/* ------------------------------------------------------------------ */

export async function listJournalEntries(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<JournalEntryListItemDTO>> {
  assertPermission(ctx.permissions, "accounting:journal:read");

  const effectiveQuery = query.sort.length === 0 ? { ...query, sort: [{ field: "date", dir: "desc" as const }] } : query;
  const compiled = compileQuery(effectiveQuery, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.journalEntry.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: { lines: { select: { debit: true } } },
      }),
      tx.journalEntry.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        date: r.date.toISOString(),
        description: r.description,
        status: r.status,
        sourceType: r.sourceType,
        total: r.lines.reduce((s, l) => s + Number(l.debit.toString()), 0),
      })),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getJournalEntry(ctx: RequestContext, id: string): Promise<JournalEntryDTO | null> {
  assertPermission(ctx.permissions, "accounting:journal:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const entry = await tx.journalEntry.findUnique({
      where: { id },
      include: { lines: { orderBy: { sequence: "asc" }, include: { account: { select: { code: true, name: true } } } } },
    });
    if (!entry) return null;

    const lines = entry.lines.map((l) => ({
      id: l.id,
      sequence: l.sequence,
      accountId: l.accountId,
      accountCode: l.account.code,
      accountName: l.account.name,
      description: l.description,
      debit: Number(l.debit.toString()),
      credit: Number(l.credit.toString()),
      partnerId: l.partnerId,
    }));

    return {
      id: entry.id,
      number: entry.number,
      date: entry.date.toISOString(),
      description: entry.description,
      status: entry.status,
      postedAt: entry.postedAt?.toISOString() ?? null,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      totalDebit: lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: lines.reduce((s, l) => s + l.credit, 0),
      lines,
    };
  });
}
