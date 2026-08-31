"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { CompanyDTO } from "@/server/core/company";
import { CompanyForm } from "./company-form";

export function OrganisationSection({
  tenantName,
  userEmail,
  isOwner,
  permissionCount,
  company,
  regionLabel,
  taxIdLabel,
  live,
}: {
  tenantName: string;
  userEmail: string;
  isOwner: boolean;
  permissionCount: number | null;
  company: CompanyDTO | null;
  regionLabel: string;
  taxIdLabel: string;
  live: boolean;
}) {
  const router = useRouter();
  const canWrite = useHasPermission("core:company:write");
  const [open, setOpen] = React.useState(false);

  function handleSaved() {
    toast.success("Organisation updated");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <div className="flex items-center gap-2">
          {live ? (
            <Badge tone="success" dot>
              Live
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Preview
            </Badge>
          )}
          {live && company ? (
            <PermissionGate permission="core:company:write">
              <Button variant="ghost" size="iconSm" aria-label="Edit organisation" onClick={() => setOpen(true)} disabled={!canWrite}>
                <Pencil />
              </Button>
            </PermissionGate>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        <FieldGrid>
          <Field label="Name">{company?.name ?? tenantName}</Field>
          <Field label="Signed in as">{userEmail}</Field>
          <Field label="Role">{isOwner ? "Owner" : live ? "Member" : "—"}</Field>
          <Field label="Permissions granted">{permissionCount !== null ? `${permissionCount}` : "—"}</Field>
          <Field label={taxIdLabel}>{company?.taxId ?? "—"}</Field>
          <Field label={regionLabel}>{company?.region ?? "—"}</Field>
        </FieldGrid>

        {live && company && !company.isTaxReady ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>
              No {regionLabel.toLowerCase()} set. India GST and US sales tax cannot be calculated correctly until this is filled in —
              a sales order for those countries will fail to confirm.
            </span>
          </div>
        ) : null}
      </CardBody>

      {live && company ? (
        <CompanyForm open={open} onOpenChange={setOpen} company={company} regionLabel={regionLabel} taxIdLabel={taxIdLabel} onSaved={handleSaved} />
      ) : null}
    </Card>
  );
}
