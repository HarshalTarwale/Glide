/**
 * Mock data for the Stage 2 design-system screens ONLY.
 * Deleted in P3 when the Sales module gets a real service layer and schema.
 * It exists so the components can be judged against realistic content --
 * long customer names, big numbers, every status -- rather than lorem ipsum.
 */

export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "partially_delivered"
  | "delivered"
  | "invoiced"
  | "cancelled";

export interface SalesOrder extends Record<string, unknown> {
  id: string;
  number: string;
  customer: string;
  orderDate: string;
  deliveryDate: string;
  status: SalesOrderStatus;
  salesperson: string;
  warehouse: string;
  /** Line-level roll-ups. Header status is DERIVED from these, never stored
   *  as the source of truth -- the Stage 1 finding on partial fulfilment. */
  qtyOrdered: number;
  qtyDelivered: number;
  qtyInvoiced: number;
  subtotal: number;
  tax: number;
  total: number;
}

const CUSTOMERS = [
  "Acme Industrial Supplies",
  "Nexa Retail Pvt Ltd",
  "Vertex Manufacturing",
  "Orbit Logistics",
  "Kite & Co Trading",
  "Meridian Foods",
  "Halcyon Electricals",
  "Blue Harbour Imports",
  "Sterling Components",
  "Pinnacle Distribution",
  "Cobalt Engineering Works",
  "Juniper Home Goods",
];

const PEOPLE = ["A. Hazari", "R. Menon", "S. Iyer", "D. Kapoor", "M. Fernandes"];
const WAREHOUSES = ["Main Warehouse", "Pune DC", "Chennai Hub"];
const STATUSES: SalesOrderStatus[] = [
  "draft",
  "confirmed",
  "partially_delivered",
  "delivered",
  "invoiced",
  "cancelled",
];

/** Deterministic pseudo-random so the list is stable across renders/SSR. */
function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const SALES_ORDERS: SalesOrder[] = Array.from({ length: 137 }, (_, i) => {
  const r = (k: number) => seeded(i * 7 + k);
  const status = STATUSES[Math.floor(r(1) * STATUSES.length)];
  const qtyOrdered = Math.floor(r(2) * 400) + 10;
  const qtyDelivered =
    status === "draft" || status === "cancelled"
      ? 0
      : status === "partially_delivered"
        ? Math.floor(qtyOrdered * 0.45)
        : qtyOrdered;
  const qtyInvoiced = status === "invoiced" ? qtyOrdered : status === "delivered" ? Math.floor(qtyOrdered * 0.5) : 0;
  const subtotal = Math.round((r(3) * 480000 + 4000) * 100) / 100;
  const tax = Math.round(subtotal * 0.18 * 100) / 100;

  const day = 1 + Math.floor(r(4) * 27);
  const month = 1 + Math.floor(r(5) * 8);

  return {
    id: `so_${1000 + i}`,
    number: `SO-${1042 - i}`,
    customer: CUSTOMERS[Math.floor(r(6) * CUSTOMERS.length)],
    orderDate: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    deliveryDate: `2026-${String(month).padStart(2, "0")}-${String(Math.min(28, day + 5)).padStart(2, "0")}`,
    status,
    salesperson: PEOPLE[Math.floor(r(7) * PEOPLE.length)],
    warehouse: WAREHOUSES[Math.floor(r(8) * WAREHOUSES.length)],
    qtyOrdered,
    qtyDelivered,
    qtyInvoiced,
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
  };
});

export const STATUS_META: Record<
  SalesOrderStatus,
  { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "info" },
  partially_delivered: { label: "Part. delivered", tone: "warning" },
  delivered: { label: "Delivered", tone: "accent" },
  invoiced: { label: "Invoiced", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** The server-defined lifecycle the StatusStepper renders. */
export const SALES_ORDER_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed" },
  { id: "delivered", label: "Delivered" },
  { id: "invoiced", label: "Invoiced" },
];
