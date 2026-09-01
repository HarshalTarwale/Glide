import {
  Boxes,
  Package,
  Warehouse,
  Building2,
  Contact,
  FileText,
  History,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission required to see this item -- enforced server-side too. */
  permission?: string;
  /** Not built yet; shown greyed so the roadmap is visible in the product. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Four levels of navigation, never more: Company -> Module -> Section -> Record.
 * Anything deeper is reached by filtering a list, not by another nav tier.
 * That is what keeps an ERP navigable at 200+ screens.
 */
export const NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Overview", href: "/app", icon: LayoutDashboard },
      { label: "Inventory", href: "/app/inventory", icon: Boxes, permission: "inventory:product:read" },
      { label: "Stock", href: "/app/inventory/stock", icon: Package, permission: "inventory:stock:read" },
      { label: "Warehouses", href: "/app/inventory/warehouses", icon: Warehouse, permission: "inventory:warehouse:read" },
      { label: "Sales", href: "/app/sales", icon: ShoppingCart, permission: "sales:order:read" },
      { label: "Purchases", href: "/app/purchases", icon: Truck, soon: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/app/invoices", icon: Receipt, permission: "invoicing:invoice:read" },
      { label: "Payments", href: "/app/payments", icon: Wallet, permission: "invoicing:payment:read" },
      { label: "AR Aging", href: "/app/invoices/aging", icon: FileText, permission: "invoicing:invoice:read" },
    ],
  },
  {
    label: "Relationships",
    items: [
      { label: "Contacts", href: "/app/contacts", icon: Contact, permission: "core:partner:read" },
      { label: "CRM", href: "/app/crm", icon: Users, soon: true },
    ],
  },
  {
    label: "People",
    items: [{ label: "HR", href: "/app/hr", icon: Building2, soon: true }],
  },
  {
    label: "Setup",
    items: [
      { label: "Reports", href: "/app/reports", icon: FileText, soon: true },
      { label: "Audit Log", href: "/app/audit", icon: History, permission: "core:audit:read" },
      { label: "Settings", href: "/app/settings", icon: Settings, permission: "core:settings:read" },
    ],
  },
];
