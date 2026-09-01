"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, ClipboardEdit, PackagePlus, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Money } from "@/components/erp/money";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/layout/session-context";
import type { StockLevelDTO } from "@/server/inventory/stock";
import type { StockFormOptions } from "@/server/inventory/stock-options";
import type { LotDTO } from "@/server/inventory/lots";
import type { ReorderRuleDTO } from "@/server/inventory/reorder-rules";
import { StockMoveForm } from "./stock-move-form";
import { LevelsTab } from "./levels-tab";
import { LotsTab } from "./lots-tab";
import { ReorderRulesTab } from "./reorder-rules-tab";

type MoveKind = "receipt" | "delivery" | "transfer" | "adjustment";

export function StockPageView({
  levels,
  lots,
  reorderRules,
  options,
  live,
}: {
  levels: StockLevelDTO[];
  lots: LotDTO[];
  reorderRules: ReorderRuleDTO[];
  options: StockFormOptions;
  live: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [formKind, setFormKind] = React.useState<MoveKind>("receipt");

  function openForm(kind: MoveKind) {
    setFormKind(kind);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success("Stock move recorded");
    router.refresh();
  }

  // null when the viewer's role can't see cost/valuation data at all (Layer
  // 4 -- see lib/auth/permissions.ts's canSeeCost), not when it's merely
  // zero -- summing nulls as 0 would silently show "$0 total value" to a
  // Warehouse-role user instead of hiding the figure.
  const totalValue = levels.some((l) => l.value === null) ? null : levels.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const lowCount = levels.filter((l) => l.isLow).length;

  return (
    <>
      <PageHeader
        title="Stock"
        crumbs={[{ label: "Inventory", href: "/app/inventory" }, { label: "Stock" }]}
        meta={
          live ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                On-hand across all warehouses
                {totalValue !== null ? (
                  <>
                    {" "}
                    · total value <Money value={totalValue} className="font-medium" />
                  </>
                ) : null}
              </span>
              {lowCount > 0 ? (
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="size-3.5" />
                  {lowCount} {lowCount === 1 ? "product" : "products"} below reorder point
                </span>
              ) : null}
            </span>
          ) : (
            "Demo stock — connect a database to record real moves."
          )
        }
        actions={
          <PermissionGate permission="inventory:stock:move">
            <Button variant="secondary" size="md" onClick={() => openForm("transfer")} disabled={!live}>
              <ArrowRightLeft />
              Transfer
            </Button>
            <PermissionGate permission="inventory:stock:adjust">
              <Button variant="secondary" size="md" onClick={() => openForm("adjustment")} disabled={!live}>
                <ClipboardEdit />
                Adjust
              </Button>
            </PermissionGate>
            <Button variant="secondary" size="md" onClick={() => openForm("delivery")} disabled={!live}>
              <Truck />
              Deliver
            </Button>
            <Button variant="primary" size="md" onClick={() => openForm("receipt")} disabled={!live}>
              <PackagePlus />
              Receive
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="levels" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-6">
            <TabsTrigger value="levels">Levels</TabsTrigger>
            <TabsTrigger value="lots">Lots &amp; serials</TabsTrigger>
            <TabsTrigger value="reorder">Reorder rules</TabsTrigger>
          </TabsList>

          <TabsContent value="levels" className="min-h-0 flex-1 overflow-auto pt-0">
            <LevelsTab levels={levels} live={live} />
          </TabsContent>
          <TabsContent value="lots" className="min-h-0 flex-1 overflow-auto pt-0">
            <LotsTab lots={lots} live={live} />
          </TabsContent>
          <TabsContent value="reorder" className="min-h-0 flex-1 overflow-auto pt-0">
            <ReorderRulesTab rules={reorderRules} options={options} warehouses={options.warehouses} live={live} />
          </TabsContent>
        </Tabs>
      </div>

      {live ? (
        <StockMoveForm open={formOpen} onOpenChange={setFormOpen} options={options} defaultKind={formKind} onSaved={handleSaved} />
      ) : null}
    </>
  );
}
