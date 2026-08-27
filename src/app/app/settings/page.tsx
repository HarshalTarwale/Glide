import { CheckCircle2, CircleDashed, Database, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getContext } from "@/server/context";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCountry, DEFAULT_COUNTRY } from "@/lib/i18n/countries";
import { SYSTEM_ROLES } from "@/lib/auth/permissions";
import { TaxPreview } from "@/components/erp/tax-preview";
import { resolveRegimeId } from "@/lib/tax";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const dbReady = isDatabaseConfigured();
  const pack = getCountry(ctx?.country ?? DEFAULT_COUNTRY);

  return (
    <>
      <PageHeader
        title="Settings"
        crumbs={[{ label: "Setup" }, { label: "Settings" }]}
        meta="Organisation, localization, roles and access."
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Organisation</CardTitle>
              {ctx ? (
                <Badge tone="success" dot>
                  Live
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Preview
                </Badge>
              )}
            </CardHeader>
            <CardBody>
              <FieldGrid>
                <Field label="Name">{ctx?.tenantName ?? "Northwind Traders"}</Field>
                <Field label="Signed in as">{ctx?.userEmail ?? "—"}</Field>
                <Field label="Role">{ctx?.isOwner ? "Owner" : ctx ? "Member" : "—"}</Field>
                <Field label="Permissions granted">
                  {ctx ? `${ctx.permissions.size}` : "—"}
                </Field>
              </FieldGrid>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Localization</CardTitle>
            </CardHeader>
            <CardBody>
              <FieldGrid>
                <Field label="Country">{pack.name}</Field>
                <Field label="Currency">{pack.currency}</Field>
                <Field label="Tax regime">
                  {pack.taxLabel} <span className="text-ink-subtle">({pack.taxRegime})</span>
                </Field>
                <Field label={pack.taxIdLabel}>—</Field>
                <Field label="Number format">
                  <span className="tnum">
                    {new Intl.NumberFormat(pack.locale, {
                      style: "currency",
                      currency: pack.currency,
                    }).format(320897.27)}
                  </span>
                </Field>
                <Field label="Time zone">{pack.timeZone}</Field>
              </FieldGrid>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tax engine</CardTitle>
              <span className="text-2xs text-ink-subtle">
                Live output for {pack.name} · regime {resolveRegimeId(pack.code)}
              </span>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-xs text-ink-muted">
                Computed by the same engine that will price every invoice. Switch
                country in the top bar to see another regime.
              </p>
              <TaxPreview />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <span className="text-2xs text-ink-subtle">
                Seeded per organisation at sign-up · permissions union across roles
              </span>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-left font-semibold">Role</th>
                  <th className="px-4 py-2 text-left font-semibold">Description</th>
                  <th className="px-4 py-2 text-right font-semibold">Permissions</th>
                  <th className="px-4 py-2 text-left font-semibold">Record scope</th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_ROLES.map((role) => (
                  <tr key={role.name} className="h-row border-b border-hairline last:border-0">
                    <td className="px-4 font-medium text-ink">{role.name}</td>
                    <td className="px-4 text-ink-muted">{role.description}</td>
                    <td className="tnum px-4 text-right text-ink-muted">
                      {role.permissions.length}
                    </td>
                    <td className="px-4">
                      {role.recordScope ? (
                        <Badge tone="accent">{role.recordScope}</Badge>
                      ) : (
                        <span className="text-ink-subtle">All records</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Platform status</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2.5">
              <StatusRow
                icon={Database}
                label="Database"
                ok={dbReady}
                okText="Neon Postgres connected"
                pendingText="Add DATABASE_URL to .env, then run npx prisma migrate deploy"
              />
              <StatusRow
                icon={ShieldCheck}
                label="Tenant isolation (RLS)"
                ok={dbReady}
                okText="Row-Level Security policies applied, FORCE enabled"
                pendingText="Applied by the 00000000000001_rls migration"
              />
              <StatusRow
                icon={Users}
                label="Session"
                ok={Boolean(ctx)}
                okText={`Signed in as ${ctx?.userName ?? ""}`}
                pendingText="Not signed in — screens show demo data"
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatusRow({
  icon: Icon,
  label,
  ok,
  okText,
  pendingText,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ok: boolean;
  okText: string;
  pendingText: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-hairline px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{ok ? okText : pendingText}</div>
      </div>
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <CircleDashed className="size-4 shrink-0 text-ink-subtle" />
      )}
    </div>
  );
}
