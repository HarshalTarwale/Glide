import { describe, expect, it } from "vitest";
import { compileQuery } from "@/lib/query/prisma-query";
import { EMPTY_QUERY, type RecordQuery } from "@/lib/query/record-query";

const OPTIONS = {
  searchFields: ["name", "sku"],
  allowedFields: ["name", "sku", "isActive", "salesPrice", "category.name"],
};

const q = (over: Partial<RecordQuery> = {}): RecordQuery => ({ ...EMPTY_QUERY, ...over });

describe("compileQuery", () => {
  it("returns an empty where for an empty query", () => {
    const out = compileQuery(q(), OPTIONS);
    expect(out.where).toEqual({});
    expect(out.skip).toBe(0);
    expect(out.take).toBe(50);
  });

  it("expands search across every configured field with OR", () => {
    const out = compileQuery(q({ search: "bearing" }), OPTIONS);
    expect(out.where).toEqual({
      OR: [
        { name: { contains: "bearing", mode: "insensitive" } },
        { sku: { contains: "bearing", mode: "insensitive" } },
      ],
    });
  });

  it("ANDs multiple filters together", () => {
    const out = compileQuery(
      q({
        filters: [
          { field: "isActive", op: "eq", value: true },
          { field: "salesPrice", op: "gte", value: 100 },
        ],
      }),
      OPTIONS
    );
    expect(out.where).toEqual({
      AND: [{ isActive: true }, { salesPrice: { gte: 100 } }],
    });
  });

  it("nests dotted paths so relations filter naturally", () => {
    const out = compileQuery(
      q({ filters: [{ field: "category.name", op: "eq", value: "Bearings" }] }),
      OPTIONS
    );
    expect(out.where).toEqual({ category: { name: "Bearings" } });
  });

  it("drops filters on fields outside the whitelist", () => {
    // A RecordQuery comes from the URL, so it is user input. An unchecked
    // field name is a path to a column the caller was never granted.
    const out = compileQuery(
      q({
        filters: [
          { field: "costPrice", op: "gt", value: 0 },
          { field: "isActive", op: "eq", value: true },
        ],
      }),
      OPTIONS
    );
    expect(out.where).toEqual({ isActive: true });
  });

  it("drops sorts on fields outside the whitelist", () => {
    const out = compileQuery(q({ sort: [{ field: "costPrice", dir: "desc" }] }), OPTIONS);
    expect(out.orderBy).toEqual([{ id: "asc" }]);
  });

  it("always appends a stable tiebreaker to orderBy", () => {
    // Without one, rows with equal sort keys swap between pages and a user
    // paging a list sees one record twice and misses another entirely.
    const out = compileQuery(q({ sort: [{ field: "name", dir: "asc" }] }), OPTIONS);
    expect(out.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("ANDs a record scope into every query", () => {
    const out = compileQuery(q({ search: "x" }), {
      ...OPTIONS,
      scope: { salespersonId: "u1" },
    });
    expect(out.where).toEqual({
      AND: [
        { salespersonId: "u1" },
        { OR: [{ name: { contains: "x", mode: "insensitive" } }, { sku: { contains: "x", mode: "insensitive" } }] },
      ],
    });
  });

  it("translates every operator", () => {
    const cases: [RecordQuery["filters"][number], unknown][] = [
      [{ field: "name", op: "eq", value: "a" }, { name: "a" }],
      [{ field: "name", op: "neq", value: "a" }, { name: { not: "a" } }],
      [{ field: "salesPrice", op: "gt", value: 1 }, { salesPrice: { gt: 1 } }],
      [{ field: "salesPrice", op: "lte", value: 9 }, { salesPrice: { lte: 9 } }],
      [{ field: "sku", op: "in", value: ["a", "b"] }, { sku: { in: ["a", "b"] } }],
      [{ field: "salesPrice", op: "between", value: [1, 5] }, { salesPrice: { gte: 1, lte: 5 } }],
      [{ field: "name", op: "isNull" }, { name: null }],
      [{ field: "name", op: "notNull" }, { name: { not: null } }],
    ];

    for (const [filter, expected] of cases) {
      expect(compileQuery(q({ filters: [filter] }), OPTIONS).where).toEqual(expected);
    }
  });

  it("ignores malformed operator payloads instead of throwing", () => {
    const out = compileQuery(
      q({ filters: [{ field: "salesPrice", op: "between", value: [1] }] }),
      OPTIONS
    );
    expect(out.where).toEqual({});
  });

  it("paginates correctly", () => {
    const out = compileQuery(q({ page: 3, pageSize: 25 }), OPTIONS);
    expect(out.skip).toBe(50);
    expect(out.take).toBe(25);
  });

  it("clamps page size so a URL cannot request the whole table", () => {
    const out = compileQuery(q({ pageSize: 100000 }), OPTIONS);
    expect(out.take).toBe(200);
  });

  it("clamps a nonsensical page number rather than sending a negative skip", () => {
    const out = compileQuery(q({ page: 0 }), OPTIONS);
    expect(out.skip).toBe(0);
  });
});
