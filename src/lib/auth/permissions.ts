/**
 * The permission model. Four layers, per docs/architecture.md §2.3.
 *
 *   Layer 1  Groups          — Membership -> Role[]  (this file: PERMISSIONS union)
 *   Layer 2  Entity access   — `module:resource:action` strings (this file)
 *   Layer 3  Record scope    — a predicate per role (this file: RECORD_SCOPES)
 *   Layer 4  Field visibility— DTO serializer, arrives in P3 with margin fields
 *
 * A generic admin panel has only layer 2. Enterprise buyers ask about 3 and 4
 * during procurement ("reps see only their own accounts", "warehouse must not
 * see margin"), which is why the seams exist from day one.
 */

/** `module:resource:action` */
export type Permission = string;

export const PERMISSIONS = {
  core: {
    settings: ["core:settings:read", "core:settings:write"],
    member: ["core:member:read", "core:member:invite", "core:member:remove"],
    role: ["core:role:read", "core:role:write"],
    company: ["core:company:read", "core:company:write"],
    partner: ["core:partner:read", "core:partner:write"],
    audit: ["core:audit:read"],
  },
  inventory: {
    product: ["inventory:product:read", "inventory:product:write"],
    stock: ["inventory:stock:read", "inventory:stock:move", "inventory:stock:adjust"],
    warehouse: ["inventory:warehouse:read", "inventory:warehouse:write"],
  },
  sales: {
    order: [
      "sales:order:read",
      "sales:order:write",
      "sales:order:confirm",
      "sales:order:cancel",
    ],
  },
  invoicing: {
    invoice: [
      "invoicing:invoice:read",
      "invoicing:invoice:write",
      "invoicing:invoice:post",
      "invoicing:invoice:cancel",
    ],
    payment: ["invoicing:payment:read", "invoicing:payment:write"],
  },
} as const;

/** Flat list of every permission the system knows about. */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS).flatMap((module) =>
  Object.values(module).flatMap((group) => [...group])
);

/* ------------------------------------------------------------------ */
/* Layer 3 — record scope                                              */
/* ------------------------------------------------------------------ */

/**
 * Named predicates applied ALONGSIDE the RLS tenant predicate. A role with
 * `recordScope: "own_records"` sees only rows it owns, within its tenant.
 *
 * `null` means no additional restriction beyond tenant isolation.
 */
export type RecordScopeId = "own_records" | "own_warehouse";

export interface ScopeContext {
  userId: string;
  warehouseIds: string[];
}

/**
 * Compiles a record scope into a Prisma `where` fragment. Modules opt in by
 * declaring which of their fields carry ownership.
 */
export function recordScopeWhere(
  scope: RecordScopeId | null | undefined,
  ctx: ScopeContext,
  fields: { ownerField?: string; warehouseField?: string }
): Record<string, unknown> {
  if (!scope) return {};
  if (scope === "own_records" && fields.ownerField) {
    return { [fields.ownerField]: ctx.userId };
  }
  if (scope === "own_warehouse" && fields.warehouseField) {
    return { [fields.warehouseField]: { in: ctx.warehouseIds } };
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Built-in roles                                                      */
/* ------------------------------------------------------------------ */

export interface SystemRole {
  name: string;
  description: string;
  permissions: Permission[];
  recordScope: RecordScopeId | null;
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    name: "Owner",
    description: "Full access to everything, including billing and deletion.",
    permissions: ALL_PERMISSIONS,
    recordScope: null,
  },
  {
    name: "Administrator",
    description: "Full operational access. Cannot delete the organisation.",
    permissions: ALL_PERMISSIONS,
    recordScope: null,
  },
  {
    name: "Sales Manager",
    description: "Full sales and invoicing access across the whole team.",
    permissions: [
      ...PERMISSIONS.core.partner,
      ...PERMISSIONS.sales.order,
      ...PERMISSIONS.invoicing.invoice,
      ...PERMISSIONS.invoicing.payment,
      "inventory:product:read",
      "inventory:stock:read",
      "inventory:warehouse:read",
      "core:member:read",
    ],
    recordScope: null,
  },
  {
    name: "Sales Representative",
    description: "Own orders only. Cannot cancel a confirmed order.",
    permissions: [
      "core:partner:read",
      "core:partner:write",
      "sales:order:read",
      "sales:order:write",
      "sales:order:confirm",
      "inventory:product:read",
      "inventory:stock:read",
      "invoicing:invoice:read",
    ],
    // Layer 3 in action: same permissions, narrower row set.
    recordScope: "own_records",
  },
  {
    name: "Warehouse",
    description: "Stock movements and deliveries. No pricing, no invoices.",
    permissions: [
      "inventory:product:read",
      "inventory:stock:read",
      "inventory:stock:move",
      "inventory:stock:adjust",
      "inventory:warehouse:read",
      "sales:order:read",
    ],
    recordScope: "own_warehouse",
  },
  {
    name: "Accountant",
    description: "Invoicing and payments. Read-only on operations.",
    permissions: [
      ...PERMISSIONS.invoicing.invoice,
      ...PERMISSIONS.invoicing.payment,
      "core:partner:read",
      "sales:order:read",
      "inventory:product:read",
      "core:audit:read",
    ],
    recordScope: null,
  },
  {
    name: "Viewer",
    description: "Read-only across the product.",
    permissions: ALL_PERMISSIONS.filter((p) => p.endsWith(":read")),
    recordScope: null,
  },
];

/* ------------------------------------------------------------------ */
/* Checking                                                            */
/* ------------------------------------------------------------------ */

/**
 * UNION semantics, matching Odoo and confirmed in Stage 1 research: a user
 * holding several roles gets everything any of them grants, never the
 * intersection. Someone who is both "Sales Rep" and "Warehouse" can do both.
 */
export function unionPermissions(roles: { permissions: string[] }[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of role.permissions) out.add(p);
  return out;
}

export function hasPermission(granted: Set<Permission>, required: Permission): boolean {
  return granted.has(required);
}

/** Thrown by assertPermission; mapped to 403 by the REST layer. */
export class PermissionError extends Error {
  constructor(public readonly required: Permission) {
    super(`Missing permission: ${required}`);
    this.name = "PermissionError";
  }
}

/**
 * The server-side gate. Called at the top of every service function, before
 * validation and before any query. The client-side <PermissionGate> is UX;
 * THIS is the security boundary.
 */
export function assertPermission(granted: Set<Permission>, required: Permission): void {
  if (!hasPermission(granted, required)) throw new PermissionError(required);
}
