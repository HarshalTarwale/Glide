import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PermissionError,
  SYSTEM_ROLES,
  assertPermission,
  recordScopeWhere,
  unionPermissions,
} from "@/lib/auth/permissions";

describe("permission union", () => {
  it("unions across roles rather than intersecting", () => {
    // Matches Odoo, per Stage 1 research: someone who is both a Sales Rep and
    // Warehouse can do everything either role allows.
    const rep = SYSTEM_ROLES.find((r) => r.name === "Sales Representative")!;
    const warehouse = SYSTEM_ROLES.find((r) => r.name === "Warehouse")!;

    const granted = unionPermissions([
      { permissions: [...rep.permissions] },
      { permissions: [...warehouse.permissions] },
    ]);

    expect(granted.has("sales:order:write")).toBe(true);
    expect(granted.has("inventory:stock:adjust")).toBe(true);
  });

  it("does not grant what no role holds", () => {
    const viewer = SYSTEM_ROLES.find((r) => r.name === "Viewer")!;
    const granted = unionPermissions([{ permissions: [...viewer.permissions] }]);
    expect(granted.has("sales:order:read")).toBe(true);
    expect(granted.has("sales:order:cancel")).toBe(false);
  });
});

describe("assertPermission", () => {
  it("throws PermissionError when the permission is missing", () => {
    const granted = new Set(["sales:order:read"]);
    expect(() => assertPermission(granted, "sales:order:cancel")).toThrow(PermissionError);
    expect(() => assertPermission(granted, "sales:order:read")).not.toThrow();
  });
});

describe("system roles", () => {
  it("only reference permissions that exist", () => {
    const known = new Set(ALL_PERMISSIONS);
    for (const role of SYSTEM_ROLES) {
      for (const p of role.permissions) {
        expect(known.has(p), `${role.name} references unknown permission ${p}`).toBe(true);
      }
    }
  });

  it("gives Viewer read-only access", () => {
    const viewer = SYSTEM_ROLES.find((r) => r.name === "Viewer")!;
    expect(viewer.permissions.every((p) => p.endsWith(":read"))).toBe(true);
  });
});

describe("record scope (permission layer 3)", () => {
  const ctx = { userId: "u1", warehouseIds: ["w1", "w2"] };

  it("returns no extra predicate when the role has no scope", () => {
    expect(recordScopeWhere(null, ctx, { ownerField: "salespersonId" })).toEqual({});
  });

  it("narrows to owned records", () => {
    expect(recordScopeWhere("own_records", ctx, { ownerField: "salespersonId" })).toEqual({
      salespersonId: "u1",
    });
  });

  it("narrows to the user's warehouses", () => {
    expect(recordScopeWhere("own_warehouse", ctx, { warehouseField: "warehouseId" })).toEqual({
      warehouseId: { in: ["w1", "w2"] },
    });
  });
});
